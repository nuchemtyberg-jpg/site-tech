import { apiRequest } from "@/lib/queryClient";
import type { Folder } from "@shared/schema";
import type { UploadResult } from "@/components/NativeFileUploader";
import type { CreateDocument } from "./use-document-tools";

export type DroppedFile = { file: File; relativePath: string; uploaded?: UploadResult };

export async function readDroppedFiles(transfer: DataTransfer): Promise<{ files: DroppedFile[]; folders: string[] }> {
  const files: DroppedFile[] = [];
  const folders: string[] = [];
  async function read(entry: FileSystemEntry, parent: string) {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      files.push({ file, relativePath: parent });
    } else if (entry.isDirectory) {
      const path = parent ? `${parent}/${entry.name}` : entry.name;
      folders.push(path);
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await read(child, path);
      } while (batch.length);
    }
  }
  const entries = Array.from(transfer.items ?? []).map(item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
  if (entries.length) {
    for (const entry of entries) await read(entry, "");
  } else {
    for (const file of Array.from(transfer.files)) files.push({ file, relativePath: "" });
  }
  return { files, folders };
}

export async function uploadDroppedFile(item: DroppedFile): Promise<UploadResult> {
  if (item.uploaded) return item.uploaded;
  const { file } = item;
  const type = file.type || "application/octet-stream";
  const response = await apiRequest("POST", "/api/uploads/request-url", { name: file.name, size: file.size, contentType: type });
  const { uploadURL, objectPath } = await response.json();
  const uploaded = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": type } });
  if (!uploaded.ok) throw new Error("Upload failed. Retry this file.");
  item.uploaded = { name: file.name, size: file.size, type, objectPath, cloudinaryPublicId: "", cloudinaryUrl: "", relativePath: item.relativePath };
  return item.uploaded;
}

// A session keeps folder resolution and successful registrations stable across
// per-file callbacks and retries. Filenames never establish version relationships.
export function createRegistrationSession({
  base, folderId, supersedesId, projectContextId, nativeProjectTree, getFolders, createFolder, createFile,
}: {
  base: string; folderId: number | null; supersedesId?: number;
  projectContextId?: number;
  nativeProjectTree?: boolean;
  getFolders: () => Folder[];
  createFolder: (data: { name: string; parentId: number | null }) => Promise<Folder>;
  createFile: (data: CreateDocument) => Promise<unknown>;
}) {
  const paths = new Map<string, number>();
  const registered = new Set<string>();
  async function ensureFolder(path: string) {
    let parentId = folderId;
    let key = "";
    for (const name of path.split("/").filter(Boolean)) {
      key = key ? `${key}/${name}` : name;
      const cached = paths.get(key);
      if (cached !== undefined) { parentId = cached; continue; }
      let folder = getFolders().find(f => f.parentId === parentId && f.name === name);
      if (!folder) {
        try { folder = await createFolder({ name, parentId }); }
        catch (error) {
          const params = new URLSearchParams();
          if (projectContextId) params.set("projectId", String(projectContextId));
          if (nativeProjectTree) params.set("native", "true");
          const response = await apiRequest("GET", `${base}/folders${params.size ? `?${params}` : ""}`);
          const fresh: Folder[] = await response.json();
          folder = fresh.find(f => f.parentId === parentId && f.name === name);
          if (!folder) throw error;
        }
      }
      paths.set(key, folder.id);
      parentId = folder.id;
    }
    return parentId;
  }
  async function register(files: UploadResult[]) {
    for (const file of files) {
      if (!file.objectPath) throw new Error("Uploaded file has no storage path.");
      if (registered.has(file.objectPath)) continue;
      const targetFolderId = supersedesId ? undefined : file.relativePath ? await ensureFolder(file.relativePath) : folderId;
      await createFile({ name: file.name, objectPath: file.objectPath, contentType: file.type, size: file.size, ...(supersedesId ? { supersedesId } : { folderId: targetFolderId }) });
      registered.add(file.objectPath);
    }
  }
  return { register, ensureFolder };
}
