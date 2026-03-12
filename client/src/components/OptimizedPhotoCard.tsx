import { useState, useCallback, memo } from "react";
import { cn } from "@/lib/utils";
import { Check, Trash2, Loader2, Play } from "lucide-react";
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

function getCloudinaryThumbnail(publicId: string | null, cloudName: string = 'dxzxzywpf', mediaType?: string): string | null {
  if (!publicId) return null;
  const resourceType = mediaType === 'video' ? 'video' : 'image';
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/w_150,h_150,c_fill,q_auto,f_jpg/${publicId}`;
}

function getCloudinaryMedium(publicId: string | null, cloudName: string = 'dxzxzywpf', mediaType?: string): string | null {
  if (!publicId) return null;
  const resourceType = mediaType === 'video' ? 'video' : 'image';
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/w_600,c_limit,q_auto,f_jpg/${publicId}`;
}

export const OptimizedPhotoCard = memo(function OptimizedPhotoCard({
  photo,
  isSelectMode,
  isSelected,
  onSelect,
  onClick,
  onDelete,
}: OptimizedPhotoCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const isVideo = photo.mediaType === 'video';
  const thumbnailUrl = getCloudinaryThumbnail(photo.cloudinaryPublicId, undefined, photo.mediaType);
  const hasDisplayImage = !!thumbnailUrl;

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

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  return (
    <div
      className={cn(
        "relative group cursor-pointer rounded-lg overflow-hidden border bg-muted/50 aspect-square",
        isSelectMode && isSelected && "ring-2 ring-primary"
      )}
      onClick={handleClick}
      data-testid={`photo-card-${photo.id}`}
    >
      {isLoading && hasDisplayImage && (
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasDisplayImage && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center flex-col gap-2">
          <span className="text-xs text-muted-foreground">Image unavailable</span>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Failed to load</span>
        </div>
      )}

      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt={photo.name}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          loading="lazy"
          decoding="async"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {isVideo && !isSelectMode && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-5 h-5 text-white ml-0.5" />
          </div>
        </div>
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
        <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white bg-black/60 hover:bg-black/80 rounded-full"
            onClick={handleDeleteClick}
            data-testid={`button-delete-photo-${photo.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
});

export function getCloudinaryFullUrl(publicId: string | null, cloudName: string = 'dxzxzywpf'): string | null {
  if (!publicId) return null;
  return `https://res.cloudinary.com/${cloudName}/image/upload/q_auto,f_auto/${publicId}`;
}

export function getCloudinaryVideoUrl(publicId: string | null, cloudName: string = 'dxzxzywpf'): string | null {
  if (!publicId) return null;
  return `https://res.cloudinary.com/${cloudName}/video/upload/q_auto/${publicId}`;
}

export { getCloudinaryThumbnail, getCloudinaryMedium };

export default OptimizedPhotoCard;
