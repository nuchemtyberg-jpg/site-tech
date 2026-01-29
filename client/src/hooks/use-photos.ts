import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Photo, PaginatedPhotosResponse } from "@shared/schema";

export function useProjectPhotos(projectId: number) {
  return useQuery<Photo[]>({
    queryKey: ['/api/projects', projectId, 'photos'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/photos`);
      if (!res.ok) throw new Error("Failed to fetch photos");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useProjectPhotosPaginated(projectId: number, options?: { albumId?: number | null; limit?: number }) {
  const limit = options?.limit || 50;
  
  return useInfiniteQuery<PaginatedPhotosResponse>({
    queryKey: ['/api/projects', projectId, 'photos', 'paginated', options?.albumId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (pageParam) params.set('cursor', pageParam as string);
      if (options?.albumId) params.set('albumId', String(options.albumId));
      
      const res = await fetch(`/api/projects/${projectId}/photos?${params}`);
      if (!res.ok) throw new Error("Failed to fetch photos");
      return res.json();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: !!projectId,
  });
}

export function useAllPhotosFlat(projectId: number, albumId?: number | null) {
  const query = useProjectPhotosPaginated(projectId, { albumId: albumId ?? undefined, limit: 100 });
  
  const photos = query.data?.pages.flatMap(page => page.photos) || [];
  const totalCount = query.data?.pages[0]?.totalCount || 0;
  
  return {
    ...query,
    photos,
    totalCount,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        query.fetchNextPage();
      }
    },
  };
}

function invalidatePhotoQueries(projectId: number) {
  queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'photos'] });
  queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'photos', 'paginated'] });
}

export function useCreatePhoto(projectId: number) {
  return useMutation({
    mutationFn: async (photo: { name: string; objectPath: string; contentType?: string; size?: number; albumId?: number | null; takenAt?: string | null }) => {
      return apiRequest("POST", `/api/projects/${projectId}/photos`, photo);
    },
    onSuccess: () => {
      invalidatePhotoQueries(projectId);
    },
  });
}

export function useUpdatePhoto(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<Photo>) => {
      return apiRequest("PATCH", `/api/photos/${id}`, updates);
    },
    onSuccess: () => {
      invalidatePhotoQueries(projectId);
    },
  });
}

export function useDeletePhoto(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/photos/${id}`);
    },
    onSuccess: () => {
      invalidatePhotoQueries(projectId);
    },
  });
}

export function useProcessPhoto() {
  return useMutation({
    mutationFn: async (photoId: number) => {
      return apiRequest("POST", `/api/photos/${photoId}/process`);
    },
  });
}
