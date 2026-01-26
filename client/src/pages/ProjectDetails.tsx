import { useParams, Link } from "wouter";
import { useProject, useDeleteProject } from "@/hooks/use-projects";
import { useProjectTasks, useCreateTask, useDeleteTask } from "@/hooks/use-tasks";
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
  Home
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type InsertTask } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ObjectUploader } from "@/components/ObjectUploader";

export default function ProjectDetails() {
  const { id } = useParams();
  const projectId = Number(id);
  const { data: project, isLoading: isProjectLoading } = useProject(projectId);
  const { data: tasks, isLoading: isTasksLoading } = useProjectTasks(projectId);
  const { data: files, isLoading: isFilesLoading } = useProjectFiles(projectId);
  const { data: folders, isLoading: isFoldersLoading } = useProjectFolders(projectId);
  const deleteTaskMutation = useDeleteTask();
  const deleteProjectMutation = useDeleteProject();
  const createTaskMutation = useCreateTask();
  const createFileMutation = useCreateFile(projectId);
  const deleteFileMutation = useDeleteFile(projectId);
  const createFolderMutation = useCreateFolder(projectId);
  const deleteFolderMutation = useDeleteFolder(projectId);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const uploadedFilePathsRef = useRef<Map<string, string>>(new Map());
  const { toast } = useToast();

  const currentFolders = folders?.filter(f => f.parentId === currentFolderId) || [];
  const currentFiles = files?.filter(f => f.folderId === currentFolderId) || [];
  
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
    if (confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      deleteProjectMutation.mutate(projectId, {
        onSuccess: () => window.location.href = "/projects"
      });
    }
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
          folderId: currentFolderId,
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

  const statusColor = (status: string) => {
    switch(status) {
      case 'active': return 'bg-green-500 text-white';
      case 'planning': return 'bg-blue-500 text-white';
      case 'completed': return 'bg-gray-500 text-white';
      case 'on_hold': return 'bg-yellow-500 text-black';
      default: return 'bg-gray-500';
    }
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
            <div className="flex items-center gap-3 mb-2">
              <div className={cn("px-3 py-1 rounded text-xs font-bold uppercase tracking-wider", statusColor(project.status))}>
                {project.status.replace('_', ' ')}
              </div>
              <h1 className="text-3xl font-bold font-display">{project.name}</h1>
            </div>
            <p className="text-muted-foreground mb-4 max-w-2xl">{project.description}</p>
            
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full">
                <MapPin className="w-4 h-4 text-primary" />
                {project.location}
              </div>
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full">
                <Calendar className="w-4 h-4 text-primary" />
                {formatDateRange(project.startDate, project.endDate)}
              </div>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-project-menu">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={handleDeleteProject} data-testid="button-delete-project">
                <Trash2 className="w-4 h-4 mr-2" /> Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="tasks" data-testid="tab-tasks">Tasks</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          </TabsList>
          
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
                  <Label htmlFor="title">Task Title</Label>
                  <Input id="title" {...form.register("title")} placeholder="e.g. Foundation Pour" data-testid="input-task-title" />
                  {form.formState.errors.title && <p className="text-red-500 text-xs">{form.formState.errors.title.message}</p>}
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" {...form.register("description")} placeholder="Details..." data-testid="input-task-description" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input id="startDate" type="date" {...form.register("startDate", { valueAsDate: true })} data-testid="input-task-start" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input id="endDate" type="date" {...form.register("endDate", { valueAsDate: true })} data-testid="input-task-end" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select onValueChange={(val) => form.setValue("status", val)} defaultValue="pending">
                      <SelectTrigger data-testid="select-task-status">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
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
                      <SelectTrigger data-testid="select-task-priority">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
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
        </div>

        <TabsContent value="tasks" className="space-y-4">
          {isTasksLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading tasks...</div>
          ) : tasks?.length === 0 ? (
            <div className="py-20 text-center bg-card border border-dashed border-border rounded-xl">
              <p className="text-muted-foreground">No tasks yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {tasks?.map(task => (
                <div key={task.id} className="group bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-all shadow-sm hover:shadow-md flex items-center justify-between" data-testid={`task-item-${task.id}`}>
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
                          {formatDateRange(task.startDate, task.endDate)}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded uppercase tracking-wider font-bold",
                          task.priority === 'high' ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"
                        )}>
                          {task.priority} Priority
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteTaskMutation.mutate(task.id)}
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end relative z-10">
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
              maxNumberOfFiles={10}
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
                          deleteFolderMutation.mutate(folder.id);
                        }}
                        data-testid={`button-delete-folder-${folder.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Files */}
              {currentFiles.length > 0 && (
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Files</h3>
                  {currentFiles.map(file => (
                    <div key={file.id} className="group bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-all flex items-center justify-between" data-testid={`file-item-${file.id}`}>
                      <a 
                        href={file.objectPath} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 flex-1 hover:text-primary transition-colors"
                      >
                        <File className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <span className="font-medium">{file.name}</span>
                          {file.size && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ({Math.round(file.size / 1024)} KB)
                            </span>
                          )}
                        </div>
                      </a>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => deleteFileMutation.mutate(file.id)}
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
    </div>
  );
}
