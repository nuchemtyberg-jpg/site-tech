import { useState, useEffect, Suspense, lazy, useMemo, useCallback } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { VirtualizedPhotoGrid } from "./VirtualizedPhotoGrid";
import { NativeFileUploader } from "./NativeFileUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Camera,
  FolderOpen,
  Plus,
  Trash2,
  Grid3X3,
  Grid2X2,
  Square,
  CheckSquare,
  Download,
  Share2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, getProxyUrl } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { logViewerOpen, logViewerClose } from "@/lib/debugPerf";
import type { Photo, PaginatedPhotosResponse } from "@shared/schema";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

interface PhotosTabProps {
  projectId: number;
}

function useProjectPhotosPaginated(projectId: number, options?: { albumId?: number | null; limit?: number; enabled?: boolean }) {
  const limit = options?.limit || 50;
  const enabled = options?.enabled !== false && !!projectId;
  
  return useInfiniteQuery<PaginatedPhotosResponse>({
    queryKey: ['/api/projects', projectId, 'photos', 'paginated', options?.albumId],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('sort', 'capture_desc');
      if (pageParam) params.set('cursor', pageParam as string);
      if (options?.albumId) params.set('albumId', String(options.albumId));
      
      const res = await fetch(`/api/projects/${projectId}/photos?${params}`, { signal });
      if (!res.ok) throw new Error("Failed to fetch photos");
      return res.json();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

function useAllPhotosFlat(projectId: number, albumId?: number | null, enabled?: boolean) {
  const query = useProjectPhotosPaginated(projectId, { albumId: albumId ?? undefined, limit: 50, enabled });
  
  const photos = useMemo(() => 
    query.data?.pages.flatMap(page => page.photos) || [],
    [query.data?.pages]
  );
  const totalCount = query.data?.pages[0]?.totalCount || 0;
  
  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);
  
  return {
    ...query,
    photos,
    totalCount,
    loadMore,
  };
}

function useCreatePhoto(projectId: number) {
  return useMutation({
    mutationFn: async (photo: { name: string; objectPath: string; contentType?: string; size?: number; albumId?: number | null; takenAt?: string | null }) => {
      return apiRequest("POST", `/api/projects/${projectId}/photos`, photo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'photos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'photos', 'paginated'] });
    },
  });
}

function useDeletePhoto(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/photos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'photos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'photos', 'paginated'] });
    },
  });
}

export function PhotosTab({ projectId }: PhotosTabProps) {
  const { toast } = useToast();
  
  const [currentAlbumId, setCurrentAlbumId] = useState<number | null>(null);
  const [photoTileSize, setPhotoTileSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  const [isPhotoSelectMode, setIsPhotoSelectMode] = useState(false);
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [deleteAlbumId, setDeleteAlbumId] = useState<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxPhotos, setLightboxPhotos] = useState<Photo[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [deletePhotoId, setDeletePhotoId] = useState<number | null>(null);

  const paginatedPhotos = useAllPhotosFlat(projectId, currentAlbumId, true);
  const createPhotoMutation = useCreatePhoto(projectId);
  const deletePhotoMutation = useDeletePhoto(projectId);

  const { data: albums = [] } = useQuery<{ id: number; projectId: number; name: string; createdAt: string }[]>({
    queryKey: ['/api/projects', projectId, 'albums'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/albums`);
      return res.json();
    },
    enabled: !!projectId,
  });

  const createAlbumMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest('POST', `/api/projects/${projectId}/albums`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'albums'] });
    },
  });

  const deleteAlbumMutation = useMutation({
    mutationFn: async (albumId: number) => {
      return apiRequest('DELETE', `/api/albums/${albumId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'albums'] });
      if (currentAlbumId === deleteAlbumId) {
        setCurrentAlbumId(null);
      }
    },
  });

  useScrollLock({ isLocked: lightboxOpen, source: 'PhotosTabLightbox' });

  useEffect(() => {
    if (lightboxOpen) {
      logViewerOpen('PhotosTabLightbox');
    } else {
      logViewerClose('PhotosTabLightbox');
    }
  }, [lightboxOpen]);

  const handlePhotoUploadComplete = async (uploadedFiles: Array<{ name: string; objectPath: string; size: number; type: string; takenAt?: Date }>) => {
    let successCount = 0;
    let targetAlbumId = currentAlbumId;
    
    if (targetAlbumId === null && uploadedFiles.length > 0) {
      const generalAlbum = albums?.find((a) => a.name === "General");
      const firstAlbum = albums?.[0];
      
      if (generalAlbum) {
        targetAlbumId = generalAlbum.id;
      } else if (firstAlbum) {
        targetAlbumId = firstAlbum.id;
      } else {
        try {
          const response = await apiRequest('POST', `/api/projects/${projectId}/albums`, { name: "General" });
          const newAlbum = await response.json();
          targetAlbumId = newAlbum.id;
          queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'albums'] });
        } catch (err) {
          console.error("Failed to create default album:", err);
          toast({ title: "Error", description: "Failed to create album for photos", variant: "destructive" });
          return;
        }
      }
    }
    
    for (const file of uploadedFiles) {
      try {
        await createPhotoMutation.mutateAsync({
          name: file.name,
          objectPath: file.objectPath,
          contentType: file.type,
          size: file.size,
          albumId: targetAlbumId,
          takenAt: file.takenAt?.toISOString(),
        });
        successCount++;
      } catch (err) {
        console.error("Failed to save photo metadata:", err);
        toast({ title: "Error", description: `Failed to save ${file.name}`, variant: "destructive" });
      }
    }
    
    if (successCount > 0) {
      toast({ title: "Upload Complete", description: `${successCount} photo(s) uploaded successfully.` });
    }
  };

  const handleDeletePhoto = async () => {
    if (deletePhotoId !== null) {
      try {
        await deletePhotoMutation.mutateAsync(deletePhotoId);
        toast({ title: "Photo deleted successfully" });
      } catch (err) {
        toast({ title: "Failed to delete photo", variant: "destructive" });
      }
      setDeletePhotoId(null);
    }
  };

  const handleBatchDeletePhotos = async () => {
    const photoIds = Array.from(selectedPhotos);
    let successCount = 0;
    
    for (const id of photoIds) {
      try {
        await deletePhotoMutation.mutateAsync(id);
        successCount++;
      } catch (err) {
        console.error("Failed to delete photo:", err);
      }
    }
    
    if (successCount > 0) {
      toast({ title: `${successCount} photo(s) deleted successfully` });
    }
    
    setSelectedPhotos(new Set());
    setShowBatchDeleteConfirm(false);
    setIsPhotoSelectMode(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Select value={currentAlbumId?.toString() || "all"} onValueChange={(v) => setCurrentAlbumId(v === "all" ? null : Number(v))}>
            <SelectTrigger className="w-40 bg-white dark:bg-zinc-900 text-black" data-testid="select-album">
              <FolderOpen className="w-4 h-4 mr-2 text-black" />
              <SelectValue placeholder="All Photos" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-900 text-black">
              <SelectItem value="all">All Photos</SelectItem>
              {albums.map((album) => (
                <SelectItem key={album.id} value={album.id.toString()}>{album.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isCreateAlbumOpen} onOpenChange={setIsCreateAlbumOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-create-album">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white dark:bg-zinc-900">
              <DialogHeader>
                <DialogTitle className="text-black">Create Album</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="album-name" className="text-black"><span className="text-red-500">*</span> Album Name</Label>
                  <Input 
                    id="album-name" 
                    value={newAlbumName} 
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    className="bg-white dark:bg-zinc-900 text-black"
                    placeholder="Enter album name"
                    data-testid="input-album-name"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateAlbumOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => {
                    if (newAlbumName.trim()) {
                      createAlbumMutation.mutate(newAlbumName.trim());
                      setNewAlbumName("");
                      setIsCreateAlbumOpen(false);
                    }
                  }}
                  disabled={!newAlbumName.trim()}
                  data-testid="button-save-album"
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {currentAlbumId && (
            <Button variant="ghost" size="icon" onClick={() => setDeleteAlbumId(currentAlbumId)} data-testid="button-delete-album">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button 
            variant={photoTileSize === 'small' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setPhotoTileSize('small')}
            data-testid="button-tile-small"
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button 
            variant={photoTileSize === 'medium' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setPhotoTileSize('medium')}
            data-testid="button-tile-medium"
          >
            <Grid2X2 className="w-4 h-4" />
          </Button>
          <Button 
            variant={photoTileSize === 'large' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setPhotoTileSize('large')}
            data-testid="button-tile-large"
          >
            <Square className="w-4 h-4" />
          </Button>
        </div>

        <Button 
          variant={isPhotoSelectMode ? 'default' : 'outline'} 
          size="sm"
          onClick={() => {
            setIsPhotoSelectMode(!isPhotoSelectMode);
            setSelectedPhotos(new Set());
          }}
          data-testid="button-select-mode"
        >
          <CheckSquare className="w-4 h-4 mr-2" />
          Select
        </Button>

        <NativeFileUploader
          maxNumberOfFiles={50}
          maxFileSize={52428800}
          accept="image/*"
          buttonClassName="w-full sm:w-auto"
          onUploadComplete={handlePhotoUploadComplete}
        >
          <Camera className="w-4 h-4 mr-2" /> Upload
        </NativeFileUploader>
      </div>

      {isPhotoSelectMode && selectedPhotos.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedPhotos.size} selected</span>
          <div className="flex-1" />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              selectedPhotos.forEach(id => {
                const photo = paginatedPhotos.photos?.find(p => p.id === id);
                if (photo) {
                  const link = document.createElement('a');
                  link.href = getProxyUrl(photo.objectPath);
                  link.download = photo.name;
                  link.click();
                }
              });
            }}
            data-testid="button-download-selected"
          >
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              const selectedIds = Array.from(selectedPhotos).join(',');
              const shareUrl = `${window.location.origin}/project/${projectId}/photos?ids=${selectedIds}`;
              navigator.clipboard.writeText(shareUrl);
              toast({ title: "Share link copied to clipboard" });
            }}
            data-testid="button-share-selected"
          >
            <Share2 className="w-4 h-4 mr-2" /> Share
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => setShowBatchDeleteConfirm(true)}
            data-testid="button-delete-selected"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </Button>
        </div>
      )}

      <VirtualizedPhotoGrid
        photos={paginatedPhotos.photos}
        isLoading={paginatedPhotos.isLoading || paginatedPhotos.isFetchingNextPage}
        hasMore={paginatedPhotos.hasNextPage ?? false}
        onLoadMore={paginatedPhotos.loadMore}
        tileSize={photoTileSize}
        isSelectMode={isPhotoSelectMode}
        selectedPhotos={selectedPhotos}
        onSelectPhoto={(id) => {
          setSelectedPhotos(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
              newSet.delete(id);
            } else {
              newSet.add(id);
            }
            return newSet;
          });
        }}
        onPhotoClick={(photo, index) => {
          setLightboxPhotos(paginatedPhotos.photos);
          setLightboxIndex(index);
          setLightboxOpen(true);
        }}
        onDeletePhoto={(id) => setDeletePhotoId(id)}
      />

      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={lightboxPhotos.map(photo => ({
          src: getProxyUrl(photo.objectPath),
          alt: photo.name,
        }))}
        on={{
          view: ({ index }) => setLightboxIndex(index),
        }}
      />

      <AlertDialog open={deleteAlbumId !== null} onOpenChange={() => setDeleteAlbumId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Album</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this album? Photos in the album will be moved to "All Photos".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAlbumId) {
                  deleteAlbumMutation.mutate(deleteAlbumId);
                  setDeleteAlbumId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePhotoId !== null} onOpenChange={() => setDeletePhotoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePhoto}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBatchDeleteConfirm} onOpenChange={setShowBatchDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Photos</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPhotos.size} photo(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDeletePhotos}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PhotosTab;
