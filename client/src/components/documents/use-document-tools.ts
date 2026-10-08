import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import type { FileWithUploader, Folder } from "@shared/schema";

export type DocumentEntity = "project" | "opportunity";
export const documentToolsBase = (type: DocumentEntity, id: number, _projectContextId?: number) => `/api/document-tools/${type}/${id}`;
export const documentToolsKey = (type: DocumentEntity, id: number, projectContextId?: number, nativeProjectTree = false) => ["/api/document-tools", type, id, nativeProjectTree ? "native" : projectContextId ?? null] as const;
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

export function useDocumentTools(type: DocumentEntity, id: number, projectContextId?: number, nativeProjectTree = false) {
  const client = useQueryClient();
  const base = documentToolsBase(type, id, projectContextId);
  const key = documentToolsKey(type, id, projectContextId, nativeProjectTree);
  const params = new URLSearchParams();
  if (type === "opportunity" && projectContextId) params.set("projectId", String(projectContextId));
  if (type === "project" && nativeProjectTree) params.set("native", "true");
  const endpoint = (path: string) => `${base}${path}${params.size ? `?${params}` : ""}`;
  const withParams = (url: string) => `${url}${params.size ? `${url.includes("?") ? "&" : "?"}${params}` : ""}`;
  const files = useQuery<FileWithUploader[]>({
    queryKey: [...key, "files"],
    queryFn: async () => (await apiRequest("GET", endpoint("/files"))).json(),
    enabled: Number.isFinite(id) && id > 0,
  });
  const folders = useQuery<Folder[]>({
    queryKey: [...key, "folders"],
    queryFn: async () => (await apiRequest("GET", endpoint("/folders"))).json(),
    enabled: Number.isFinite(id) && id > 0,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ["/api/document-tools"] }),
      client.invalidateQueries({ queryKey: ["/api/projects"] }),
      client.invalidateQueries({ queryKey: type === "project" ? [api.activity.listForProject.path, id] : [api.opportunities.activity.path, id] }),
    ]);
  };
  const createFile = useMutation({
    mutationFn: async (data: CreateDocument): Promise<FileWithUploader> => (await apiRequest("POST", endpoint("/files"), data)).json(),
    onSuccess: refresh,
  });
  const updateFile = useMutation({
    mutationFn: async ({ id: fileId, ...data }: UpdateDocument): Promise<FileWithUploader> => (await apiRequest("PUT", endpoint(`/files/${fileId}`), data)).json(),
    onSuccess: refresh,
  });
  const deleteFile = useMutation({
    mutationFn: async ({ id: fileId, scope }: { id: number; scope: "version" | "document" }) => {
      await apiRequest("DELETE", withParams(`${base}/files/${fileId}?scope=${scope}`));
    },
    onSuccess: refresh,
  });
  const createFolder = useMutation({
    mutationFn: async (data: { name: string; parentId?: number | null }): Promise<Folder> => (await apiRequest("POST", endpoint("/folders"), data)).json(),
    onSuccess: refresh,
  });
  const updateFolder = useMutation({
    mutationFn: async ({ id: folderId, ...data }: { id: number; name?: string; parentId?: number | null }): Promise<Folder> => (await apiRequest("PUT", endpoint(`/folders/${folderId}`), data)).json(),
    onSuccess: refresh,
  });
  const deleteFolder = useMutation({
    mutationFn: async (folderId: number) => { await apiRequest("DELETE", endpoint(`/folders/${folderId}`)); },
    onSuccess: refresh,
  });
  const batch = useMutation({
    mutationFn: async (data: BatchDocuments) => (await apiRequest("POST", endpoint("/batch"), data)).json(),
    onSuccess: refresh,
  });
  return { files, folders, createFile, updateFile, deleteFile, createFolder, updateFolder, deleteFolder, batch };
}
