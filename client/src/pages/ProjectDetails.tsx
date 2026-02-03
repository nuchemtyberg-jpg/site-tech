import { useParams, Link, useLocation, useSearch } from "wouter";
import { useProject, useDeleteProject, useUpdateProject } from "@/hooks/use-projects";
import { useProjectTasks, useCreateTask, useDeleteTask, useUpdateTask, useTaskStatusHistory } from "@/hooks/use-tasks";
import { useProjectFiles, useProjectFolders, useCreateFile, useDeleteFile, useCreateFolder, useDeleteFolder, useUpdateFile, useUpdateFolder, useBatchDeleteFiles, useBatchMoveFiles } from "@/hooks/use-files";
import { TagInput } from "@/components/TagInput";
import { lazy, Suspense } from "react";

const PhotosTab = lazy(() => import("@/components/PhotosTab"));
import { FloatingProjectTools } from "@/components/FloatingProjectTools";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  MoreVertical, 
  Plus, 
  Trash2,
  FileText,
  FolderPlus,
  Upload,
  File,
  Folder,
  ChevronRight,
  ChevronLeft,
  Home,
  X,
  Share2,
  Download,
  LayoutGrid,
  List,
  Image as ImageIcon,
  Pencil,
  Hash,
  User,
  DollarSign,
  StickyNote,
  Building2,
  Check,
  ChevronsUpDown,
  Clock,
  Camera,
  FolderOpen,
  Grid3X3,
  Grid2X2,
  Square,
  CheckSquare,
  Maximize2,
  Tag,
  Tags,
  Star,
  Search,
  FolderInput,
  Info,
  FileType,
  HardDrive
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useState, useRef, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type InsertTask, type FileMetadata, type Task, type Photo } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn, getProxyUrl } from "@/lib/utils";
import { NativeFileUploader } from "@/components/NativeFileUploader";
import { PDFViewer } from "@/components/PDFViewer";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { DailyReportsTab } from "@/components/DailyReportsTab";
import { logRouteMount, logRouteUnmount } from "@/lib/debugPerf";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

const PREDEFINED_TASK_TITLES = [
  "Backfilling",
  "Change Order",
  "C Inlet",
  "Concrete Work",
  "Demo & Removal",
  "Drywell System",
  "Electrical Conduit",
  "Excavation of Foundation",
  "Excavation & Trucking for Foundation",
  "Final Grading",
  "Poly Conduit & Poly Water Line",
  "Recharge System",
  "Roof Leader Drain",
  "Septic System",
  "Sewer Connection",
  "Sewer Tap",
  "Sewer & Water Connection",
  "Silt Fence Installation",
  "Site Prep",
  "Tank Removal",
  "Tie in Leaders to Recharge System",
  "Tree Removal",
  "Trench Drain",
  "Trenching",
  "Trucking of Soil",
];

const PROJECT_STATUSES = [
  { value: "new", label: "New", color: "#3b82f6" },
  { value: "bidding", label: "Bidding", color: "#6366f1" },
  { value: "takeoff_done", label: "Takeoff Done", color: "#8b5cf6" },
  { value: "proposal_sent", label: "Proposal Sent", color: "#06b6d4" },
  { value: "active", label: "Active", color: "#f97316" },
  { value: "completed", label: "Completed", color: "#22c55e" },
  { value: "bid_lost", label: "Bid Lost", color: "#ef4444" },
  { value: "archive", label: "Archive", color: "#6b7280" },
];

const editProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  streetAddress: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().optional(),
  customerId: z.number({ required_error: "Customer is required" }),
  status: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
});

type EditProjectFormData = z.infer<typeof editProjectSchema>;

export default function ProjectDetails() {
  const { id } = useParams();
  const projectId = Number(id);
  const [, setLocation] = useLocation();
  const { data: project, isLoading: isProjectLoading } = useProject(projectId);
  const { data: tasks, isLoading: isTasksLoading } = useProjectTasks(projectId);
  const { data: files, isLoading: isFilesLoading } = useProjectFiles(projectId);
  const { data: folders, isLoading: isFoldersLoading } = useProjectFolders(projectId);
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const deleteTaskMutation = useDeleteTask();
  const deleteProjectMutation = useDeleteProject();
  const updateProjectMutation = useUpdateProject();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const createFileMutation = useCreateFile(projectId);
  const deleteFileMutation = useDeleteFile(projectId);
  const updateFileMutation = useUpdateFile(projectId);
  const createFolderMutation = useCreateFolder(projectId);
  const updateFolderMutation = useUpdateFolder(projectId);
  const deleteFolderMutation = useDeleteFolder(projectId);
  const batchDeleteFilesMutation = useBatchDeleteFiles(projectId);
  const batchMoveFilesMutation = useBatchMoveFiles(projectId);
  

  const [editingFile, setEditingFile] = useState<FileMetadata | null>(null);
  const [editFileTags, setEditFileTags] = useState<string[]>([]);

  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customTaskTitles, setCustomTaskTitles] = useState<string[]>([]);
  const [isCustomTitleOpen, setIsCustomTitleOpen] = useState(false);
  const [newCustomTitle, setNewCustomTitle] = useState("");
  const [taskTitleSearch, setTaskTitleSearch] = useState("");
  const [taskTitlePopoverOpen, setTaskTitlePopoverOpen] = useState(false);
  
  // Delete confirmation states
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<number | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<number | null>(null);
  
  // Edit task state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dailyReportsFormOpen, setDailyReportsFormOpen] = useState(false);
  const [editTaskDescription, setEditTaskDescription] = useState("");
  const [editTaskScheduledDate, setEditTaskScheduledDate] = useState("");
  const [editTaskStatus, setEditTaskStatus] = useState("pending");
  const [editTaskPriority, setEditTaskPriority] = useState("medium");
  const [editTaskPercentComplete, setEditTaskPercentComplete] = useState(0);
  
  // Task status history
  const { data: taskStatusHistory = [], isLoading: isHistoryLoading } = useTaskStatusHistory(editingTask?.id || null);

  const getStatusColor = (status: string) => {
    const statusObj = PROJECT_STATUSES.find(s => s.value === status);
    return statusObj?.color || "#f97316";
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  const editForm = useForm<EditProjectFormData>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: {
      name: "",
      streetAddress: "",
      city: "",
      state: "",
      zip: "",
      customerId: undefined,
      status: "new",
      notes: "",
    },
  });

  useEffect(() => {
    if (project && isEditOpen) {
      editForm.reset({
        name: project.name || "",
        streetAddress: project.streetAddress || "",
        city: project.city || "",
        state: project.state || "",
        zip: project.zip || "",
        customerId: project.customerId || undefined,
        status: project.status || "new",
        notes: project.notes || "",
      });
    }
  }, [project, isEditOpen]);

  const handleEditSubmit = (data: EditProjectFormData) => {
    const location = [data.streetAddress, data.city, data.state, data.zip].filter(Boolean).join(", ");
    const color = getStatusColor(data.status);
    updateProjectMutation.mutate(
      { id: projectId, ...data, location, color },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          toast({ title: "Project updated successfully" });
        },
        onError: () => {
          toast({ title: "Failed to update project", variant: "destructive" });
        },
      }
    );
  };
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(() => {
    // Initialize from URL query param if present
    const params = new URLSearchParams(window.location.search);
    const folderId = params.get("folder");
    return folderId ? parseInt(folderId, 10) : null;
  });

  // Tab state from URL using wouter's useSearch hook
  const search = useSearch();
  const [location, navigate] = useLocation();

  // Derive active tab from search params - default to documents
  const activeTab = useMemo(() => {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    return tab && ["tasks", "documents", "photos", "daily-reports"].includes(tab) ? tab : "documents";
  }, [search]);

  // Update URL when tab changes using wouter navigation
  const handleTabChange = (newTab: string) => {
    const params = new URLSearchParams(search);
    if (newTab === "documents") {
      params.delete("tab");
    } else {
      params.set("tab", newTab);
    }
    const newSearch = params.toString();
    navigate(newSearch ? `?${newSearch}` : location.split('?')[0], { replace: false });
  };
  const [viewingFile, setViewingFile] = useState<FileMetadata | Photo | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const currentFolderIdRef = useRef<number | null>(null);
  
  // Document search and selection state
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [isFileSelectMode, setIsFileSelectMode] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [renamingFile, setRenamingFile] = useState<FileMetadata | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogViewFolderId, setMoveDialogViewFolderId] = useState<number | null>(null);
  const [moveDialogBreadcrumbs, setMoveDialogBreadcrumbs] = useState<Array<{ id: number; name: string }>>([]);
  const [moveDialogChildFolders, setMoveDialogChildFolders] = useState<Array<{ id: number; name: string; hasChildren: boolean }>>([]);
  const [moveDialogLoading, setMoveDialogLoading] = useState(false);
  const [fileDetailsPanel, setFileDetailsPanel] = useState<FileMetadata | null>(null);
  const [showBatchDeleteFilesConfirm, setShowBatchDeleteFilesConfirm] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingDragDrop, setIsUploadingDragDrop] = useState(false);
  const [dragDropProgress, setDragDropProgress] = useState({ current: 0, total: 0 });
  
  
  // Keep ref in sync with state for use in callbacks
  currentFolderIdRef.current = currentFolderId;
  const { toast } = useToast();

  // Debug logging for route mount/unmount
  useEffect(() => {
    logRouteMount('ProjectDetails');
    return () => {
      logRouteUnmount('ProjectDetails');
    };
  }, []);

  const handleFileClick = (file: FileMetadata) => {
    if (isPdfFile(file.contentType)) {
      // Open PDF in browser's native PDF viewer
      window.open(getProxyUrl(file.objectPath), '_blank');
    } else {
      setViewingFile(file);
    }
  };

  const handleShareFile = async (file: FileMetadata | Photo) => {
    const proxyPath = getProxyUrl(file.objectPath);
    try {
      // Try to share the actual file
      const response = await fetch(proxyPath);
      const blob = await response.blob();
      const fileToShare = new window.File([blob], file.name, { type: file.contentType || 'application/octet-stream' });
      
      if (navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
        await navigator.share({
          files: [fileToShare],
          title: file.name,
        });
      } else if (navigator.share) {
        // Fall back to sharing link if file sharing not supported
        await navigator.share({
          title: file.name,
          url: `${window.location.origin}${proxyPath}`,
        });
      } else {
        // Fall back to copying link
        await navigator.clipboard.writeText(`${window.location.origin}${proxyPath}`);
        toast({ title: "Link Copied", description: "File link copied to clipboard." });
      }
    } catch (err) {
      // Final fallback
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${proxyPath}`);
        toast({ title: "Link Copied", description: "File link copied to clipboard." });
      } catch {
        toast({ title: "Share Failed", description: "Unable to share this file.", variant: "destructive" });
      }
    }
  };

  const isImageFile = (contentType: string | null) => {
    return contentType?.startsWith('image/') || false;
  };

  const isPdfFile = (contentType: string | null) => {
    return contentType === 'application/pdf';
  };

  // Handle drag and drop file upload
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  // Helper to recursively read files from a directory entry
  // Type for files with their relative folder path
  type FileWithPath = { file: File; relativePath: string };

  const readDirectoryEntriesWithPaths = async (
    dirEntry: FileSystemDirectoryEntry, 
    parentPath: string = ""
  ): Promise<{ files: FileWithPath[]; folders: string[] }> => {
    const files: FileWithPath[] = [];
    const folders: string[] = [];
    const reader = dirEntry.createReader();
    
    const readEntries = (): Promise<FileSystemEntry[]> => {
      return new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
    };

    // Read all entries (readEntries may need to be called multiple times)
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
        files.push({ file, relativePath: parentPath });
      } else if (entry.isDirectory) {
        const folderPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        folders.push(folderPath);
        const subResult = await readDirectoryEntriesWithPaths(entry as FileSystemDirectoryEntry, folderPath);
        files.push(...subResult.files);
        folders.push(...subResult.folders);
      }
    }

    return { files, folders };
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Collect all files with their relative paths (for folder structure preservation)
    const allFilesWithPaths: FileWithPath[] = [];
    const allFolderPaths: string[] = [];
    const items = e.dataTransfer.items;

    if (items && items.length > 0) {
      // Use DataTransferItemList to handle folders
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
          // Include the root folder being dropped
          allFolderPaths.push(entry.name);
          const result = await readDirectoryEntriesWithPaths(entry as FileSystemDirectoryEntry, entry.name);
          allFilesWithPaths.push(...result.files);
          allFolderPaths.push(...result.folders);
        }
      }
    } else {
      // Fallback to files array (no folder support)
      allFilesWithPaths.push(...Array.from(e.dataTransfer.files).map(f => ({ file: f, relativePath: "" })));
    }

    if (allFilesWithPaths.length === 0 && allFolderPaths.length === 0) return;

    setIsUploadingDragDrop(true);
    const totalOperations = allFolderPaths.length + allFilesWithPaths.length;
    setDragDropProgress({ current: 0, total: totalOperations });

    const maxFileSize = 52428800; // 50MB
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

    // Create a map of folder paths to folder IDs
    const folderPathToId: Map<string, number> = new Map();
    const failedFolderPaths: Set<string> = new Set();
    
    // Sort folders by depth to create parent folders first
    const sortedFolderPaths = [...new Set(allFolderPaths)].sort((a, b) => 
      a.split('/').length - b.split('/').length
    );

    // Create folders in order (parent before child) using mutation hook
    for (const folderPath of sortedFolderPaths) {
      operationIndex++;
      setDragDropProgress({ current: operationIndex, total: totalOperations });
      
      const pathParts = folderPath.split('/');
      const folderName = pathParts[pathParts.length - 1];
      const parentPath = pathParts.slice(0, -1).join('/');
      
      // If parent folder failed, this child folder also fails
      if (parentPath && failedFolderPaths.has(parentPath)) {
        failedFolderPaths.add(folderPath);
        continue;
      }
      
      // Determine parent folder ID
      let parentFolderId = currentFolderIdRef.current;
      if (parentPath && folderPathToId.has(parentPath)) {
        parentFolderId = folderPathToId.get(parentPath)!;
      }

      let resolved = false;
      try {
        // Create folder using mutation hook
        const newFolder = await createFolderMutation.mutateAsync({
          name: folderName,
          parentId: parentFolderId,
        });
        folderPathToId.set(folderPath, newFolder.id);
        resolved = true;
      } catch (error) {
        // Folder might already exist - fetch fresh folder list to find it
        try {
          const freshFoldersRes = await fetch(`/api/projects/${projectId}/folders`);
          if (freshFoldersRes.ok) {
            const freshFolders = await freshFoldersRes.json();
            const existingFolder = freshFolders.find((f: { name: string; parentId: number | null }) => 
              f.name === folderName && f.parentId === parentFolderId
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

    // Refresh folders after creation so the UI updates
    if (sortedFolderPaths.length > 0) {
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "folders"] });
    }

    // Validate all required folder paths are resolved before proceeding with uploads
    const requiredPaths = new Set<string>();
    for (const { relativePath } of validFilesWithPaths) {
      if (relativePath) {
        requiredPaths.add(relativePath);
      }
    }
    
    const unresolvedPaths: string[] = [];
    for (const path of requiredPaths) {
      if (!folderPathToId.has(path) && !failedFolderPaths.has(path)) {
        // Path is neither resolved nor marked as failed - this is an error state
        unresolvedPaths.push(path);
        failedFolderPaths.add(path); // Mark as failed to prevent files going to root
      }
    }
    
    if (unresolvedPaths.length > 0) {
      toast({ 
        title: "Folder structure incomplete", 
        description: `Some folders couldn't be resolved: ${unresolvedPaths.slice(0, 2).join(', ')}${unresolvedPaths.length > 2 ? '...' : ''}`,
        variant: "destructive"
      });
    }

    // Upload files to their correct folders - skip files in failed folders
    for (const { file, relativePath } of validFilesWithPaths) {
      operationIndex++;
      setDragDropProgress({ current: operationIndex, total: totalOperations });

      // Check if this file's folder failed to be created or is unresolved
      if (relativePath) {
        if (failedFolderPaths.has(relativePath) || !folderPathToId.has(relativePath)) {
          skippedDueToFolderFailure.push(`${relativePath}/${file.name}`);
          continue;
        }
        // Also check parent paths
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

      // Determine target folder ID
      let targetFolderId = currentFolderIdRef.current;
      if (relativePath && folderPathToId.has(relativePath)) {
        targetFolderId = folderPathToId.get(relativePath)!;
      }

      try {
        // Get upload URL
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

        // Upload file
        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || 'application/octet-stream' },
        });

        if (!uploadRes.ok) throw new Error("Upload failed");

        // Create file record - use mutateAsync to await and catch errors
        await createFileMutation.mutateAsync({
          name: file.name,
          objectPath,
          folderId: targetFolderId,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        });
        successCount++;
      } catch (error) {
        failedFiles.push(relativePath ? `${relativePath}/${file.name}` : file.name);
      }
    }

    setIsUploadingDragDrop(false);

    // Show appropriate toast based on results
    const totalIssues = failedFiles.length + skippedDueToFolderFailure.length;
    
    // Show skipped files warning if any folders couldn't be created
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
    } else if (successCount === 0 && totalIssues > 0) {
      toast({ 
        title: "Upload failed", 
        description: `No files were uploaded. Check folder permissions or names.`,
        variant: "destructive"
      });
    }
  };

  // Direct download helper
  const handleDirectDownload = async (file: FileMetadata) => {
    try {
      const response = await fetch(getProxyUrl(file.objectPath));
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

  const currentFolders = folders?.filter(f => f.parentId === currentFolderId) || [];
  // Filter to only show documents (files without albumId) - photos have albumId set
  const currentFiles = files?.filter(f => f.folderId === currentFolderId && !f.albumId) || [];
  
  // Get starred files across all folders (for starred section)
  const starredFiles = files?.filter(f => f.starred && !f.albumId) || [];
  
  // Search and filter files
  const filteredFiles = useMemo(() => {
    let result = showStarredOnly ? starredFiles : currentFiles;
    
    if (docSearchQuery.trim()) {
      const query = docSearchQuery.toLowerCase();
      result = result.filter(f => 
        f.name.toLowerCase().includes(query) ||
        (f.tags && f.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }
    
    // Apply stable sorting by id to prevent files jumping when properties change
    return [...result].sort((a, b) => a.id - b.id);
  }, [currentFiles, starredFiles, showStarredOnly, docSearchQuery]);
  
  // Filter folders by search
  const filteredFolders = useMemo(() => {
    if (!docSearchQuery.trim() || showStarredOnly) return currentFolders;
    const query = docSearchQuery.toLowerCase();
    return currentFolders.filter(f => f.name.toLowerCase().includes(query));
  }, [currentFolders, docSearchQuery, showStarredOnly]);
  
  // All files combined for unified view
  const allFiles = filteredFiles;
  
  // Group all files by date (month and day) for grid view
  const groupedFiles = allFiles.reduce((groups, file) => {
    const date = file.createdAt ? new Date(file.createdAt) : new Date();
    const dateKey = format(date, "MMMM d, yyyy");
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(file);
    return groups;
  }, {} as Record<string, typeof allFiles>);
  
  // Sort date groups by date (newest first)
  const sortedDateGroups = Object.entries(groupedFiles).sort((a, b) => {
    const dateA = new Date(a[0]);
    const dateB = new Date(b[0]);
    return dateB.getTime() - dateA.getTime();
  });
  
  // Get file type icon component
  const getFileIcon = (file: FileMetadata) => {
    if (isImageFile(file.contentType)) {
      return <ImageIcon className="w-5 h-5 text-green-500" />;
    } else if (isPdfFile(file.contentType)) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    return <File className="w-5 h-5 text-muted-foreground" />;
  };
  
  // Get file thumbnail for grid view
  const getFileThumbnail = (file: FileMetadata) => {
    if (isImageFile(file.contentType)) {
      return (
        <img 
          src={getProxyUrl(file.objectPath)} 
          alt={file.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
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
  
  const currentFolder = folders?.find(f => f.id === currentFolderId);
  
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

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      projectId: projectId,
      title: "",
      description: "",
      status: "pending",
      priority: "medium",
    }
  });

  if (isProjectLoading) return <div className="p-10 text-center">Loading project...</div>;
  if (!project) return <div className="p-10 text-center">Project not found</div>;

  const onSubmitTask = (data: InsertTask) => {
    data.projectId = projectId;
    
    createTaskMutation.mutate(data, {
      onSuccess: () => {
        setIsTaskOpen(false);
        form.reset({ projectId: projectId, title: "", description: "", status: "pending", priority: "medium" });
        toast({ title: "Task Created", description: "Task added to project schedule." });
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleDeleteProject = () => {
    deleteProjectMutation.mutate(projectId, {
      onSuccess: () => window.location.href = "/projects"
    });
  };

  const handleOpenEditTask = (task: Task) => {
    setEditingTask(task);
    setEditTaskDescription(task.description || "");
    setEditTaskScheduledDate(task.scheduledDate || "");
    setEditTaskStatus(task.status);
    setEditTaskPriority(task.priority);
    setEditTaskPercentComplete(task.percentComplete || 0);
  };

  const handlePercentCompleteChange = (value: number[]) => {
    const percent = value[0];
    setEditTaskPercentComplete(percent);
    
    // Auto-update status based on percentage
    if (percent === 0) {
      setEditTaskStatus("pending");
    } else if (percent === 100) {
      setEditTaskStatus("completed");
    } else if (percent > 0 && percent < 100) {
      setEditTaskStatus("in_progress");
    }
  };

  const handleStatusChange = (status: string) => {
    setEditTaskStatus(status);
    
    // Auto-update percentage based on status
    if (status === "completed") {
      setEditTaskPercentComplete(100);
    } else if (status === "pending") {
      setEditTaskPercentComplete(0);
    }
  };

  const handleSaveTaskEdit = () => {
    if (!editingTask) return;
    
    updateTaskMutation.mutate({
      id: editingTask.id,
      description: editTaskDescription || null,
      scheduledDate: editTaskScheduledDate || null,
      status: editTaskStatus,
      priority: editTaskPriority,
      percentComplete: editTaskPercentComplete,
    }, {
      onSuccess: () => {
        setEditingTask(null);
        toast({
          title: "Task updated",
          description: "Task has been updated successfully.",
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to update task.",
          variant: "destructive",
        });
      }
    });
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

  // Move dialog helper functions
  const fetchMoveDialogFolders = async (parentId: number | null) => {
    setMoveDialogLoading(true);
    try {
      const parentParam = parentId === null ? 'null' : String(parentId);
      const res = await fetch(`/api/projects/${projectId}/folders/children?parentId=${parentParam}`);
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
      const res = await fetch(`/api/folders/${folderId}/path`);
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

  // Check if moving to a folder would create a cycle (moving folder into itself or descendant)
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

  // Check if items are already in the target folder
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
    
    // Move files
    if (selectedFiles.size > 0) {
      try {
        await batchMoveFilesMutation.mutateAsync({ ids: Array.from(selectedFiles), folderId: targetFolderId });
      } catch (error) {
        toast({ title: "Error", description: "Failed to move some files", variant: "destructive" });
      }
    }
    
    // Move folders
    for (const folderId of Array.from(selectedFolders)) {
      try {
        await updateFolderMutation.mutateAsync({ id: folderId, parentId: targetFolderId });
      } catch (error) {
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

  const handleUploadComplete = async (uploadedFiles: Array<{ name: string; objectPath: string; size: number; type: string; relativePath?: string }>) => {
    let successCount = 0;
    const skippedFiles: string[] = [];
    
    // Collect all unique folder paths from uploaded files
    const allFolderPaths: string[] = [];
    for (const file of uploadedFiles) {
      if (file.relativePath) {
        // Add all parent paths as well
        const pathParts = file.relativePath.split('/');
        for (let i = 1; i <= pathParts.length; i++) {
          const partialPath = pathParts.slice(0, i).join('/');
          if (!allFolderPaths.includes(partialPath)) {
            allFolderPaths.push(partialPath);
          }
        }
      }
    }
    
    // Sort folders by depth to create parent folders first
    const sortedFolderPaths = allFolderPaths.sort((a, b) => 
      a.split('/').length - b.split('/').length
    );
    
    // Create folders and map paths to IDs
    const folderPathToId: Map<string, number> = new Map();
    const failedFolderPaths: Set<string> = new Set();
    
    for (const folderPath of sortedFolderPaths) {
      const pathParts = folderPath.split('/');
      const folderName = pathParts[pathParts.length - 1];
      const parentPath = pathParts.slice(0, -1).join('/');
      
      // If parent folder failed, this child folder also fails
      if (parentPath && failedFolderPaths.has(parentPath)) {
        failedFolderPaths.add(folderPath);
        continue;
      }
      
      // Determine parent folder ID
      let parentFolderId = currentFolderIdRef.current;
      if (parentPath && folderPathToId.has(parentPath)) {
        parentFolderId = folderPathToId.get(parentPath)!;
      }
      
      let resolved = false;
      try {
        // Create folder using mutation
        const newFolder = await createFolderMutation.mutateAsync({
          name: folderName,
          parentId: parentFolderId,
        });
        folderPathToId.set(folderPath, newFolder.id);
        resolved = true;
      } catch (error) {
        // Folder might already exist - try to find it
        try {
          const freshFoldersRes = await fetch(`/api/projects/${projectId}/folders`);
          if (freshFoldersRes.ok) {
            const freshFolders = await freshFoldersRes.json();
            const existingFolder = freshFolders.find((f: { name: string; parentId: number | null }) => 
              f.name === folderName && f.parentId === parentFolderId
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
    
    // Refresh folders after creation
    if (sortedFolderPaths.length > 0) {
      await queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "folders"] });
    }
    
    // Validate all required folder paths are resolved before proceeding with file saves
    const requiredPaths = new Set<string>();
    for (const file of uploadedFiles) {
      if (file.relativePath) {
        requiredPaths.add(file.relativePath);
      }
    }
    
    const unresolvedPaths: string[] = [];
    for (const path of requiredPaths) {
      if (!folderPathToId.has(path) && !failedFolderPaths.has(path)) {
        unresolvedPaths.push(path);
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
    
    // Save file metadata with correct folder IDs - skip files in failed folders
    for (const file of uploadedFiles) {
      // Check if this file's folder failed to be created
      if (file.relativePath) {
        if (failedFolderPaths.has(file.relativePath) || !folderPathToId.has(file.relativePath)) {
          skippedFiles.push(`${file.relativePath}/${file.name}`);
          continue;
        }
        // Also check parent paths
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
        // Determine target folder ID based on relativePath
        let targetFolderId = currentFolderIdRef.current;
        if (file.relativePath && folderPathToId.has(file.relativePath)) {
          targetFolderId = folderPathToId.get(file.relativePath)!;
        }
        
        await createFileMutation.mutateAsync({
          name: file.name,
          objectPath: file.objectPath,
          contentType: file.type,
          size: file.size,
          folderId: targetFolderId,
        });
        successCount++;
      } catch (err) {
        console.error("Failed to save file metadata:", err);
        toast({ title: "Error", description: `Failed to save ${file.name}`, variant: "destructive" });
      }
    }
    
    // Show appropriate toast messages
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

  const getStatusBgColor = (status: string) => {
    const statusObj = PROJECT_STATUSES.find(s => s.value === status);
    return statusObj?.color || "#6b7280";
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Not set";
    return format(new Date(date), "MMM d, yyyy");
  };

  const formatDateRange = (start: Date | string | null, end: Date | string | null) => {
    if (!start && !end) return "Dates not set";
    if (!start) return `Until ${formatDate(end)}`;
    if (!end) return `From ${formatDate(start)}`;
    return `${format(new Date(start), "MMM d")} - ${format(new Date(end), "MMM d, yyyy")}`;
  };

  return (
    <>
    <div className="space-y-6 md:space-y-8 animate-enter overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 md:gap-6">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-card p-4 md:p-6 rounded-xl border border-border shadow-sm">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
              <div 
                className="px-2 md:px-3 py-1 rounded text-xs font-bold uppercase tracking-wider text-white shrink-0"
                style={{ backgroundColor: getStatusBgColor(project.status) }}
              >
                {project.status.replace('_', ' ')}
              </div>
              {project.projectNumber && (
                <span className="text-xs md:text-sm font-mono text-muted-foreground">{project.projectNumber}</span>
              )}
            </div>
            <h1 className="text-xl md:text-3xl font-bold font-display mb-2 break-words">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground mb-4 max-w-2xl">{project.description}</p>
            )}
            
            {/* Project Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-4">
              {/* Customer */}
              {project.customerId && (
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">Customer</span>
                    <span className="text-foreground font-medium">
                      {customers.find(c => c.id === project.customerId)?.name || "Unknown"}
                      {customers.find(c => c.id === project.customerId)?.company && (
                        <span className="text-muted-foreground font-normal ml-1">
                          ({customers.find(c => c.id === project.customerId)?.company})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
              
              {/* Address */}
              {(project.streetAddress || project.city || project.state || project.zip) && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">Address</span>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([project.streetAddress, project.city, project.state, project.zip].filter(Boolean).join(", "))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-words"
                      data-testid="link-project-address"
                    >
                      {[project.streetAddress, project.city, project.state, project.zip].filter(Boolean).join(", ")}
                    </a>
                  </div>
                </div>
              )}
              
              {/* Created Date */}
              {project.createdAt && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">Created</span>
                    <span className="text-foreground">{format(new Date(project.createdAt), "MMMM d, yyyy")}</span>
                  </div>
                </div>
              )}
              
              {/* Estimated Value */}
              {project.estimatedValue && (
                <div className="flex items-start gap-3">
                  <DollarSign className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">Estimated Value</span>
                    <span className="text-foreground font-medium">${project.estimatedValue.toLocaleString()}</span>
                  </div>
                </div>
              )}
              
              {/* Date Range */}
              {(project.startDate || project.endDate) && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">Project Dates</span>
                    <span className="text-foreground">{formatDateRange(project.startDate, project.endDate)}</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Notes */}
            {project.notes && (
              <div className="flex items-start gap-3 text-sm border-t border-border pt-4 mt-2">
                <StickyNote className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Notes</span>
                  <p className="text-foreground whitespace-pre-wrap">{project.notes}</p>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => setIsEditOpen(true)} data-testid="button-edit-project" className="min-h-[44px] md:min-h-9">
              <Pencil className="w-4 h-4 mr-2" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-project-menu" className="min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer min-h-[44px] md:min-h-8" onClick={() => setDeleteProjectOpen(true)} data-testid="button-delete-project">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Edit Project Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Main Street Subdivision" {...field} data-testid="input-edit-project-name" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">Project Address *</h4>
                  <FormItem>
                    <FormLabel>Search Address</FormLabel>
                    <AddressAutocomplete
                      onAddressSelect={(address) => {
                        editForm.setValue("streetAddress", address.streetAddress);
                        editForm.setValue("city", address.city);
                        if (address.state) {
                          editForm.setValue("state", address.state);
                        }
                        if (address.zipCode) {
                          editForm.setValue("zip", address.zipCode);
                        }
                      }}
                      placeholder="Start typing an address..."
                    />
                  </FormItem>
                  <FormField
                    control={editForm.control}
                    name="streetAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address *</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main Street" {...field} data-testid="input-edit-project-street" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={editForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City *</FormLabel>
                          <FormControl>
                            <Input placeholder="City" {...field} data-testid="input-edit-project-city" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger className="bg-white dark:bg-zinc-900 text-black dark:text-white" data-testid="select-edit-project-state">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                              {US_STATES.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="zip"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zip Code</FormLabel>
                          <FormControl>
                            <Input placeholder="12345" {...field} data-testid="input-edit-project-zip" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={editForm.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Customer *</FormLabel>
                      <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              data-testid="button-edit-customer-select"
                              className={cn(
                                "w-full justify-between bg-white dark:bg-zinc-900",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value
                                ? customers.find((c) => c.id === field.value)?.name || "Select customer"
                                : "Select customer"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0 bg-white dark:bg-zinc-900 text-black dark:text-white" align="start">
                          <Command className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                            <CommandInput 
                              placeholder="Search customers..." 
                              value={customerSearch}
                              onValueChange={setCustomerSearch}
                              data-testid="input-edit-customer-search"
                            />
                            <CommandList>
                              <CommandEmpty>No customer found.</CommandEmpty>
                              <CommandGroup>
                                {filteredCustomers.map((customer) => (
                                  <CommandItem
                                    key={customer.id}
                                    value={customer.name}
                                    onSelect={() => {
                                      field.onChange(customer.id);
                                      setCustomerPopoverOpen(false);
                                    }}
                                  >
                                    <span>{customer.name}</span>
                                    {customer.company && (
                                      <span className="ml-2 text-muted-foreground text-sm">
                                        ({customer.company})
                                      </span>
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-white dark:bg-zinc-900 text-black dark:text-white" data-testid="select-edit-project-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                          {PROJECT_STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: status.color }}
                                />
                                {status.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional project notes..." {...field} className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateProjectMutation.isPending} data-testid="button-save-edit-project">
                    {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs - ribbon hidden, navigation via floating button */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">

        <TabsContent value="tasks" className="space-y-4 overflow-x-hidden">
          <div className="flex items-center justify-end mb-4">
            <Dialog open={isTaskOpen} onOpenChange={setIsTaskOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-task">
                  <Plus className="w-4 h-4 mr-2" /> Add Task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Task</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmitTask)} className="space-y-4 mt-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title"><span className="text-red-500">*</span> Task Title</Label>
                    <Popover open={taskTitlePopoverOpen} onOpenChange={setTaskTitlePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={taskTitlePopoverOpen}
                          className="w-full justify-between bg-white dark:bg-zinc-900 text-black dark:text-white"
                          data-testid="select-task-title"
                        >
                          {form.watch("title") || "Select a task title..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0 bg-white dark:bg-zinc-900" align="start">
                        <Command className="bg-white dark:bg-zinc-900">
                          <CommandInput 
                            placeholder="Search task titles..." 
                            value={taskTitleSearch}
                            onValueChange={setTaskTitleSearch}
                            data-testid="input-search-task-title"
                            className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                          />
                          <CommandList className="max-h-60">
                            <CommandEmpty>No task title found.</CommandEmpty>
                            <CommandGroup>
                              {[...PREDEFINED_TASK_TITLES, ...customTaskTitles].sort().map((title) => (
                                <CommandItem
                                  key={title}
                                  value={title}
                                  onSelect={() => {
                                    form.setValue("title", title);
                                    setTaskTitlePopoverOpen(false);
                                    setTaskTitleSearch("");
                                  }}
                                  className="cursor-pointer text-black dark:text-white"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      form.watch("title") === title ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {title}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  setTaskTitlePopoverOpen(false);
                                  setIsCustomTitleOpen(true);
                                  setTaskTitleSearch("");
                                }}
                                className="cursor-pointer text-black dark:text-white font-medium border-t"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Add New Title...
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {form.formState.errors.title && <p className="text-red-500 text-xs">{form.formState.errors.title.message}</p>}
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Input id="description" {...form.register("description")} placeholder="Details..." data-testid="input-task-description" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="dueDate">Scheduled Date</Label>
                    <Input id="dueDate" type="date" {...form.register("dueDate")} data-testid="input-task-due" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="status">Status</Label>
                      <Select onValueChange={(val) => form.setValue("status", val)} defaultValue="pending">
                        <SelectTrigger data-testid="select-task-status" className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select onValueChange={(val) => form.setValue("priority", val)} defaultValue="medium">
                        <SelectTrigger data-testid="select-task-priority" className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                          <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="submit" disabled={createTaskMutation.isPending} data-testid="button-submit-task">
                      {createTaskMutation.isPending ? "Adding..." : "Add Task"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Custom Task Title Dialog */}
            <Dialog open={isCustomTitleOpen} onOpenChange={setIsCustomTitleOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Task Title</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid gap-2">
                    <Label htmlFor="customTitle">New Title</Label>
                    <Input 
                      id="customTitle" 
                      value={newCustomTitle}
                      onChange={(e) => setNewCustomTitle(e.target.value)}
                      placeholder="Enter new task title" 
                      data-testid="input-custom-task-title"
                      className="bg-white dark:bg-zinc-900 text-black dark:text-white" 
                    />
                  </div>
                  <DialogFooter>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setNewCustomTitle("");
                        setIsCustomTitleOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => {
                        if (newCustomTitle.trim()) {
                          setCustomTaskTitles(prev => [...prev, newCustomTitle.trim()]);
                          form.setValue("title", newCustomTitle.trim());
                          setNewCustomTitle("");
                          setIsCustomTitleOpen(false);
                        }
                      }}
                      disabled={!newCustomTitle.trim()}
                      data-testid="button-add-custom-title"
                    >
                      Add Title
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {isTasksLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading tasks...</div>
          ) : tasks?.length === 0 ? (
            <div className="py-20 text-center bg-card border border-dashed border-border rounded-xl">
              <p className="text-muted-foreground">No tasks yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {tasks?.map(task => (
                <div 
                  key={task.id} 
                  className="group bg-card border border-border rounded-lg p-3 md:p-4 hover:border-primary/50 transition-all shadow-sm hover:shadow-md flex flex-col md:flex-row md:items-center justify-between cursor-pointer gap-3" 
                  data-testid={`task-item-${task.id}`}
                  onClick={() => handleOpenEditTask(task)}
                >
                  <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
                    <div className={cn(
                      "mt-1.5 w-2 h-2 rounded-full shrink-0",
                      task.status === 'completed' ? "bg-green-500" :
                      task.status === 'in_progress' ? "bg-blue-500" :
                      task.status === 'blocked' ? "bg-red-500" :
                      "bg-gray-400"
                    )} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors break-words">{task.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 md:line-clamp-1">{task.description || "No description provided."}</p>
                      <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 shrink-0" />
                          {formatDateRange(task.scheduledDate, task.dueDate)}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded uppercase tracking-wider font-bold text-[10px] md:text-xs",
                          task.priority === 'high' ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"
                        )}>
                          {task.priority}
                        </span>
                        {task.percentComplete > 0 && (
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] md:text-xs">
                            {task.percentComplete}% Complete
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTaskId(task.id);
                    }}
                    data-testid={`button-delete-task-${task.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4 overflow-x-hidden">
          {/* Drag and Drop Zone Wrapper */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative rounded-lg transition-all",
              isDragOver && "ring-2 ring-primary ring-offset-2 bg-primary/5"
            )}
          >
            {/* Drag overlay - pointer-events-auto ensures overlay captures all events */}
            {isDragOver && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary pointer-events-auto">
                <div className="text-center pointer-events-none">
                  <Upload className="w-12 h-12 mx-auto text-primary mb-2" />
                  <p className="text-lg font-medium text-primary">Drop files here to upload</p>
                  <p className="text-sm text-muted-foreground">Files will be uploaded to the current folder</p>
                </div>
              </div>
            )}

            {/* Upload progress indicator */}
            {isUploadingDragDrop && (
              <div className="mb-4 p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                  <span className="text-sm">
                    Uploading file {dragDropProgress.current} of {dragDropProgress.total}...
                  </span>
                </div>
              </div>
            )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search files and folders..."
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              className="pl-10 bg-white dark:bg-zinc-900"
              data-testid="input-doc-search"
            />
            {docSearchQuery && (
              <button 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setDocSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-between relative z-10">
            {/* Left side controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* View Toggle */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  data-testid="button-view-grid"
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  data-testid="button-view-list"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>

              {/* Starred Toggle */}
              <Button
                variant={showStarredOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setShowStarredOnly(!showStarredOnly);
                  if (!showStarredOnly) setCurrentFolderId(null);
                }}
                data-testid="button-toggle-starred"
              >
                <Star className={cn("w-4 h-4 mr-1", showStarredOnly && "fill-current")} />
                Starred
                {starredFiles.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">{starredFiles.length}</Badge>
                )}
              </Button>

              {/* Select Mode Toggle */}
              <Button
                variant={isFileSelectMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setIsFileSelectMode(!isFileSelectMode);
                  if (isFileSelectMode) {
                    setSelectedFiles(new Set());
                    setSelectedFolders(new Set());
                  }
                }}
                data-testid="button-toggle-select-mode"
              >
                <CheckSquare className="w-4 h-4 mr-1" />
                {isFileSelectMode ? 'Cancel' : 'Select'}
              </Button>
            </div>
            
            {/* Right side actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Batch actions when files or folders are selected */}
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
                    data-testid="button-batch-move"
                  >
                    <FolderInput className="w-4 h-4 mr-1" /> Move
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBatchDeleteFilesConfirm(true)}
                    className="text-destructive hover:text-destructive"
                    data-testid="button-batch-delete"
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                  </Button>
                </div>
              )}

              {!isFileSelectMode && (
                <>
                  <Dialog open={isFolderOpen} onOpenChange={setIsFolderOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-auto" data-testid="button-new-folder">
                        <FolderPlus className="w-4 h-4 mr-2" /> New Folder
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Folder</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="grid gap-2">
                          <Label htmlFor="folderName">Folder Name</Label>
                          <Input 
                            id="folderName" 
                            value={folderName} 
                            onChange={(e) => setFolderName(e.target.value)} 
                            placeholder="e.g. Site Photos"
                            data-testid="input-folder-name"
                            className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                          />
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreateFolder} disabled={createFolderMutation.isPending} data-testid="button-create-folder">
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
                    buttonClassName="w-full sm:w-auto"
                    onUploadComplete={handleUploadComplete}
                  >
                    <Upload className="w-4 h-4 mr-2" /> Upload Files
                  </NativeFileUploader>
                </>
              )}
            </div>
          </div>

          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
            {getBreadcrumbs().map((crumb, idx, arr) => (
              <div key={crumb.id ?? 'root'} className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentFolderId(crumb.id)}
                  className={cn(
                    "hover:text-primary transition-colors",
                    idx === arr.length - 1 ? "text-foreground font-medium" : ""
                  )}
                  data-testid={`breadcrumb-${crumb.id ?? 'root'}`}
                >
                  {idx === 0 ? <Home className="w-4 h-4" /> : crumb.name}
                </button>
                {idx < arr.length - 1 && <ChevronRight className="w-4 h-4" />}
              </div>
            ))}
          </div>

          {(isFilesLoading || isFoldersLoading) ? (
            <div className="py-10 text-center text-muted-foreground">Loading documents...</div>
          ) : (filteredFolders.length === 0 && allFiles.length === 0) ? (
            <div className="py-20 text-center bg-card border border-dashed border-border rounded-xl">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {docSearchQuery ? "No matching files or folders found." : 
                 showStarredOnly ? "No starred files yet. Star files to access them quickly." :
                 "No documents yet. Upload files or create folders to organize your project documents."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Folders */}
              {!showStarredOnly && filteredFolders.length > 0 && (
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Folders</h3>
                  {filteredFolders.map(folder => (
                    <div 
                      key={folder.id} 
                      className={cn(
                        "group bg-card border rounded-lg p-3 hover:border-primary/50 transition-all flex items-center justify-between",
                        selectedFolders.has(folder.id) ? "border-primary ring-2 ring-primary/30" : "border-border"
                      )} 
                      data-testid={`folder-item-${folder.id}`}
                    >
                      {/* Selection checkbox */}
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
                          data-testid={`checkbox-folder-${folder.id}`}
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
                        data-testid={`button-open-folder-${folder.id}`}
                      >
                        <Folder className="w-5 h-5 text-primary" />
                        <span className="font-medium">{folder.name}</span>
                      </button>
                      {!isFileSelectMode && (
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="opacity-0 group-hover:opacity-100 h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingFolder({ id: folder.id, name: folder.name });
                              setRenameValue(folder.name);
                            }}
                            data-testid={`button-rename-folder-${folder.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="opacity-0 group-hover:opacity-100 h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteFolderId(folder.id);
                            }}
                            data-testid={`button-delete-folder-${folder.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Files - Grid View (grouped by date) */}
              {viewMode === 'grid' && sortedDateGroups.length > 0 && (
                <div className="space-y-6">
                  <h3 className="text-sm font-medium text-muted-foreground">Files</h3>
                  {sortedDateGroups.map(([dateGroup, groupFiles]) => (
                    <div key={dateGroup} className="space-y-3">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{dateGroup}</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                        {groupFiles.map((file: FileMetadata) => (
                          <div 
                            key={file.id} 
                            className={cn(
                              "group relative aspect-square bg-card border rounded-lg overflow-hidden hover:border-primary/50 transition-all cursor-pointer",
                              selectedFiles.has(file.id) ? "border-primary ring-2 ring-primary/30" : "border-border"
                            )}
                            data-testid={`file-item-${file.id}`}
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
                            {/* Selection checkbox in select mode */}
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
                            {/* Star button */}
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
                              data-testid={`button-star-file-${file.id}`}
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
                                data-testid={`button-info-file-${file.id}`}
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
                                data-testid={`button-rename-file-${file.id}`}
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
                                data-testid={`button-edit-file-${file.id}`}
                              >
                                <Tags className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                className="p-1.5 rounded bg-black/50 text-white hover-elevate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDirectDownload(file);
                                }}
                                data-testid={`button-download-file-${file.id}`}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                className="p-1.5 rounded bg-black/50 text-white hover-elevate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteFileId(file.id);
                                }}
                                data-testid={`button-delete-file-${file.id}`}
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

              {/* Files - List View */}
              {viewMode === 'list' && allFiles.length > 0 && (
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Files</h3>
                  {allFiles.map((file: FileMetadata) => (
                    <div 
                      key={file.id} 
                      className={cn(
                        "group bg-card border rounded-lg p-3 hover:border-primary/50 transition-all flex items-center justify-between gap-2",
                        selectedFiles.has(file.id) ? "border-primary ring-2 ring-primary/30" : "border-border"
                      )} 
                      data-testid={`file-item-${file.id}`}
                    >
                      {/* Selection checkbox */}
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
                          data-testid={`checkbox-file-${file.id}`}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center",
                            selectedFiles.has(file.id) ? "bg-primary border-primary" : "border-muted-foreground"
                          )}>
                            {selectedFiles.has(file.id) && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      )}
                      {/* Star button */}
                      {!isFileSelectMode && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("shrink-0 h-8 w-8", file.starred ? "text-yellow-500" : "opacity-0 group-hover:opacity-100")}
                          onClick={() => updateFileMutation.mutate({ id: file.id, starred: !file.starred })}
                          data-testid={`button-star-file-${file.id}`}
                        >
                          <Star className={cn("w-4 h-4", file.starred && "fill-current")} />
                        </Button>
                      )}
                      <button 
                        onClick={() => isFileSelectMode ? null : handleFileClick(file)}
                        className="flex items-center gap-3 flex-1 text-left hover:text-primary transition-colors min-w-0"
                        data-testid={`button-view-file-${file.id}`}
                      >
                        {getFileIcon(file)}
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block truncate">{file.name}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {file.createdAt && format(new Date(file.createdAt), "MMM d, yyyy")}
                              {file.size && ` • ${Math.round(file.size / 1024)} KB`}
                            </span>
                            {file.tags && file.tags.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {file.tags.slice(0, 3).map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5" data-testid={`file-tag-${file.id}-${tag}`}>
                                    {tag}
                                  </Badge>
                                ))}
                                {file.tags.length > 3 && (
                                  <Badge variant="outline" className="text-xs py-0 px-1.5">
                                    +{file.tags.length - 3}
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
                            className="opacity-0 group-hover:opacity-100 h-8 w-8"
                            onClick={() => setFileDetailsPanel(file)}
                            data-testid={`button-info-file-${file.id}`}
                          >
                            <Info className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="opacity-0 group-hover:opacity-100 h-8 w-8"
                            onClick={() => {
                              setRenamingFile(file);
                              setRenameValue(file.name);
                            }}
                            data-testid={`button-rename-file-${file.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="opacity-0 group-hover:opacity-100 h-8 w-8"
                            onClick={() => {
                              setEditingFile(file);
                              setEditFileTags(file.tags || []);
                            }}
                            data-testid={`button-edit-file-${file.id}`}
                          >
                            <Tags className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="opacity-0 group-hover:opacity-100 h-8 w-8"
                            onClick={() => handleDirectDownload(file)}
                            data-testid={`button-download-file-${file.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="opacity-0 group-hover:opacity-100 h-8 w-8"
                            onClick={() => setDeleteFileId(file.id)}
                            data-testid={`button-delete-file-${file.id}`}
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
          {/* End Drag and Drop Zone Wrapper */}
        </TabsContent>

        {activeTab === "photos" && (
          <TabsContent value="photos" className="space-y-4 overflow-x-hidden" forceMount>
            <Suspense fallback={<div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <PhotosTab projectId={projectId} />
            </Suspense>
          </TabsContent>
        )}

        <TabsContent value="daily-reports" className="space-y-4 overflow-x-hidden">
          {project && <DailyReportsTab project={project} onFormVisibilityChange={setDailyReportsFormOpen} />}
        </TabsContent>
      </Tabs>

      {/* PDF Viewer with markup tools */}
      {viewingFile && isPdfFile(viewingFile.contentType) && (
        <PDFViewer 
          url={getProxyUrl(viewingFile.objectPath)}
          fileName={viewingFile.name}
          onClose={() => setViewingFile(null)}
          onShare={() => handleShareFile(viewingFile)}
        />
      )}

      {/* Other file types - download prompt */}
      {viewingFile && !isPdfFile(viewingFile.contentType) && !isImageFile(viewingFile.contentType) && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" data-testid="document-viewer-modal">
          <div className="bg-card p-8 rounded-lg text-center max-w-md" onClick={(e) => e.stopPropagation()}>
            <File className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">{viewingFile.name}</p>
            <p className="text-muted-foreground mb-4">This file type cannot be previewed.</p>
            <div className="flex gap-2 justify-center">
              <a
                href={getProxyUrl(viewingFile.objectPath)}
                download={viewingFile.name}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                <Download className="w-4 h-4" /> Download
              </a>
              <Button variant="outline" onClick={() => setViewingFile(null)}>
                Close
              </Button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setViewingFile(null)} />
        </div>
      )}

      {/* Delete Project Confirmation */}
      <AlertDialog open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone and will remove all associated tasks, documents, and allocations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-project">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteProject}
              data-testid="button-confirm-delete-project"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Task Confirmation */}
      <AlertDialog open={deleteTaskId !== null} onOpenChange={(open) => !open && setDeleteTaskId(null)}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-task">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTaskId) deleteTaskMutation.mutate(deleteTaskId);
                setDeleteTaskId(null);
              }}
              data-testid="button-confirm-delete-task"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation */}
      <AlertDialog open={deleteFolderId !== null} onOpenChange={(open) => !open && setDeleteFolderId(null)}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this folder and all its contents? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-folder">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteFolderId) deleteFolderMutation.mutate(deleteFolderId);
                setDeleteFolderId(null);
              }}
              data-testid="button-confirm-delete-folder"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete File Confirmation */}
      <AlertDialog open={deleteFileId !== null} onOpenChange={(open) => !open && setDeleteFileId(null)}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-file">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteFileId) deleteFileMutation.mutate(deleteFileId);
                setDeleteFileId(null);
              }}
              data-testid="button-confirm-delete-file"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit File Tags Dialog */}
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
                  <Label htmlFor="file-tags" className="text-black dark:text-white">Tags</Label>
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
            <Button variant="outline" onClick={() => setEditingFile(null)} data-testid="button-cancel-edit-tags">
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
              data-testid="button-save-tags"
            >
              Save Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={editingTask !== null} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Task: {editingTask?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Task description..."
                value={editTaskDescription}
                onChange={(e) => setEditTaskDescription(e.target.value)}
                className="bg-white dark:bg-zinc-900 text-black dark:text-white min-h-[80px]"
                data-testid="input-edit-task-description"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-scheduled-date">Scheduled Date</Label>
              <Input
                id="edit-scheduled-date"
                type="date"
                value={editTaskScheduledDate}
                onChange={(e) => setEditTaskScheduledDate(e.target.value)}
                className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                data-testid="input-edit-task-scheduled-date"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select value={editTaskStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="bg-white dark:bg-zinc-900 text-black dark:text-white" data-testid="select-edit-task-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-priority">Priority</Label>
              <Select value={editTaskPriority} onValueChange={setEditTaskPriority}>
                <SelectTrigger className="bg-white dark:bg-zinc-900 text-black dark:text-white" data-testid="select-edit-task-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-percent-complete">
                Percent Complete: {editTaskPercentComplete}%
              </Label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">0%</span>
                <Slider
                  value={[editTaskPercentComplete]}
                  onValueChange={handlePercentCompleteChange}
                  max={100}
                  step={5}
                  className="flex-1"
                  data-testid="slider-edit-task-percent-complete"
                />
                <span className="text-sm text-muted-foreground">100%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Status automatically updates: 1-99% = In Progress, 100% = Completed
              </p>
            </div>

            {/* Status History Section */}
            <div className="grid gap-2 border-t pt-4">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Status History
              </Label>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {isHistoryLoading ? (
                  <p className="text-xs text-muted-foreground">Loading history...</p>
                ) : taskStatusHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No status changes recorded</p>
                ) : (
                  taskStatusHistory.map((entry) => (
                    <div key={entry.id} className="text-xs bg-muted/50 p-2 rounded-md" data-testid={`history-entry-${entry.id}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.changedByName}</span>
                          {entry.source === "daily_report" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              via Daily Report
                            </Badge>
                          )}
                        </div>
                        <span className="text-black dark:text-white whitespace-nowrap">
                          {entry.changedAt && new Date(entry.changedAt).toLocaleDateString()} {entry.changedAt && new Date(entry.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="mt-1">
                        {entry.previousStatus !== null && entry.newStatus !== null && (
                          <span>Status: {entry.previousStatus} → {entry.newStatus}</span>
                        )}
                        {entry.previousStatus !== null && entry.newStatus !== null && entry.previousPercentComplete !== null && entry.newPercentComplete !== null && (
                          <span className="mx-1">|</span>
                        )}
                        {entry.previousPercentComplete !== null && entry.newPercentComplete !== null && (
                          <span>Progress: {entry.previousPercentComplete}% → {entry.newPercentComplete}%</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingTask(null)} data-testid="button-cancel-edit-task">
              Cancel
            </Button>
            <Button 
              onClick={handleSaveTaskEdit} 
              disabled={updateTaskMutation.isPending}
              data-testid="button-save-edit-task"
            >
              {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={renamingFolder !== null} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="rename-folder-name">Folder Name</Label>
              <Input 
                id="rename-folder-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter new folder name"
                className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                data-testid="input-rename-folder"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolder(null)} data-testid="button-cancel-rename-folder">
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
              data-testid="button-save-rename-folder"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename File Dialog */}
      <Dialog open={renamingFile !== null} onOpenChange={(open) => !open && setRenamingFile(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Rename File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="rename-file-name">File Name</Label>
              <Input 
                id="rename-file-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter new file name"
                className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                data-testid="input-rename-file"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFile(null)} data-testid="button-cancel-rename-file">
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
              data-testid="button-save-rename-file"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Delete Files/Folders Confirmation */}
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
            <AlertDialogCancel data-testid="button-cancel-batch-delete-files">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const failedFolderIds: Set<number> = new Set();
                let fileDeleteFailed = false;
                
                // Delete files first
                if (selectedFiles.size > 0) {
                  try {
                    await batchDeleteFilesMutation.mutateAsync(Array.from(selectedFiles));
                  } catch (error) {
                    fileDeleteFailed = true;
                    toast({ title: "Error", description: "Failed to delete some files", variant: "destructive" });
                  }
                }
                
                // Delete folders one by one with proper error handling
                const failedFolderNames: string[] = [];
                for (const folderId of selectedFolders) {
                  try {
                    await deleteFolderMutation.mutateAsync(folderId);
                  } catch (error) {
                    failedFolderIds.add(folderId);
                    const folder = folders?.find(f => f.id === folderId);
                    failedFolderNames.push(folder?.name || String(folderId));
                  }
                }
                
                // Show results
                if (failedFolderNames.length > 0) {
                  toast({ 
                    title: "Some folders could not be deleted", 
                    description: `Failed: ${failedFolderNames.slice(0, 3).join(', ')}${failedFolderNames.length > 3 ? '...' : ''}. Folders with contents cannot be deleted.`,
                    variant: "destructive"
                  });
                }
                
                // Only clear successfully deleted items - keep failed ones selected
                if (!fileDeleteFailed) {
                  setSelectedFiles(new Set());
                }
                
                if (failedFolderIds.size > 0) {
                  // Keep only the failed folders selected
                  setSelectedFolders(failedFolderIds);
                } else {
                  setSelectedFolders(new Set());
                }
                
                // Only exit select mode if everything succeeded
                if (!fileDeleteFailed && failedFolderIds.size === 0) {
                  setIsFileSelectMode(false);
                }
                setShowBatchDeleteFilesConfirm(false);
              }}
              data-testid="button-confirm-batch-delete-files"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Files/Folders Dialog - Hierarchical Folder Picker */}
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
          
          {/* Breadcrumb navigation */}
          <div className="flex items-center gap-1 text-sm flex-wrap" data-testid="move-dialog-breadcrumbs">
            <button
              onClick={() => navigateToFolder(null)}
              className="hover:underline text-muted-foreground hover:text-foreground"
              data-testid="breadcrumb-root"
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
                  data-testid={`breadcrumb-folder-${crumb.id}`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          {/* Folder list */}
          <div className="space-y-1 max-h-64 overflow-y-auto border rounded-lg p-2">
            {/* Back/Up button when not at root */}
            {moveDialogViewFolderId !== null && (
              <button
                onClick={() => {
                  const parentId = moveDialogBreadcrumbs.length > 1 
                    ? moveDialogBreadcrumbs[moveDialogBreadcrumbs.length - 2].id 
                    : null;
                  navigateToFolder(parentId);
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-muted transition-colors text-muted-foreground"
                data-testid="move-dialog-back"
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
                    data-testid={`move-nav-folder-${folder.id}`}
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
              data-testid="button-cancel-move"
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
              data-testid="button-move-here"
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

      {/* File Details Panel */}
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
                    <p className="font-medium break-all">{fileDetailsPanel.name}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Uploaded</p>
                    <p className="font-medium">
                      {fileDetailsPanel.createdAt && format(new Date(fileDetailsPanel.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <HardDrive className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Size</p>
                    <p className="font-medium">
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
                    <p className="font-medium">{fileDetailsPanel.contentType || 'Unknown'}</p>
                  </div>
                </div>
                
                {fileDetailsPanel.tags && fileDetailsPanel.tags.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Tags className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {fileDetailsPanel.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-3">
                  <Star className={cn("w-4 h-4", fileDetailsPanel.starred ? "text-yellow-500 fill-current" : "text-muted-foreground")} />
                  <div>
                    <p className="text-xs text-muted-foreground">Starred</p>
                    <p className="font-medium">{fileDetailsPanel.starred ? 'Yes' : 'No'}</p>
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
              data-testid="button-download-file"
            >
              <Download className="w-4 h-4 mr-2" /> Download
            </Button>
            <Button onClick={() => setFileDetailsPanel(null)} data-testid="button-close-details">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>

    {/* Floating Project Tools Button - Outside animated container for proper fixed positioning */}
    <FloatingProjectTools
      activeTab={activeTab}
      onTabChange={handleTabChange}
      hidden={isTaskOpen || isFolderOpen || isEditOpen || moveDialogOpen || showBatchDeleteFilesConfirm || deleteProjectOpen || editingTask !== null || dailyReportsFormOpen}
    />
    </>
  );
}
