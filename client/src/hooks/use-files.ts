import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { FileMetadata, Folder } from "@shared/schema";

export function useProjectFiles(projectId: number) {
  return useQuery<FileMetadata[]>({
    queryKey: ['/api/projects', projectId, 'files'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useProjectFolders(projectId: number) {
  return useQuery<Folder[]>({
    queryKey: ['/api/projects', projectId, 'folders'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/folders`);
      if (!res.ok) throw new Error("Failed to fetch folders");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateFile(projectId: number) {
  return useMutation({
    mutationFn: async (data: { name: string; objectPath: string; folderId?: number | null; albumId?: number | null; contentType?: string; size?: number; takenAt?: string | null }) => {
      return apiRequest("POST", `/api/projects/${projectId}/files`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'files'] });
    },
  });
}

export function useDeleteFile(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'files'] });
    },
  });
}

export function useCreateFolder(projectId: number) {
  return useMutation({
    mutationFn: async (data: { name: string; parentId?: number | null }): Promise<Folder> => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/folders`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'folders'] });
    },
  });
}

export function useUpdateFolder(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; parentId?: number | null }) => {
      return apiRequest("PUT", `/api/folders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'folders'] });
    },
  });
}

export function useDeleteFolder(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'folders'] });
    },
  });
}

export function useUpdateFile(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; tags?: string[] | null; albumId?: number | null; folderId?: number | null; starred?: boolean }) => {
      return apiRequest("PUT", `/api/files/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'files'] });
    },
  });
}

export function useBatchDeleteFiles(projectId: number) {
  return useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", `/api/files/batch-delete`, { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'files'] });
    },
  });
}

export function useBatchMoveFiles(projectId: number) {
  return useMutation({
    mutationFn: async ({ ids, folderId }: { ids: number[]; folderId: number | null }) => {
      return apiRequest("POST", `/api/files/batch-move`, { ids, folderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'files'] });
    },
  });
}
