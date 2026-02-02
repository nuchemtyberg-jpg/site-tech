import { useState, useEffect, useCallback, memo } from "react";
import { decode } from "blurhash";
import { cn, getProxyUrl } from "@/lib/utils";
import { getCachedImage, cacheImage } from "@/lib/imageCache";
import { logImageLoadTime } from "@/lib/performanceMetrics";
import { Check, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Photo } from "@shared/schema";

interface OptimizedPhotoCardProps {
  photo: Photo;
  isSelectMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onClick: () => void;
  onDelete: () => void;
  tileSize: 'small' | 'medium' | 'large';
}

function BlurHashCanvas({ 
  blurHash, 
  width = 32, 
  height = 32,
  className 
}: { 
  blurHash: string; 
  width?: number; 
  height?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const pixels = decode(blurHash, width, height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.createImageData(width, height);
        imageData.data.set(pixels);
        ctx.putImageData(imageData, 0, 0);
        setDataUrl(canvas.toDataURL());
      }
    } catch (e) {
      console.warn('BlurHash decode error:', e);
    }
  }, [blurHash, width, height]);

  if (!dataUrl) return null;

  return (
    <img
      src={dataUrl}
      alt=""
      className={cn("absolute inset-0 w-full h-full object-cover", className)}
    />
  );
}

export const OptimizedPhotoCard = memo(function OptimizedPhotoCard({
  photo,
  isSelectMode,
  isSelected,
  onSelect,
  onClick,
  onDelete,
  tileSize,
}: OptimizedPhotoCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const isLegacyPendingPhoto = (() => {
    if (photo.processingStatus !== 'pending') return false;
    if (photo.thumbnailPath || photo.mediumPath) return false;
    if (!photo.createdAt) return false;
    const processorRolloutDate = new Date('2026-02-02T00:00:00Z');
    const photoDate = new Date(photo.createdAt);
    return photoDate < processorRolloutDate;
  })();

  const displayUrl = photo.thumbnailPath 
    ? getProxyUrl(photo.thumbnailPath)
    : photo.mediumPath 
      ? getProxyUrl(photo.mediumPath)
      : isLegacyPendingPhoto && photo.objectPath
        ? getProxyUrl(photo.objectPath)
        : null;

  const hasDisplayImage = !!displayUrl;
  const isProcessing = photo.processingStatus === 'pending' || photo.processingStatus === 'processing';

  useEffect(() => {
    if (!displayUrl) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    const controller = new AbortController();
    const loadStartTime = performance.now();

    async function loadImage() {
      const cached = await getCachedImage(displayUrl!);
      if (cached && mounted) {
        setImageUrl(cached);
        setIsLoading(false);
        logImageLoadTime(photo.id, loadStartTime);
        return;
      }

      try {
        const response = await fetch(displayUrl!, { signal: controller.signal });
        if (!response.ok) throw new Error('Failed to load image');
        
        const blob = await response.blob();
        if (!mounted) return;
        
        const objectUrl = await cacheImage(displayUrl!, blob);
        if (mounted) {
          setImageUrl(objectUrl);
          setIsLoading(false);
          logImageLoadTime(photo.id, loadStartTime);
        }
      } catch (error) {
        if (mounted && !(error instanceof DOMException && error.name === 'AbortError')) {
          setHasError(true);
          setIsLoading(false);
        }
      }
    }

    loadImage();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [displayUrl, photo.id]);

  const handleClick = useCallback(() => {
    if (isSelectMode) {
      onSelect();
    } else {
      onClick();
    }
  }, [isSelectMode, onSelect, onClick]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  }, [onDelete]);

  return (
    <div
      className={cn(
        "relative group cursor-pointer rounded-lg overflow-hidden border bg-muted/50 aspect-square",
        isSelectMode && isSelected && "ring-2 ring-primary"
      )}
      onClick={handleClick}
      data-testid={`photo-card-${photo.id}`}
    >
      {photo.blurHash && isLoading && hasDisplayImage && (
        <BlurHashCanvas blurHash={photo.blurHash} className="blur-sm" />
      )}

      {!photo.blurHash && isLoading && hasDisplayImage && (
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasDisplayImage && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center flex-col gap-2">
          {isProcessing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Processing...</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Image unavailable</span>
          )}
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Failed to load</span>
        </div>
      )}

      {imageUrl && hasDisplayImage && (
        <img
          src={imageUrl}
          alt={photo.name}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          loading="lazy"
          decoding="async"
        />
      )}

      {isSelectMode && (
        <div
          className={cn(
            "absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            isSelected
              ? "bg-primary border-primary"
              : "bg-white/80 border-gray-400"
          )}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
      )}

      {!isSelectMode && (
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={handleDeleteClick}
            data-testid={`button-delete-photo-${photo.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}

      {photo.processingStatus === 'processing' && (
        <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1.5 py-0.5">
          <Loader2 className="w-3 h-3 animate-spin text-white" />
        </div>
      )}
    </div>
  );
});

export default OptimizedPhotoCard;
