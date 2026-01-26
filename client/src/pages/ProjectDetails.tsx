import { useParams, Link, useLocation } from "wouter";
import { useProject, useDeleteProject, useUpdateProject } from "@/hooks/use-projects";
import { useProjectTasks, useCreateTask, useDeleteTask, useUpdateTask, useTaskStatusHistory } from "@/hooks/use-tasks";
import { useProjectFiles, useProjectFolders, useCreateFile, useDeleteFile, useCreateFolder, useDeleteFolder } from "@/hooks/use-files";
import { Button } from "@/components/ui/button";
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
  Clock
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type InsertTask, type FileMetadata, type Task } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { PDFViewer } from "@/components/PDFViewer";
import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

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
  const createFolderMutation = useCreateFolder(projectId);
  const deleteFolderMutation = useDeleteFolder(projectId);
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
  const [viewingFile, setViewingFile] = useState<FileMetadata | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const currentFolderIdRef = useRef<number | null>(null);
  const uploadedFilePathsRef = useRef<Map<string, string>>(new Map());
  
  // Keep ref in sync with state for use in callbacks
  currentFolderIdRef.current = currentFolderId;
  const { toast } = useToast();

  const handleFileClick = (file: FileMetadata) => {
    if (isPdfFile(file.contentType)) {
      // Open PDF in browser's native PDF viewer
      window.open(file.objectPath, '_blank');
    } else {
      setViewingFile(file);
    }
  };

  const handleShareFile = async (file: FileMetadata) => {
    try {
      // Try to share the actual file
      const response = await fetch(file.objectPath);
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
          url: `${window.location.origin}${file.objectPath}`,
        });
      } else {
        // Fall back to copying link
        await navigator.clipboard.writeText(`${window.location.origin}${file.objectPath}`);
        toast({ title: "Link Copied", description: "File link copied to clipboard." });
      }
    } catch (err) {
      // Final fallback
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${file.objectPath}`);
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

  const currentFolders = folders?.filter(f => f.parentId === currentFolderId) || [];
  const currentFiles = files?.filter(f => f.folderId === currentFolderId) || [];
  
  // All files combined for unified view
  const allFiles = currentFiles;
  
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
          src={file.objectPath} 
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

  const handleUploadComplete = async (result: any) => {
    const successfulUploads = result.successful || [];
    let successCount = 0;
    
    for (const file of successfulUploads) {
      const objectPath = uploadedFilePathsRef.current.get(file.id) || file.meta?.objectPath || "";
      
      if (!objectPath) {
        console.error("Missing objectPath for file:", file.name);
        continue;
      }
      
      try {
        await createFileMutation.mutateAsync({
          name: file.name,
          objectPath: objectPath,
          contentType: file.type,
          size: file.size,
          folderId: currentFolderIdRef.current,
        });
        successCount++;
      } catch (err) {
        console.error("Failed to save file metadata:", err);
        toast({ title: "Error", description: `Failed to save ${file.name}`, variant: "destructive" });
      }
    }
    
    uploadedFilePathsRef.current = new Map();
    
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
    <div className="space-y-8 animate-enter">
      {/* Header */}
      <div className="flex flex-col gap-6">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div 
                className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: getStatusBgColor(project.status) }}
              >
                {project.status.replace('_', ' ')}
              </div>
              {project.projectNumber && (
                <span className="text-sm font-mono text-muted-foreground">{project.projectNumber}</span>
              )}
            </div>
            <h1 className="text-3xl font-bold font-display mb-2">{project.name}</h1>
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
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">Address</span>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([project.streetAddress, project.city, project.state, project.zip].filter(Boolean).join(", "))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
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
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(true)} data-testid="button-edit-project">
              <Pencil className="w-4 h-4 mr-2" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-project-menu">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={() => setDeleteProjectOpen(true)} data-testid="button-delete-project">
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

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="tasks" data-testid="tab-tasks">Tasks</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
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
                      <PopoverContent className="w-[400px] p-0 bg-white dark:bg-zinc-900" align="start">
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
                  className="group bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-all shadow-sm hover:shadow-md flex items-center justify-between cursor-pointer" 
                  data-testid={`task-item-${task.id}`}
                  onClick={() => handleOpenEditTask(task)}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "mt-1 w-2 h-2 rounded-full",
                      task.status === 'completed' ? "bg-green-500" :
                      task.status === 'in_progress' ? "bg-blue-500" :
                      task.status === 'blocked' ? "bg-red-500" :
                      "bg-gray-400"
                    )} />
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{task.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{task.description || "No description provided."}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateRange(task.scheduledDate, task.dueDate)}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded uppercase tracking-wider font-bold",
                          task.priority === 'high' ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"
                        )}>
                          {task.priority} Priority
                        </span>
                        {task.percentComplete > 0 && (
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
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

        <TabsContent value="documents" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-between relative z-10">
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
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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

            <ObjectUploader
              maxNumberOfFiles={50}
              maxFileSize={52428800}
              buttonClassName="w-full sm:w-auto"
              onGetUploadParameters={async (file) => {
                const res = await fetch("/api/uploads/request-url", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: file.name,
                    size: file.size,
                    contentType: file.type,
                  }),
                });
                const { uploadURL, objectPath } = await res.json();
                
                uploadedFilePathsRef.current.set(file.id, objectPath);
                
                return {
                  method: "PUT",
                  url: uploadURL,
                  headers: { "Content-Type": file.type || "application/octet-stream" },
                };
              }}
              onComplete={handleUploadComplete}
            >
              <Upload className="w-4 h-4 mr-2" /> Upload Files
            </ObjectUploader>
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
          ) : (currentFolders.length === 0 && currentFiles.length === 0) ? (
            <div className="py-20 text-center bg-card border border-dashed border-border rounded-xl">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No documents yet. Upload files or create folders to organize your project documents.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Folders */}
              {currentFolders.length > 0 && (
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Folders</h3>
                  {currentFolders.map(folder => (
                    <div key={folder.id} className="group bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-all flex items-center justify-between" data-testid={`folder-item-${folder.id}`}>
                      <button 
                        className="flex items-center gap-3 flex-1 text-left hover:text-primary transition-colors"
                        onClick={() => setCurrentFolderId(folder.id)}
                        data-testid={`button-open-folder-${folder.id}`}
                      >
                        <Folder className="w-5 h-5 text-primary" />
                        <span className="font-medium">{folder.name}</span>
                      </button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteFolderId(folder.id);
                        }}
                        data-testid={`button-delete-folder-${folder.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                        {groupFiles.map((file: FileMetadata) => (
                          <div 
                            key={file.id} 
                            className="group relative aspect-square bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-all cursor-pointer"
                            data-testid={`file-item-${file.id}`}
                          >
                            <button 
                              onClick={() => handleFileClick(file)}
                              className="w-full h-full"
                              data-testid={`button-view-file-${file.id}`}
                            >
                              {getFileThumbnail(file)}
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1">
                              <p className="text-white text-xs truncate">{file.name}</p>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 bg-black/50 hover:bg-black/70 text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteFileId(file.id);
                              }}
                              data-testid={`button-delete-file-${file.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
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
                    <div key={file.id} className="group bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-all flex items-center justify-between" data-testid={`file-item-${file.id}`}>
                      <button 
                        onClick={() => handleFileClick(file)}
                        className="flex items-center gap-3 flex-1 text-left hover:text-primary transition-colors"
                        data-testid={`button-view-file-${file.id}`}
                      >
                        {getFileIcon(file)}
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {file.createdAt && format(new Date(file.createdAt), "MMM d, yyyy")}
                            {file.size && ` • ${Math.round(file.size / 1024)} KB`}
                          </span>
                        </div>
                      </button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => setDeleteFileId(file.id)}
                        data-testid={`button-delete-file-${file.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* PDF Viewer with markup tools */}
      {viewingFile && isPdfFile(viewingFile.contentType) && (
        <PDFViewer 
          url={viewingFile.objectPath}
          fileName={viewingFile.name}
          onClose={() => setViewingFile(null)}
          onShare={() => handleShareFile(viewingFile)}
        />
      )}

      {/* Image Viewer Modal */}
      {viewingFile && isImageFile(viewingFile.contentType) && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" data-testid="document-viewer-modal">
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={() => setViewingFile(null)}>
            <img 
              src={viewingFile.objectPath} 
              alt={viewingFile.name}
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="bg-black/80 backdrop-blur-sm border-t border-white/10 p-3 safe-area-bottom">
            <div className="flex items-center justify-between max-w-lg mx-auto gap-2">
              <p className="text-white text-sm font-medium truncate flex-1">{viewingFile.name}</p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => handleShareFile(viewingFile)}
                  data-testid="button-share-file"
                >
                  <Share2 className="w-5 h-5" />
                </Button>
                <a
                  href={viewingFile.objectPath}
                  download={viewingFile.name}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md text-white hover:bg-white/20"
                  data-testid="button-download-file"
                >
                  <Download className="w-5 h-5" />
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => setViewingFile(null)}
                  data-testid="button-close-viewer"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
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
                href={viewingFile.objectPath}
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
                        <span className="font-medium">{entry.changedByName}</span>
                        <span className="text-black dark:text-white whitespace-nowrap">
                          {new Date(entry.changedAt).toLocaleDateString()} {new Date(entry.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
    </div>
  );
}
