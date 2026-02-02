import { useCallback, useMemo, useEffect, useRef, memo, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { OptimizedPhotoCard } from "./OptimizedPhotoCard";
import { prefetchImages } from "@/lib/imageCache";
import { trackScrollPerformance, logTimeToFirstThumbnails } from "@/lib/performanceMetrics";
import { getProxyUrl } from "@/lib/utils";
import { Camera, Loader2 } from "lucide-react";
import type { Photo } from "@shared/schema";
import { logRouteMount, logRouteUnmount, logRenderedItems, logEventListener, logComponentRender } from "@/lib/debugPerf";

interface PhotoGroup {
  type: 'month-header' | 'day-header' | 'photo-row';
  monthKey?: string;
  monthDate?: Date;
  dayKey?: string;
  photos?: Photo[];
}

interface VirtualizedPhotoGridProps {
  photos: Photo[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  tileSize: 'small' | 'medium' | 'large';
  isSelectMode: boolean;
  selectedPhotos: Set<number>;
  onSelectPhoto: (id: number) => void;
  onPhotoClick: (photo: Photo, index: number) => void;
  onDeletePhoto: (id: number) => void;
}

function getGridColumns(tileSize: 'small' | 'medium' | 'large'): number {
  if (typeof window === 'undefined') return 4;
  const width = window.innerWidth;
  
  if (tileSize === 'small') {
    if (width >= 1024) return 8;
    if (width >= 768) return 6;
    return 4;
  } else if (tileSize === 'medium') {
    if (width >= 1024) return 5;
    if (width >= 768) return 4;
    return 2;
  } else {
    if (width >= 1024) return 3;
    if (width >= 768) return 2;
    return 1;
  }
}

function groupPhotosByDate(photos: Photo[]): Map<string, { monthDate: Date; days: Map<string, Photo[]> }> {
  const monthMap = new Map<string, { monthDate: Date; days: Map<string, Photo[]> }>();

  photos.forEach((photo) => {
    const date = new Date(photo.displayDate || photo.takenAt || photo.createdAt || 0);
    const monthKey = format(date, "MMMM yyyy");
    const dayKey = format(date, "EEEE, MMMM d, yyyy");

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { monthDate: date, days: new Map() });
    }

    const monthData = monthMap.get(monthKey)!;
    if (!monthData.days.has(dayKey)) {
      monthData.days.set(dayKey, []);
    }
    monthData.days.get(dayKey)!.push(photo);
  });

  return monthMap;
}

function buildVirtualItems(
  photos: Photo[],
  columnsCount: number
): { items: PhotoGroup[]; flatIndexMap: Map<number, number> } {
  const monthMap = groupPhotosByDate(photos);
  const items: PhotoGroup[] = [];
  const flatIndexMap = new Map<number, number>();
  let flatIndex = 0;

  monthMap.forEach((monthData, monthKey) => {
    items.push({ type: 'month-header', monthKey, monthDate: monthData.monthDate });

    monthData.days.forEach((dayPhotos, dayKey) => {
      items.push({ type: 'day-header', dayKey });

      for (let i = 0; i < dayPhotos.length; i += columnsCount) {
        const rowPhotos = dayPhotos.slice(i, i + columnsCount);
        rowPhotos.forEach((photo) => {
          flatIndexMap.set(photo.id, flatIndex++);
        });
        items.push({ type: 'photo-row', photos: rowPhotos });
      }
    });
  });

  return { items, flatIndexMap };
}

export const VirtualizedPhotoGrid = memo(function VirtualizedPhotoGrid({
  photos,
  isLoading,
  hasMore,
  onLoadMore,
  tileSize,
  isSelectMode,
  selectedPhotos,
  onSelectPhoto,
  onPhotoClick,
  onDeletePhoto,
}: VirtualizedPhotoGridProps) {
  logComponentRender('VirtualizedPhotoGrid');
  
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const loadStartTimeRef = useRef<number>(performance.now());
  const hasLoggedFirstLoad = useRef(false);
  const scrollTrackerRef = useRef<(() => void) | null>(null);
  const scrollerElementRef = useRef<Window | HTMLElement | null>(null);
  const scrollHandlerRef = useRef<(() => void) | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [columnsCount, setColumnsCount] = useState(() => getGridColumns(tileSize));

  useEffect(() => {
    const handleResize = () => {
      setColumnsCount(getGridColumns(tileSize));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    logEventListener('add', 'resize', 'VirtualizedPhotoGrid');
    return () => {
      window.removeEventListener('resize', handleResize);
      logEventListener('remove', 'resize', 'VirtualizedPhotoGrid');
    };
  }, [tileSize]);

  // Debug logging for component mount/unmount
  useEffect(() => {
    logRouteMount('VirtualizedPhotoGrid');
    return () => {
      logRouteUnmount('VirtualizedPhotoGrid');
      logEventListener('remove', 'scroll', 'VirtualizedPhotoGrid');
      logEventListener('remove', 'resize', 'VirtualizedPhotoGrid');
    };
  }, []);

  // Cleanup scroll listeners on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (scrollerElementRef.current && scrollHandlerRef.current) {
        scrollerElementRef.current.removeEventListener('scroll', scrollHandlerRef.current);
        logEventListener('remove', 'scroll', 'VirtualizedPhotoGrid');
      }
      if (scrollTrackerRef.current) {
        scrollTrackerRef.current();
        scrollTrackerRef.current = null;
      }
    };
  }, []);

  const { items, flatIndexMap } = useMemo(
    () => buildVirtualItems(photos, columnsCount),
    [photos, columnsCount]
  );

  useEffect(() => {
    if (photos.length > 0 && !hasLoggedFirstLoad.current) {
      logTimeToFirstThumbnails(loadStartTimeRef.current);
      hasLoggedFirstLoad.current = true;
    }
  }, [photos.length]);

  useEffect(() => {
    if (photos.length > 0) {
      const nextPhotos = photos.slice(0, 20);
      const urls = nextPhotos
        .map((p) => p.thumbnailPath)
        .filter((path): path is string => !!path)
        .map((path) => getProxyUrl(path));
      if (urls.length > 0) {
        prefetchImages(urls);
      }
    }
  }, [photos]);

  const handleRangeChanged = useCallback(
    ({ startIndex, endIndex }: { startIndex: number; endIndex: number }) => {
      const renderedCount = endIndex - startIndex + 1;
      logRenderedItems(renderedCount);
      
      if (hasMore && endIndex >= items.length - 5) {
        onLoadMore();
      }

      const upcomingItems = items.slice(endIndex, endIndex + 10);
      const upcomingPhotos = upcomingItems
        .filter((item) => item.type === 'photo-row')
        .flatMap((item) => item.photos || []);

      if (upcomingPhotos.length > 0) {
        const urls = upcomingPhotos
          .map((p) => p.thumbnailPath)
          .filter((path): path is string => !!path)
          .map((path) => getProxyUrl(path));
        if (urls.length > 0) {
          prefetchImages(urls);
        }
      }
    },
    [items, hasMore, onLoadMore]
  );

  const handleScrollStart = useCallback(() => {
    if (!scrollTrackerRef.current) {
      scrollTrackerRef.current = trackScrollPerformance();
    }
  }, []);

  const handleScrollStop = useCallback(() => {
    if (scrollTrackerRef.current) {
      scrollTrackerRef.current();
      scrollTrackerRef.current = null;
    }
  }, []);

  const gridCols = useMemo(() => {
    if (tileSize === 'small') {
      return 'grid-cols-4 md:grid-cols-6 lg:grid-cols-8';
    } else if (tileSize === 'medium') {
      return 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5';
    }
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  }, [tileSize]);

  const onSelectPhotoRef = useRef(onSelectPhoto);
  const onPhotoClickRef = useRef(onPhotoClick);
  const onDeletePhotoRef = useRef(onDeletePhoto);

  useEffect(() => {
    onSelectPhotoRef.current = onSelectPhoto;
    onPhotoClickRef.current = onPhotoClick;
    onDeletePhotoRef.current = onDeletePhoto;
  });

  const itemContent = useCallback(
    (index: number) => {
      const item = items[index];

      if (item.type === 'month-header') {
        return (
          <h3
            id={`month-${item.monthKey?.replace(/\s/g, '-')}`}
            className="text-lg font-semibold py-2 sticky top-0 bg-background z-10"
          >
            {item.monthKey}
          </h3>
        );
      }

      if (item.type === 'day-header') {
        return (
          <h4 className="text-sm text-muted-foreground py-2">{item.dayKey}</h4>
        );
      }

      return (
        <div className={cn("grid gap-2 pb-2", gridCols)}>
          {item.photos?.map((photo) => (
            <OptimizedPhotoCard
              key={photo.id}
              photo={photo}
              isSelectMode={isSelectMode}
              isSelected={selectedPhotos.has(photo.id)}
              onSelect={() => onSelectPhotoRef.current(photo.id)}
              onClick={() => {
                const flatIdx = flatIndexMap.get(photo.id) ?? 0;
                onPhotoClickRef.current(photo, flatIdx);
              }}
              onDelete={() => onDeletePhotoRef.current(photo.id)}
              tileSize={tileSize}
            />
          ))}
        </div>
      );
    },
    [items, gridCols, isSelectMode, selectedPhotos, flatIndexMap, tileSize]
  );

  if (photos.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-40 border-2 border-dashed border-muted-foreground/25 rounded-lg bg-muted/50">
        <div className="text-center text-muted-foreground">
          <Camera className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No photos yet</p>
          <p className="text-xs">Upload photos to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-300px)] min-h-[400px]">
      <Virtuoso
        ref={virtuosoRef}
        data={items}
        itemContent={(index) => itemContent(index)}
        rangeChanged={handleRangeChanged}
        onScroll={handleScrollStart}
        scrollerRef={(ref) => {
          if (ref && ref !== scrollerElementRef.current) {
            // Remove old listener if exists
            if (scrollerElementRef.current && scrollHandlerRef.current) {
              scrollerElementRef.current.removeEventListener('scroll', scrollHandlerRef.current);
              logEventListener('remove', 'scroll', 'VirtualizedPhotoGrid-scroller');
            }
            
            // Create new scroll handler
            scrollHandlerRef.current = () => {
              if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
              }
              scrollTimeoutRef.current = setTimeout(handleScrollStop, 150);
            };
            
            // Add listener to new element
            ref.addEventListener('scroll', scrollHandlerRef.current);
            logEventListener('add', 'scroll', 'VirtualizedPhotoGrid-scroller');
            scrollerElementRef.current = ref;
          }
        }}
        overscan={200}
        components={{
          Footer: () =>
            isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : null,
        }}
      />
    </div>
  );
});

export default VirtualizedPhotoGrid;
