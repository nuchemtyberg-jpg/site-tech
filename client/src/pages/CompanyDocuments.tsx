import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CompanyFile, CompanyFolder } from "@shared/schema";
import { format } from "date-fns";
import { cn, getProxyUrl, getProxyUrlWithFilename } from "@/lib/utils";
import { NativeFileUploader } from "@/components/NativeFileUploader";
import { PDFViewer } from "@/components/PDFViewer";
import { TagInput } from "@/components/TagInput";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, Upload, FolderPlus, LayoutGrid, List, Star, CheckSquare, Check,
  FolderInput, Trash2, Folder, Pencil, Info, Tags, Download, X, File, FileText,
  ChevronRight, Home, MoreVertical, ArrowLeft, Calendar, HardDrive, FileType,
  Image as ImageIcon, Files, Play, Video
} from "lucide-react";

export default function CompanyDocuments() {
  const { toast } = useToast();

  const { data: files, isLoading: isFilesLoading } = useQuery<CompanyFile[]>({
    queryKey: ['/api/company-documents/files'],
  });
  const { data: folders, isLoading: isFoldersLoading } = useQuery<CompanyFolder[]>({
    queryKey: ['/api/company-documents/folders'],
  });

  const createFileMutation = useMutation({
    mutationFn: async (data: { name: string; objectPath: string; folderId?: number | null; contentType?: string; size?: number }) => {
      const res = await apiRequest("POST", "/api/company-documents/files", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-documents/files'] });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/company-documents/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-documents/files'] });
    },
  });

  const updateFileMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; tags?: string[] | null; folderId?: number | null; starred?: boolean }) => {
      return apiRequest("PUT", `/api/company-documents/files/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-documents/files'] });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (data: { name: string; parentId?: number | null }): Promise<CompanyFolder> => {
      const res = await apiRequest("POST", "/api/company-documents/folders", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-documents/folders'] });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; parentId?: number | null }) => {
      return apiRequest("PUT", `/api/company-documents/folders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-documents/folders'] });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/company-documents/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-documents/folders'] });
    },
  });

  const batchDeleteFilesMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/company-documents/files/batch-delete", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-documents/files'] });
    },
  });

  const batchMoveFilesMutation = useMutation({
    mutationFn: async ({ ids, folderId }: { ids: number[]; folderId: number | null }) => {
      return apiRequest("POST", "/api/company-documents/files/batch-move", { ids, folderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-documents/files'] });
    },
  });

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [viewingFile, setViewingFile] = useState<CompanyFile | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const currentFolderIdRef = useRef<number | null>(null);
  currentFolderIdRef.current = currentFolderId;

  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [isFileSelectMode, setIsFileSelectMode] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [renamingFile, setRenamingFile] = useState<CompanyFile | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogViewFolderId, setMoveDialogViewFolderId] = useState<number | null>(null);
  const [moveDialogBreadcrumbs, setMoveDialogBreadcrumbs] = useState<Array<{ id: number; name: string }>>([]);
  const [moveDialogChildFolders, setMoveDialogChildFolders] = useState<Array<{ id: number; name: string; hasChildren: boolean }>>([]);
  const [moveDialogLoading, setMoveDialogLoading] = useState(false);
  const [fileDetailsPanel, setFileDetailsPanel] = useState<CompanyFile | null>(null);
  const [showBatchDeleteFilesConfirm, setShowBatchDeleteFilesConfirm] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingDragDrop, setIsUploadingDragDrop] = useState(false);
  const [dragDropProgress, setDragDropProgress] = useState({ current: 0, total: 0 });
  const dragCounter = useRef(0);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [deleteFolderId, setDeleteFolderId] = useState<number | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<number | null>(null);
  const [editingFile, setEditingFile] = useState<CompanyFile | null>(null);
  const [editFileTags, setEditFileTags] = useState<string[]>([]);

  const isImageFile = (contentType: string | null) => {
    return contentType?.startsWith('image/') || false;
  };

  const isVideoFile = (contentType: string | null) => {
    return contentType?.startsWith('video/') || false;
  };

  const isPdfFile = (contentType: string | null) => {
    return contentType === 'application/pdf';
  };

  const handleFileClick = (file: CompanyFile) => {
    if (isPdfFile(file.contentType)) {
      window.open(getProxyUrlWithFilename(file.objectPath, file.name), '_blank');
    } else {
      setViewingFile(file);
    }
  };

  const handleDirectDownload = async (file: CompanyFile) => {
    try {
      const downloadUrl = getProxyUrlWithFilename(file.objectPath, file.name, true);
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Unable to download the file.",
        variant: "destructive"
      });
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  };

  type FileWithPath = { file: File; relativePath: string };

  const readDirectoryEntriesWithPaths = async (
    dirEntry: FileSystemDirectoryEntry,
    parentPath: string = ""
  ): Promise<{ files: FileWithPath[]; folders: string[] }> => {
    const filesResult: FileWithPath[] = [];
    const foldersResult: string[] = [];
    const reader = dirEntry.createReader();

    const readEntries = (): Promise<FileSystemEntry[]> => {
      return new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
    };

    let entries: FileSystemEntry[] = [];
    let batch = await readEntries();
    while (batch.length > 0) {
      entries = entries.concat(batch);
      batch = await readEntries();
    }

    for (const entry of entries) {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
        filesResult.push({ file, relativePath: parentPath });
      } else if (entry.isDirectory) {
        const folderPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        foldersResult.push(folderPath);
        const subResult = await readDirectoryEntriesWithPaths(entry as FileSystemDirectoryEntry, folderPath);
        filesResult.push(...subResult.files);
        foldersResult.push(...subResult.folders);
      }
    }

    return { files: filesResult, folders: foldersResult };
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);

    const allFilesWithPaths: FileWithPath[] = [];
    const allFolderPaths: string[] = [];
    const items = e.dataTransfer.items;

    if (items && items.length > 0) {
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }

      for (const entry of entries) {
        if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry;
          const file = await new Promise<File>((resolve, reject) => {
            fileEntry.file(resolve, reject);
          });
          allFilesWithPaths.push({ file, relativePath: "" });
        } else if (entry.isDirectory) {
          allFolderPaths.push(entry.name);
          const result = await readDirectoryEntriesWithPaths(entry as FileSystemDirectoryEntry, entry.name);
          allFilesWithPaths.push(...result.files);
          allFolderPaths.push(...result.folders);
        }
      }
    } else {
      allFilesWithPaths.push(...Array.from(e.dataTransfer.files).map(f => ({ file: f, relativePath: "" })));
    }

    if (allFilesWithPaths.length === 0 && allFolderPaths.length === 0) return;

    setIsUploadingDragDrop(true);
    const totalOperations = allFolderPaths.length + allFilesWithPaths.length;
    setDragDropProgress({ current: 0, total: totalOperations });

    const maxFileSize = 52428800;
    const validFilesWithPaths = allFilesWithPaths.filter(f => f.file.size <= maxFileSize);
    const skippedCount = allFilesWithPaths.length - validFilesWithPaths.length;

    if (skippedCount > 0) {
      toast({
        title: "Some files skipped",
        description: `${skippedCount} file(s) exceeded the 50MB limit.`,
        variant: "destructive"
      });
    }

    if (validFilesWithPaths.length === 0 && allFolderPaths.length === 0) {
      setIsUploadingDragDrop(false);
      return;
    }

    let operationIndex = 0;
    let successCount = 0;
    const failedFiles: string[] = [];
    const skippedDueToFolderFailure: string[] = [];

    const folderPathToId: Map<string, number> = new Map();
    const failedFolderPaths: Set<string> = new Set();

    const sortedFolderPaths = [...new Set(allFolderPaths)].sort((a, b) =>
      a.split('/').length - b.split('/').length
    );

    for (const folderPath of sortedFolderPaths) {
      operationIndex++;
      setDragDropProgress({ current: operationIndex, total: totalOperations });

      const pathParts = folderPath.split('/');
      const fName = pathParts[pathParts.length - 1];
      const parentPath = pathParts.slice(0, -1).join('/');

      if (parentPath && failedFolderPaths.has(parentPath)) {
        failedFolderPaths.add(folderPath);
        continue;
      }

      let parentFolderId = currentFolderIdRef.current;
      if (parentPath && folderPathToId.has(parentPath)) {
        parentFolderId = folderPathToId.get(parentPath)!;
      }

      let resolved = false;
      try {
        const newFolder = await createFolderMutation.mutateAsync({
          name: fName,
          parentId: parentFolderId,
        });
        folderPathToId.set(folderPath, newFolder.id);
        resolved = true;
      } catch {
        try {
          const freshFoldersRes = await fetch('/api/company-documents/folders');
          if (freshFoldersRes.ok) {
            const freshFolders = await freshFoldersRes.json();
            const existingFolder = freshFolders.find((f: { name: string; parentId: number | null }) =>
              f.name === fName && f.parentId === parentFolderId
            );
            if (existingFolder) {
              folderPathToId.set(folderPath, existingFolder.id);
              resolved = true;
            }
          }
        } catch {
          // Fallback failed
        }
      }

      if (!resolved) {
        failedFolderPaths.add(folderPath);
      }
    }

    if (sortedFolderPaths.length > 0) {
      await queryClient.invalidateQueries({ queryKey: ["/api/company-documents/folders"] });
    }

    const requiredPaths = new Set<string>();
    for (const { relativePath } of validFilesWithPaths) {
      if (relativePath) {
        requiredPaths.add(relativePath);
      }
    }

    const unresolvedPaths: string[] = [];
    for (const path of requiredPaths) {
      if (!folderPathToId.has(path) && !failedFolderPaths.has(path)) {
        unresolvedPaths.push(path);
        failedFolderPaths.add(path);
      }
    }

    if (unresolvedPaths.length > 0) {
      toast({
        title: "Folder structure incomplete",
        description: `Some folders couldn't be resolved: ${unresolvedPaths.slice(0, 2).join(', ')}${unresolvedPaths.length > 2 ? '...' : ''}`,
        variant: "destructive"
      });
    }

    for (const { file, relativePath } of validFilesWithPaths) {
      operationIndex++;
      setDragDropProgress({ current: operationIndex, total: totalOperations });

      if (relativePath) {
        if (failedFolderPaths.has(relativePath) || !folderPathToId.has(relativePath)) {
          skippedDueToFolderFailure.push(`${relativePath}/${file.name}`);
          continue;
        }
        const pathParts = relativePath.split('/');
        let failedPath = false;
        for (let i = 1; i <= pathParts.length; i++) {
          const checkPath = pathParts.slice(0, i).join('/');
          if (failedFolderPaths.has(checkPath)) {
            failedPath = true;
            break;
          }
        }
        if (failedPath) {
          skippedDueToFolderFailure.push(`${relativePath}/${file.name}`);
          continue;
        }
      }

      let targetFolderId = currentFolderIdRef.current;
      if (relativePath && folderPathToId.has(relativePath)) {
        targetFolderId = folderPathToId.get(relativePath)!;
      }

      try {
        const res = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type || 'application/octet-stream',
          }),
        });

        if (!res.ok) throw new Error("Failed to get upload URL");
        const { uploadURL, objectPath } = await res.json();

        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || 'application/octet-stream' },
        });

        if (!uploadRes.ok) throw new Error("Upload failed");

        await createFileMutation.mutateAsync({
          name: file.name,
          objectPath,
          folderId: targetFolderId,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        });
        successCount++;
      } catch {
        failedFiles.push(relativePath ? `${relativePath}/${file.name}` : file.name);
      }
    }

    setIsUploadingDragDrop(false);

    if (skippedDueToFolderFailure.length > 0) {
      toast({
        title: "Some files were skipped",
        description: `${skippedDueToFolderFailure.length} file(s) skipped because their folders couldn't be created: ${skippedDueToFolderFailure.slice(0, 2).join(', ')}${skippedDueToFolderFailure.length > 2 ? '...' : ''}`,
        variant: "destructive"
      });
    }

    if (successCount > 0 && failedFiles.length === 0) {
      toast({
        title: "Upload complete",
        description: `${successCount} file(s) uploaded successfully.${failedFolderPaths.size > 0 ? ` Some folders couldn't be created.` : ''}`
      });
    } else if (successCount > 0 && failedFiles.length > 0) {
      toast({
        title: "Partial upload",
        description: `${successCount} file(s) uploaded. ${failedFiles.length} failed: ${failedFiles.slice(0, 2).join(', ')}${failedFiles.length > 2 ? '...' : ''}`,
        variant: "destructive"
      });
    } else if (failedFiles.length > 0) {
      toast({
        title: "Upload failed",
        description: `All ${failedFiles.length} file(s) failed to upload.`,
        variant: "destructive"
      });
    }
  };

  const handleUploadComplete = async (uploadedFiles: Array<{ name: string; cloudinaryPublicId: string; cloudinaryUrl: string; size: number; type: string; relativePath?: string }>) => {
    let successCount = 0;
    const skippedFiles: string[] = [];

    const allFolderPaths: string[] = [];
    for (const file of uploadedFiles) {
      if (file.relativePath) {
        const pathParts = file.relativePath.split('/');
        for (let i = 1; i <= pathParts.length; i++) {
          const partialPath = pathParts.slice(0, i).join('/');
          if (!allFolderPaths.includes(partialPath)) {
            allFolderPaths.push(partialPath);
          }
        }
      }
    }

    const sortedFolderPaths = allFolderPaths.sort((a, b) =>
      a.split('/').length - b.split('/').length
    );

    const folderPathToId: Map<string, number> = new Map();
    const failedFolderPaths: Set<string> = new Set();

    for (const folderPath of sortedFolderPaths) {
      const pathParts = folderPath.split('/');
      const fName = pathParts[pathParts.length - 1];
      const parentPath = pathParts.slice(0, -1).join('/');

      if (parentPath && failedFolderPaths.has(parentPath)) {
        failedFolderPaths.add(folderPath);
        continue;
      }

      let parentFolderId = currentFolderIdRef.current;
      if (parentPath && folderPathToId.has(parentPath)) {
        parentFolderId = folderPathToId.get(parentPath)!;
      }

      let resolved = false;
      try {
        const newFolder = await createFolderMutation.mutateAsync({
          name: fName,
          parentId: parentFolderId,
        });
        folderPathToId.set(folderPath, newFolder.id);
        resolved = true;
      } catch {
        try {
          const freshFoldersRes = await fetch('/api/company-documents/folders');
          if (freshFoldersRes.ok) {
            const freshFolders = await freshFoldersRes.json();
            const existingFolder = freshFolders.find((f: { name: string; parentId: number | null }) =>
              f.name === fName && f.parentId === parentFolderId
            );
            if (existingFolder) {
              folderPathToId.set(folderPath, existingFolder.id);
              resolved = true;
            }
          }
        } catch {
          // Fallback failed
        }
      }

      if (!resolved) {
        failedFolderPaths.add(folderPath);
      }
    }

    if (sortedFolderPaths.length > 0) {
      await queryClient.invalidateQueries({ queryKey: ["/api/company-documents/folders"] });
    }

    const requiredPaths = new Set<string>();
    for (const file of uploadedFiles) {
      if (file.relativePath) {
        requiredPaths.add(file.relativePath);
      }
    }

    for (const path of requiredPaths) {
      if (!folderPathToId.has(path) && !failedFolderPaths.has(path)) {
        failedFolderPaths.add(path);
      }
    }

    if (failedFolderPaths.size > 0) {
      const failedList = Array.from(failedFolderPaths).slice(0, 3);
      toast({
        title: "Folder structure incomplete",
        description: `Could not create: ${failedList.join(', ')}${failedFolderPaths.size > 3 ? '...' : ''}`,
        variant: "destructive"
      });
    }

    for (const file of uploadedFiles) {
      if (file.relativePath) {
        if (failedFolderPaths.has(file.relativePath) || !folderPathToId.has(file.relativePath)) {
          skippedFiles.push(`${file.relativePath}/${file.name}`);
          continue;
        }
        const pathParts = file.relativePath.split('/');
        let failedPath = false;
        for (let i = 1; i <= pathParts.length; i++) {
          const checkPath = pathParts.slice(0, i).join('/');
          if (failedFolderPaths.has(checkPath)) {
            failedPath = true;
            break;
          }
        }
        if (failedPath) {
          skippedFiles.push(`${file.relativePath}/${file.name}`);
          continue;
        }
      }

      try {
        let targetFolderId = currentFolderIdRef.current;
        if (file.relativePath && folderPathToId.has(file.relativePath)) {
          targetFolderId = folderPathToId.get(file.relativePath)!;
        }

        await createFileMutation.mutateAsync({
          name: file.name,
          objectPath: file.cloudinaryUrl,
          contentType: file.type,
          size: file.size,
          folderId: targetFolderId,
        });
        successCount++;
      } catch {
        toast({ title: "Error", description: `Failed to save ${file.name}`, variant: "destructive" });
      }
    }

    if (skippedFiles.length > 0) {
      toast({
        title: "Some files skipped",
        description: `${skippedFiles.length} file(s) were not saved because their folders couldn't be created.`,
        variant: "destructive"
      });
    }

    if (successCount > 0) {
      toast({ title: "Upload Complete", description: `${successCount} file(s) uploaded successfully.` });
    }
  };

  const currentFolders = folders?.filter(f =>
    currentFolderId === null ? f.parentId === null : f.parentId === currentFolderId
  ) || [];

  const currentFiles = files?.filter(f => f.folderId === currentFolderId) || [];

  const starredFiles = files?.filter(f => f.starred) || [];

  const filteredFiles = useMemo(() => {
    let result = showStarredOnly ? starredFiles : currentFiles;

    if (docSearchQuery.trim()) {
      const query = docSearchQuery.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(query) ||
        (f.tags && f.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    return [...result].sort((a, b) => a.id - b.id);
  }, [currentFiles, starredFiles, showStarredOnly, docSearchQuery]);

  const filteredFolders = useMemo(() => {
    if (!docSearchQuery.trim() || showStarredOnly) return currentFolders;
    const query = docSearchQuery.toLowerCase();
    return currentFolders.filter(f => f.name.toLowerCase().includes(query));
  }, [currentFolders, docSearchQuery, showStarredOnly]);

  const allFiles = filteredFiles;

  const groupedFiles = allFiles.reduce((groups, file) => {
    const date = file.createdAt ? new Date(file.createdAt) : new Date();
    const dateKey = format(date, "MMMM d, yyyy");
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(file);
    return groups;
  }, {} as Record<string, typeof allFiles>);

  const sortedDateGroups = Object.entries(groupedFiles).sort((a, b) => {
    const dateA = new Date(a[0]);
    const dateB = new Date(b[0]);
    return dateB.getTime() - dateA.getTime();
  });

  const getFileIcon = (file: CompanyFile) => {
    if (isImageFile(file.contentType)) {
      return <ImageIcon className="w-5 h-5 text-green-500" />;
    } else if (isVideoFile(file.contentType)) {
      return <Video className="w-5 h-5 text-blue-500" />;
    } else if (isPdfFile(file.contentType)) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    return <File className="w-5 h-5 text-muted-foreground" />;
  };

  const getFileThumbnail = (file: CompanyFile) => {
    if (isImageFile(file.contentType)) {
      return (
        <img
          src={getProxyUrl(file.objectPath)}
          alt={file.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      );
    } else if (isVideoFile(file.contentType)) {
      return (
        <div className="relative w-full h-full flex items-center justify-center bg-black/10">
          <Video className="w-10 h-10 text-blue-500" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/60 rounded-full p-2">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
          </div>
        </div>
      );
    } else if (isPdfFile(file.contentType)) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-red-500/10">
          <FileText className="w-10 h-10 text-red-500" />
          <span className="text-xs text-red-500 font-medium mt-1">PDF</span>
        </div>
      );
    }
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50">
        <File className="w-10 h-10 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium mt-1 uppercase">
          {file.name.split('.').pop()?.slice(0, 4) || 'FILE'}
        </span>
      </div>
    );
  };

  const getBreadcrumbs = () => {
    const crumbs: Array<{ id: number | null; name: string }> = [{ id: null, name: "Documents" }];
    if (currentFolderId && folders) {
      let folder = folders.find(f => f.id === currentFolderId);
      const path: typeof crumbs = [];
      while (folder) {
        path.unshift({ id: folder.id, name: folder.name });
        folder = folder.parentId ? folders.find(f => f.id === folder!.parentId) : undefined;
      }
      crumbs.push(...path);
    }
    return crumbs;
  };

  const handleCreateFolder = () => {
    if (!folderName.trim()) return;
    createFolderMutation.mutate({ name: folderName.trim(), parentId: currentFolderId }, {
      onSuccess: () => {
        setIsFolderOpen(false);
        setFolderName("");
        toast({ title: "Folder Created", description: "New folder added." });
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const fetchMoveDialogFolders = async (parentId: number | null) => {
    setMoveDialogLoading(true);
    try {
      const parentParam = parentId === null ? 'null' : String(parentId);
      const res = await fetch(`/api/company-documents/folders/children?parentId=${parentParam}`);
      if (res.ok) {
        const data = await res.json();
        setMoveDialogChildFolders(data);
      }
    } finally {
      setMoveDialogLoading(false);
    }
  };

  const fetchMoveDialogBreadcrumbs = async (folderId: number | null) => {
    if (folderId === null) {
      setMoveDialogBreadcrumbs([]);
      return;
    }
    try {
      const res = await fetch(`/api/company-documents/folders/${folderId}/path`);
      if (res.ok) {
        const data = await res.json();
        setMoveDialogBreadcrumbs(data);
      }
    } catch {
      setMoveDialogBreadcrumbs([]);
    }
  };

  const openMoveDialog = async () => {
    setMoveDialogOpen(true);
    setMoveDialogViewFolderId(null);
    setMoveDialogBreadcrumbs([]);
    await fetchMoveDialogFolders(null);
  };

  const navigateToFolder = async (folderId: number | null) => {
    setMoveDialogViewFolderId(folderId);
    await Promise.all([
      fetchMoveDialogFolders(folderId),
      fetchMoveDialogBreadcrumbs(folderId)
    ]);
  };

  const wouldCreateCycle = (targetFolderId: number | null): boolean => {
    if (selectedFolders.size === 0) return false;
    if (targetFolderId === null) return false;

    const getDescendantIds = (parentId: number): Set<number> => {
      const descendants: Set<number> = new Set();
      const stack = [parentId];
      while (stack.length > 0) {
        const current = stack.pop()!;
        const children = folders?.filter(f => f.parentId === current) || [];
        for (const child of children) {
          descendants.add(child.id);
          stack.push(child.id);
        }
      }
      return descendants;
    };

    for (const folderId of Array.from(selectedFolders)) {
      if (folderId === targetFolderId) return true;
      const descendants = getDescendantIds(folderId);
      if (descendants.has(targetFolderId)) return true;
    }
    return false;
  };

  const isNoOpMove = (targetFolderId: number | null): boolean => {
    const targetFilesAlreadyThere = Array.from(selectedFiles).every(fileId => {
      const file = files?.find(f => f.id === fileId);
      return file?.folderId === targetFolderId;
    });
    const targetFoldersAlreadyThere = Array.from(selectedFolders).every(folderId => {
      const folder = folders?.find(f => f.id === folderId);
      return folder?.parentId === targetFolderId;
    });
    return targetFilesAlreadyThere && targetFoldersAlreadyThere;
  };

  const handleMoveToFolder = async (targetFolderId: number | null) => {
    if (wouldCreateCycle(targetFolderId)) {
      toast({
        title: "Cannot move here",
        description: "Moving a folder into itself or its subfolder would create a loop.",
        variant: "destructive"
      });
      return;
    }

    if (isNoOpMove(targetFolderId)) {
      toast({
        title: "Already in this folder",
        description: "The selected items are already in this location."
      });
      return;
    }

    const failedFolderNames: string[] = [];
    const failedFolderIds: Set<number> = new Set();

    if (selectedFiles.size > 0) {
      try {
        await batchMoveFilesMutation.mutateAsync({ ids: Array.from(selectedFiles), folderId: targetFolderId });
      } catch {
        toast({ title: "Error", description: "Failed to move some files", variant: "destructive" });
      }
    }

    for (const folderId of Array.from(selectedFolders)) {
      try {
        await updateFolderMutation.mutateAsync({ id: folderId, parentId: targetFolderId });
      } catch {
        failedFolderIds.add(folderId);
        const folder = folders?.find(f => f.id === folderId);
        failedFolderNames.push(folder?.name || String(folderId));
      }
    }

    if (failedFolderNames.length > 0) {
      toast({
        title: "Some folders could not be moved",
        description: `Failed: ${failedFolderNames.join(', ')}`,
        variant: "destructive"
      });
      setSelectedFolders(failedFolderIds);
    } else {
      setSelectedFolders(new Set());
    }
    setSelectedFiles(new Set());
    if (failedFolderIds.size === 0) {
      setIsFileSelectMode(false);
    }
    setMoveDialogOpen(false);
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Files className="w-6 h-6" />
          Company Documents
        </h1>
        <p className="text-muted-foreground mt-1">Manage company-wide documents and files</p>
      </div>

      <div className="flex flex-col h-[calc(100vh-200px)] overflow-hidden">
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative rounded-lg transition-all flex flex-col h-full",
            isDragOver && "ring-2 ring-primary ring-offset-2 bg-primary/5"
          )}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary pointer-events-none">
              <div className="text-center pointer-events-none">
                <Upload className="w-12 h-12 mx-auto text-primary mb-2" />
                <p className="text-lg font-medium text-primary">Drop files here to upload</p>
                <p className="text-sm text-muted-foreground">Files will be uploaded to the current folder</p>
              </div>
            </div>
          )}

          {isUploadingDragDrop && (
            <div className="mb-3 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                <span className="text-sm">
                  Uploading file {dragDropProgress.current} of {dragDropProgress.total}...
                </span>
              </div>
            </div>
          )}

          <div className="sticky top-0 z-20 bg-background pb-3 space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search files and folders..."
                value={docSearchQuery}
                onChange={(e) => setDocSearchQuery(e.target.value)}
                className="pl-10 bg-white dark:bg-zinc-900"
                data-testid="cd-input-doc-search"
              />
              {docSearchQuery && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setDocSearchQuery("")}
                  data-testid="cd-button-clear-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-row items-center justify-between relative z-10 gap-2">
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('grid')}
                    data-testid="cd-button-view-grid"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('list')}
                    data-testid="cd-button-view-list"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>

                <Button
                  variant={showStarredOnly ? 'default' : 'outline'}
                  className="toggle-elevate"
                  onClick={() => {
                    setShowStarredOnly(!showStarredOnly);
                    if (!showStarredOnly) setCurrentFolderId(null);
                  }}
                  data-testid="cd-button-toggle-starred"
                >
                  <Star className={cn("w-4 h-4 shrink-0", showStarredOnly && "fill-current")} />
                  <span className="hidden sm:inline ml-2">Starred</span>
                  {starredFiles.length > 0 && (
                    <Badge variant="secondary" className="hidden sm:inline-flex text-xs ml-1">{starredFiles.length}</Badge>
                  )}
                </Button>

                <Button
                  variant={isFileSelectMode ? 'default' : 'outline'}
                  className="toggle-elevate"
                  onClick={() => {
                    setIsFileSelectMode(!isFileSelectMode);
                    if (isFileSelectMode) {
                      setSelectedFiles(new Set());
                      setSelectedFolders(new Set());
                    }
                  }}
                  data-testid="cd-button-toggle-select-mode"
                >
                  <CheckSquare className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline ml-2">{isFileSelectMode ? 'Cancel' : 'Select'}</span>
                </Button>
              </div>

              {isFileSelectMode && (selectedFiles.size > 0 || selectedFolders.size > 0) && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {selectedFiles.size + selectedFolders.size} selected
                    {selectedFolders.size > 0 && ` (${selectedFolders.size} folder${selectedFolders.size > 1 ? 's' : ''})`}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openMoveDialog}
                    data-testid="cd-button-batch-move"
                  >
                    <FolderInput className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">Move</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBatchDeleteFilesConfirm(true)}
                    className="text-destructive hover:text-destructive"
                    data-testid="cd-button-batch-delete"
                  >
                    <Trash2 className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              )}

              {!isFileSelectMode && (
                <div className="flex flex-row items-center gap-2 sm:gap-3 shrink-0">
                  <Dialog open={isFolderOpen} onOpenChange={setIsFolderOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" data-testid="cd-button-new-folder">
                        <FolderPlus className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline ml-2">New Folder</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Folder</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="grid gap-2">
                          <Label htmlFor="cd-folderName">Folder Name</Label>
                          <Input
                            id="cd-folderName"
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                            placeholder="e.g. Company Policies"
                            data-testid="cd-input-folder-name"
                            className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                          />
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreateFolder} disabled={createFolderMutation.isPending} data-testid="cd-button-create-folder">
                            {createFolderMutation.isPending ? "Creating..." : "Create Folder"}
                          </Button>
                        </DialogFooter>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <NativeFileUploader
                    maxNumberOfFiles={50}
                    maxFileSize={52428800}
                    allowFolders={true}
                    buttonVariant="outline"
                    onUploadComplete={handleUploadComplete}
                  >
                    <Upload className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline ml-2">Upload</span>
                  </NativeFileUploader>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
              {getBreadcrumbs().map((crumb, idx, arr) => (
                <div key={crumb.id ?? 'root'} className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentFolderId(crumb.id)}
                    className={cn(
                      "hover:text-primary transition-colors",
                      idx === arr.length - 1 ? "text-foreground font-medium" : ""
                    )}
                    data-testid={`cd-breadcrumb-${crumb.id ?? 'root'}`}
                  >
                    {idx === 0 ? <Home className="w-4 h-4" /> : crumb.name}
                  </button>
                  {idx < arr.length - 1 && <ChevronRight className="w-4 h-4" />}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {(isFilesLoading || isFoldersLoading) ? (
              <div className="py-10 text-center text-muted-foreground">Loading documents...</div>
            ) : (filteredFolders.length === 0 && allFiles.length === 0) ? (
              <div className="py-20 text-center bg-card border border-dashed border-border rounded-xl">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {docSearchQuery ? "No matching files or folders found." :
                   showStarredOnly ? "No starred files yet. Star files to access them quickly." :
                   "No documents yet. Upload files or create folders to organize your company documents."}
                </p>
              </div>
            ) : (
              <div className="space-y-4 w-full max-w-full overflow-hidden">
                {!showStarredOnly && filteredFolders.length > 0 && (
                  <div className="grid gap-2">
                    {filteredFolders.map(folder => (
                      <div
                        key={folder.id}
                        className={cn(
                          "group bg-card border rounded-lg p-3 hover:border-primary/50 transition-all flex items-center justify-between",
                          selectedFolders.has(folder.id) ? "border-primary ring-2 ring-primary/30" : "border-border"
                        )}
                        data-testid={`cd-folder-item-${folder.id}`}
                      >
                        {isFileSelectMode && (
                          <button
                            onClick={() => {
                              const newSelected = new Set(selectedFolders);
                              if (newSelected.has(folder.id)) {
                                newSelected.delete(folder.id);
                              } else {
                                newSelected.add(folder.id);
                              }
                              setSelectedFolders(newSelected);
                            }}
                            className="shrink-0 mr-3"
                            data-testid={`cd-checkbox-folder-${folder.id}`}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded border-2 flex items-center justify-center",
                              selectedFolders.has(folder.id) ? "bg-primary border-primary" : "border-muted-foreground"
                            )}>
                              {selectedFolders.has(folder.id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        )}
                        <button
                          className="flex items-center gap-3 flex-1 text-left hover:text-primary transition-colors"
                          onClick={() => !isFileSelectMode && setCurrentFolderId(folder.id)}
                          data-testid={`cd-button-open-folder-${folder.id}`}
                        >
                          <Folder className="w-5 h-5 text-primary" />
                          <span className="font-medium">{folder.name}</span>
                        </button>
                        {!isFileSelectMode && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingFolder({ id: folder.id, name: folder.name });
                                setRenameValue(folder.name);
                              }}
                              data-testid={`cd-button-rename-folder-${folder.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteFolderId(folder.id);
                              }}
                              data-testid={`cd-button-delete-folder-${folder.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === 'grid' && sortedDateGroups.length > 0 && (
                  <div className="space-y-6">
                    {sortedDateGroups.map(([dateGroup, groupFiles]) => (
                      <div key={dateGroup} className="space-y-3">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{dateGroup}</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                          {groupFiles.map((file: CompanyFile) => (
                            <div
                              key={file.id}
                              className={cn(
                                "group relative aspect-square bg-card border rounded-lg overflow-hidden hover:border-primary/50 transition-all cursor-pointer",
                                selectedFiles.has(file.id) ? "border-primary ring-2 ring-primary/30" : "border-border"
                              )}
                              data-testid={`cd-file-item-${file.id}`}
                              onClick={() => {
                                if (isFileSelectMode) {
                                  const newSelected = new Set(selectedFiles);
                                  if (newSelected.has(file.id)) {
                                    newSelected.delete(file.id);
                                  } else {
                                    newSelected.add(file.id);
                                  }
                                  setSelectedFiles(newSelected);
                                } else {
                                  handleFileClick(file);
                                }
                              }}
                            >
                              {getFileThumbnail(file)}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1">
                                <p className="text-white text-xs truncate">{file.name}</p>
                                {file.tags && file.tags.length > 0 && (
                                  <p className="text-white/70 text-xs truncate">{file.tags.length} tag{file.tags.length !== 1 ? 's' : ''}</p>
                                )}
                              </div>
                              {isFileSelectMode && (
                                <div className="absolute top-1 left-1">
                                  <div className={cn(
                                    "w-5 h-5 rounded border-2 flex items-center justify-center",
                                    selectedFiles.has(file.id) ? "bg-primary border-primary" : "bg-black/50 border-white"
                                  )}>
                                    {selectedFiles.has(file.id) && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                </div>
                              )}
                              <button
                                className={cn(
                                  "absolute top-1 left-1 p-1.5 rounded bg-black/50 hover-elevate",
                                  isFileSelectMode && "hidden",
                                  file.starred ? "opacity-100 text-yellow-400" : "opacity-0 group-hover:opacity-100 text-white"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateFileMutation.mutate({ id: file.id, starred: !file.starred });
                                }}
                                data-testid={`cd-button-star-file-${file.id}`}
                              >
                                <Star className={cn("w-3.5 h-3.5", file.starred && "fill-current")} />
                              </button>
                              <div className={cn(
                                "absolute top-1 right-1 flex gap-1",
                                isFileSelectMode ? "hidden" : "opacity-0 group-hover:opacity-100"
                              )}>
                                <button
                                  className="p-1.5 rounded bg-black/50 text-white hover-elevate"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFileDetailsPanel(file);
                                  }}
                                  data-testid={`cd-button-info-file-${file.id}`}
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  className="p-1.5 rounded bg-black/50 text-white hover-elevate"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingFile(file);
                                    setRenameValue(file.name);
                                  }}
                                  data-testid={`cd-button-rename-file-${file.id}`}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  className="p-1.5 rounded bg-black/50 text-white hover-elevate"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingFile(file);
                                    setEditFileTags(file.tags || []);
                                  }}
                                  data-testid={`cd-button-edit-file-${file.id}`}
                                >
                                  <Tags className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  className="p-1.5 rounded bg-black/50 text-white hover-elevate"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDirectDownload(file);
                                  }}
                                  data-testid={`cd-button-download-file-${file.id}`}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  className="p-1.5 rounded bg-black/50 text-white hover-elevate"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteFileId(file.id);
                                  }}
                                  data-testid={`cd-button-delete-file-${file.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === 'list' && allFiles.length > 0 && (
                  <div className="grid gap-2 w-full max-w-full overflow-hidden">
                    {allFiles.map((file: CompanyFile) => (
                      <div
                        key={file.id}
                        className={cn(
                          "group bg-card border rounded-lg p-3 hover:border-primary/50 transition-all flex items-center gap-2 w-full max-w-full overflow-hidden",
                          selectedFiles.has(file.id) ? "border-primary ring-2 ring-primary/30" : "border-border"
                        )}
                        data-testid={`cd-file-item-${file.id}`}
                      >
                        {isFileSelectMode && (
                          <button
                            onClick={() => {
                              const newSelected = new Set(selectedFiles);
                              if (newSelected.has(file.id)) {
                                newSelected.delete(file.id);
                              } else {
                                newSelected.add(file.id);
                              }
                              setSelectedFiles(newSelected);
                            }}
                            className="shrink-0"
                            data-testid={`cd-checkbox-file-${file.id}`}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded border-2 flex items-center justify-center",
                              selectedFiles.has(file.id) ? "bg-primary border-primary" : "border-muted-foreground"
                            )}>
                              {selectedFiles.has(file.id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        )}
                        <button
                          onClick={() => isFileSelectMode ? null : handleFileClick(file)}
                          className="flex items-center gap-3 flex-1 text-left hover:text-primary transition-colors min-w-0 overflow-hidden"
                          data-testid={`cd-button-view-file-${file.id}`}
                        >
                          {getFileIcon(file)}
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <span className="font-medium block truncate">{file.name}</span>
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-xs text-muted-foreground shrink-0">
                                {file.createdAt && format(new Date(file.createdAt), "MMM d, yyyy")}
                                {file.size && ` • ${Math.round(file.size / 1024)} KB`}
                              </span>
                              {file.tags && file.tags.length > 0 && (
                                <div className="hidden sm:flex gap-1 overflow-hidden">
                                  {file.tags.slice(0, 2).map((tag) => (
                                    <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5 truncate max-w-[80px]" data-testid={`cd-file-tag-${file.id}-${tag}`}>
                                      {tag}
                                    </Badge>
                                  ))}
                                  {file.tags.length > 2 && (
                                    <Badge variant="outline" className="text-xs py-0 px-1.5 shrink-0">
                                      +{file.tags.length - 2}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                        {!isFileSelectMode && (
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(file.starred ? "text-yellow-500" : "text-muted-foreground")}
                              onClick={() => updateFileMutation.mutate({ id: file.id, starred: !file.starred })}
                              data-testid={`cd-button-star-file-${file.id}`}
                            >
                              <Star className={cn("w-4 h-4", file.starred && "fill-current")} />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="sm:hidden"
                                  data-testid={`cd-button-more-file-${file.id}`}
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setFileDetailsPanel(file)}>
                                  <Info className="w-4 h-4 mr-2" />
                                  Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDirectDownload(file)}>
                                  <Download className="w-4 h-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setRenamingFile(file);
                                  setRenameValue(file.name);
                                }}>
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setEditingFile(file);
                                  setEditFileTags(file.tags || []);
                                }}>
                                  <Tags className="w-4 h-4 mr-2" />
                                  Edit Tags
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setDeleteFileId(file.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hidden sm:flex opacity-0 group-hover:opacity-100"
                              onClick={() => setFileDetailsPanel(file)}
                              data-testid={`cd-button-info-file-${file.id}`}
                            >
                              <Info className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hidden sm:flex opacity-0 group-hover:opacity-100"
                              onClick={() => {
                                setRenamingFile(file);
                                setRenameValue(file.name);
                              }}
                              data-testid={`cd-button-rename-file-${file.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hidden sm:flex opacity-0 group-hover:opacity-100"
                              onClick={() => {
                                setEditingFile(file);
                                setEditFileTags(file.tags || []);
                              }}
                              data-testid={`cd-button-edit-file-${file.id}`}
                            >
                              <Tags className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hidden sm:flex opacity-0 group-hover:opacity-100"
                              onClick={() => handleDirectDownload(file)}
                              data-testid={`cd-button-download-file-${file.id}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hidden sm:flex opacity-0 group-hover:opacity-100"
                              onClick={() => setDeleteFileId(file.id)}
                              data-testid={`cd-button-delete-file-${file.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {viewingFile && isImageFile(viewingFile.contentType) && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" data-testid="cd-image-viewer-modal">
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <Button
              variant="outline"
              size="icon"
              className="bg-black/50 border-white/20 text-white"
              onClick={() => handleDirectDownload(viewingFile)}
              data-testid="cd-button-download-viewing"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-black/50 border-white/20 text-white"
              onClick={() => setViewingFile(null)}
              data-testid="cd-button-close-viewer"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <img
            src={getProxyUrl(viewingFile.objectPath)}
            alt={viewingFile.name}
            className="max-w-full max-h-full object-contain"
          />
          <div className="absolute inset-0 -z-10" onClick={() => setViewingFile(null)} />
        </div>
      )}

      {viewingFile && isPdfFile(viewingFile.contentType) && (
        <PDFViewer
          url={getProxyUrlWithFilename(viewingFile.objectPath, viewingFile.name)}
          fileName={viewingFile.name}
          onClose={() => setViewingFile(null)}
        />
      )}

      {viewingFile && isVideoFile(viewingFile.contentType) && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" data-testid="cd-video-viewer-modal" onClick={() => setViewingFile(null)}>
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            onClick={() => setViewingFile(null)}
            data-testid="cd-close-video-viewer"
          >
            <X className="w-6 h-6" />
          </button>
          <video
            src={getProxyUrl(viewingFile.objectPath)}
            controls
            autoPlay
            className="max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {viewingFile && !isPdfFile(viewingFile.contentType) && !isImageFile(viewingFile.contentType) && !isVideoFile(viewingFile.contentType) && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" data-testid="cd-document-viewer-modal">
          <div className="bg-card p-8 rounded-lg text-center max-w-md" onClick={(e) => e.stopPropagation()}>
            <File className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">{viewingFile.name}</p>
            <p className="text-muted-foreground mb-4">This file type cannot be previewed.</p>
            <div className="flex gap-2 justify-center">
              <a
                href={getProxyUrlWithFilename(viewingFile.objectPath, viewingFile.name, true)}
                download={viewingFile.name}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                data-testid="cd-link-download-file"
              >
                <Download className="w-4 h-4" /> Download
              </a>
              <Button variant="outline" onClick={() => setViewingFile(null)} data-testid="cd-button-close-download-prompt">
                Close
              </Button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setViewingFile(null)} />
        </div>
      )}

      <Dialog open={renamingFolder !== null} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="cd-rename-folder-name">Folder Name</Label>
              <Input
                id="cd-rename-folder-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter new folder name"
                className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                data-testid="cd-input-rename-folder"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolder(null)} data-testid="cd-button-cancel-rename-folder">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renamingFolder && renameValue.trim()) {
                  updateFolderMutation.mutate({ id: renamingFolder.id, name: renameValue.trim() });
                  setRenamingFolder(null);
                  setRenameValue("");
                }
              }}
              disabled={updateFolderMutation.isPending || !renameValue.trim()}
              data-testid="cd-button-save-rename-folder"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renamingFile !== null} onOpenChange={(open) => !open && setRenamingFile(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Rename File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="cd-rename-file-name">File Name</Label>
              <Input
                id="cd-rename-file-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter new file name"
                className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                data-testid="cd-input-rename-file"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFile(null)} data-testid="cd-button-cancel-rename-file">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renamingFile && renameValue.trim()) {
                  updateFileMutation.mutate({ id: renamingFile.id, name: renameValue.trim() });
                  setRenamingFile(null);
                  setRenameValue("");
                }
              }}
              disabled={updateFileMutation.isPending || !renameValue.trim()}
              data-testid="cd-button-save-rename-file"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showBatchDeleteFilesConfirm} onOpenChange={setShowBatchDeleteFilesConfirm}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Items</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedFiles.size + selectedFolders.size} item{selectedFiles.size + selectedFolders.size !== 1 ? 's' : ''}
              {selectedFolders.size > 0 && ` (including ${selectedFolders.size} folder${selectedFolders.size !== 1 ? 's' : ''})`}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cd-button-cancel-batch-delete-files">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const failedFolderIds: Set<number> = new Set();
                let fileDeleteFailed = false;

                if (selectedFiles.size > 0) {
                  try {
                    await batchDeleteFilesMutation.mutateAsync(Array.from(selectedFiles));
                  } catch {
                    fileDeleteFailed = true;
                    toast({ title: "Error", description: "Failed to delete some files", variant: "destructive" });
                  }
                }

                const failedFolderNames: string[] = [];
                for (const folderId of selectedFolders) {
                  try {
                    await deleteFolderMutation.mutateAsync(folderId);
                  } catch {
                    failedFolderIds.add(folderId);
                    const folder = folders?.find(f => f.id === folderId);
                    failedFolderNames.push(folder?.name || String(folderId));
                  }
                }

                if (failedFolderNames.length > 0) {
                  toast({
                    title: "Some folders could not be deleted",
                    description: `Failed: ${failedFolderNames.slice(0, 3).join(', ')}${failedFolderNames.length > 3 ? '...' : ''}. Folders with contents cannot be deleted.`,
                    variant: "destructive"
                  });
                }

                if (!fileDeleteFailed) {
                  setSelectedFiles(new Set());
                }

                if (failedFolderIds.size > 0) {
                  setSelectedFolders(failedFolderIds);
                } else {
                  setSelectedFolders(new Set());
                }

                if (!fileDeleteFailed && failedFolderIds.size === 0) {
                  setIsFileSelectMode(false);
                }
                setShowBatchDeleteFilesConfirm(false);
              }}
              data-testid="cd-button-confirm-batch-delete-files"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="bg-white dark:bg-zinc-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">
              Move {selectedFiles.size + selectedFolders.size} Item{selectedFiles.size + selectedFolders.size !== 1 ? 's' : ''}
              {selectedFolders.size > 0 && ` (${selectedFolders.size} folder${selectedFolders.size !== 1 ? 's' : ''})`}
            </DialogTitle>
            <DialogDescription>
              Navigate to a destination folder and click "Move Here".
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-1 text-sm flex-wrap" data-testid="cd-move-dialog-breadcrumbs">
            <button
              onClick={() => navigateToFolder(null)}
              className="hover:underline text-muted-foreground hover:text-foreground"
              data-testid="cd-breadcrumb-root"
            >
              Root
            </button>
            {moveDialogBreadcrumbs.map((crumb, idx) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <button
                  onClick={() => navigateToFolder(crumb.id)}
                  className={cn(
                    "hover:underline",
                    idx === moveDialogBreadcrumbs.length - 1
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid={`cd-breadcrumb-folder-${crumb.id}`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto border rounded-lg p-2">
            {moveDialogViewFolderId !== null && (
              <button
                onClick={() => {
                  const parentId = moveDialogBreadcrumbs.length > 1
                    ? moveDialogBreadcrumbs[moveDialogBreadcrumbs.length - 2].id
                    : null;
                  navigateToFolder(parentId);
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-muted transition-colors text-muted-foreground"
                data-testid="cd-move-dialog-back"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}

            {moveDialogLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading folders...
              </div>
            ) : moveDialogChildFolders.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No subfolders here.
              </div>
            ) : (
              moveDialogChildFolders
                .filter(folder => !selectedFolders.has(folder.id))
                .map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => navigateToFolder(folder.id)}
                    disabled={wouldCreateCycle(folder.id)}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-muted transition-colors",
                      wouldCreateCycle(folder.id) && "opacity-50 cursor-not-allowed"
                    )}
                    data-testid={`cd-move-nav-folder-${folder.id}`}
                  >
                    <Folder className="w-5 h-5 text-primary" />
                    <span className="flex-1">{folder.name}</span>
                    {folder.hasChildren && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                ))
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setMoveDialogOpen(false)}
              className="w-full sm:w-auto"
              data-testid="cd-button-cancel-move"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleMoveToFolder(moveDialogViewFolderId)}
              disabled={
                batchMoveFilesMutation.isPending ||
                updateFolderMutation.isPending ||
                wouldCreateCycle(moveDialogViewFolderId)
              }
              className="w-full sm:w-auto"
              data-testid="cd-button-move-here"
            >
              {batchMoveFilesMutation.isPending || updateFolderMutation.isPending
                ? "Moving..."
                : wouldCreateCycle(moveDialogViewFolderId)
                  ? "Cannot move here"
                  : `Move Here${moveDialogViewFolderId === null ? ' (Root)' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fileDetailsPanel !== null} onOpenChange={(open) => !open && setFileDetailsPanel(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white flex items-center gap-2">
              <Info className="w-5 h-5" />
              File Details
            </DialogTitle>
          </DialogHeader>
          {fileDetailsPanel && (
            <div className="space-y-4">
              <div className="aspect-video w-full bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                {isImageFile(fileDetailsPanel.contentType) ? (
                  <img
                    src={getProxyUrl(fileDetailsPanel.objectPath)}
                    alt={fileDetailsPanel.name}
                    className="w-full h-full object-contain"
                  />
                ) : isPdfFile(fileDetailsPanel.contentType) ? (
                  <div className="text-center">
                    <FileText className="w-16 h-16 text-red-500 mx-auto mb-2" />
                    <span className="text-sm text-muted-foreground">PDF Document</span>
                  </div>
                ) : (
                  <div className="text-center">
                    <File className="w-16 h-16 text-muted-foreground mx-auto mb-2" />
                    <span className="text-sm text-muted-foreground">File</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <FileType className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium break-all" data-testid="cd-text-detail-name">{fileDetailsPanel.name}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Uploaded</p>
                    <p className="font-medium" data-testid="cd-text-detail-date">
                      {fileDetailsPanel.createdAt && format(new Date(fileDetailsPanel.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <HardDrive className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Size</p>
                    <p className="font-medium" data-testid="cd-text-detail-size">
                      {fileDetailsPanel.size ? (
                        fileDetailsPanel.size >= 1048576
                          ? `${(fileDetailsPanel.size / 1048576).toFixed(2)} MB`
                          : `${(fileDetailsPanel.size / 1024).toFixed(1)} KB`
                      ) : 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <FileType className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-medium" data-testid="cd-text-detail-type">{fileDetailsPanel.contentType || 'Unknown'}</p>
                  </div>
                </div>

                {fileDetailsPanel.tags && fileDetailsPanel.tags.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Tags className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {fileDetailsPanel.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs" data-testid={`cd-detail-tag-${tag}`}>{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Star className={cn("w-4 h-4", fileDetailsPanel.starred ? "text-yellow-500 fill-current" : "text-muted-foreground")} />
                  <div>
                    <p className="text-xs text-muted-foreground">Starred</p>
                    <p className="font-medium" data-testid="cd-text-detail-starred">{fileDetailsPanel.starred ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (fileDetailsPanel) {
                  handleDirectDownload(fileDetailsPanel);
                }
              }}
              data-testid="cd-button-download-file"
            >
              <Download className="w-4 h-4 mr-2" /> Download
            </Button>
            <Button onClick={() => setFileDetailsPanel(null)} data-testid="cd-button-close-details">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteFolderId !== null} onOpenChange={(open) => !open && setDeleteFolderId(null)}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this folder and all its contents? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cd-button-cancel-delete-folder">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteFolderId) deleteFolderMutation.mutate(deleteFolderId);
                setDeleteFolderId(null);
              }}
              data-testid="cd-button-confirm-delete-folder"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteFileId !== null} onOpenChange={(open) => !open && setDeleteFileId(null)}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cd-button-cancel-delete-file">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteFileId) deleteFileMutation.mutate(deleteFileId);
                setDeleteFileId(null);
              }}
              data-testid="cd-button-confirm-delete-file"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editingFile !== null} onOpenChange={(open) => !open && setEditingFile(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Edit Document Tags</DialogTitle>
            <DialogDescription>
              Add tags to help organize and find this document. Press Enter or comma to add a tag.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingFile && (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <File className="w-4 h-4" />
                  <span className="truncate">{editingFile.name}</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cd-file-tags" className="text-black dark:text-white">Tags</Label>
                  <TagInput
                    value={editFileTags}
                    onChange={setEditFileTags}
                    placeholder="Type a tag and press Enter..."
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFile(null)} data-testid="cd-button-cancel-edit-tags">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingFile) {
                  updateFileMutation.mutate({
                    id: editingFile.id,
                    tags: editFileTags.length > 0 ? editFileTags : null
                  });
                  setEditingFile(null);
                }
              }}
              disabled={updateFileMutation.isPending}
              data-testid="cd-button-save-tags"
            >
              Save Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
