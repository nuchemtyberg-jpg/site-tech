import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import type { FileWithUploader, Folder } from "@shared/schema";

export type DocumentEntity = "project" | "opportunity";
export const documentToolsBase = (type: DocumentEntity, id: number) => `/api/document-tools/${type}/${id}`;
export const documentToolsKey = (type: DocumentEntity, id: number) => [documentToolsBase(type, id)] as const;
export type CreateDocument = { name: string; objectPath: string; contentType: string; size: number; folderId?: number | null; supersedesId?: number };
export type UpdateDocument = { id: number; name?: string; folderId?: number | null; tags?: string[] | null; starred?: boolean };
export type BatchDocuments = { fileIds: number[]; folderIds: number[]; action: "delete" | "move"; folderId?: number | null };

export function groupDocuments(files: FileWithUploader[]) {
  const groups = new Map<number, FileWithUploader[]>();
  for (const file of files) {
    const key = file.documentGroupId ?? file.id;
    const versions = groups.get(key) ?? [];
    versions.push(file);
    groups.set(key, versions);
  }
  return Array.from(groups.entries()).map(([groupId, versions]) => {
    const history = [...versions].sort((a, b) => (b.documentVersion || 1) - (a.documentVersion || 1));
    const current = history.find(file => file.documentStatus === "current") ?? history[0];
    return { groupId, current, versions: history };
  });
}

export function useDocumentTools(type: DocumentEntity, id: number) {
  const client = useQueryClient();
  const base = documentToolsBase(type, id);
  const key = documentToolsKey(type, id);
  const files = useQuery<FileWithUploader[]>({
    queryKey: [...key, "files"],
    queryFn: async () => (await apiRequest("GET", `${base}/files`)).json(),
    enabled: Number.isFinite(id) && id > 0,
  });
  const folders = useQuery<Folder[]>({
    queryKey: [...key, "folders"],
    queryFn: async () => (await apiRequest("GET", `${base}/folders`)).json(),
    enabled: Number.isFinite(id) && id > 0,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: type === "project" ? [api.activity.listForProject.path, id] : [api.opportunities.activity.path, id] }),
    ]);
  };
  const createFile = useMutation({
    mutationFn: async (data: CreateDocument): Promise<FileWithUploader> => (await apiRequest("POST", `${base}/files`, data)).json(),
    onSuccess: refresh,
  });
  const updateFile = useMutation({
    mutationFn: async ({ id: fileId, ...data }: UpdateDocument): Promise<FileWithUploader> => (await apiRequest("PUT", `${base}/files/${fileId}`, data)).json(),
    onSuccess: refresh,
  });
  const deleteFile = useMutation({
    mutationFn: async ({ id: fileId, scope }: { id: number; scope: "version" | "document" }) => {
      await apiRequest("DELETE", `${base}/files/${fileId}?scope=${scope}`);
    },
    onSuccess: refresh,
  });
  const createFolder = useMutation({
    mutationFn: async (data: { name: string; parentId?: number | null }): Promise<Folder> => (await apiRequest("POST", `${base}/folders`, data)).json(),
    onSuccess: refresh,
  });
  const updateFolder = useMutation({
    mutationFn: async ({ id: folderId, ...data }: { id: number; name?: string; parentId?: number | null }): Promise<Folder> => (await apiRequest("PUT", `${base}/folders/${folderId}`, data)).json(),
    onSuccess: refresh,
  });
  const deleteFolder = useMutation({
    mutationFn: async (folderId: number) => { await apiRequest("DELETE", `${base}/folders/${folderId}`); },
    onSuccess: refresh,
  });
  const batch = useMutation({
    mutationFn: async (data: BatchDocuments) => (await apiRequest("POST", `${base}/batch`, data)).json(),
    onSuccess: refresh,
  });
  return { files, folders, createFile, updateFile, deleteFile, createFolder, updateFolder, deleteFolder, batch };
}
