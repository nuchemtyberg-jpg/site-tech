import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Photo } from "@shared/schema";

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

export function useCreatePhoto(projectId: number) {
  return useMutation({
    mutationFn: async (photo: { name: string; objectPath: string; contentType?: string; size?: number; albumId?: number | null; takenAt?: string | null }) => {
      return apiRequest("POST", `/api/projects/${projectId}/photos`, photo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'photos'] });
    },
  });
}

export function useDeletePhoto(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/photos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'photos'] });
    },
  });
}
