import { useParams, Link } from "wouter";
import { useProject, useDeleteProject } from "@/hooks/use-projects";
import { useProjectTasks, useCreateTask, useDeleteTask } from "@/hooks/use-tasks";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  MoreVertical, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertOctagon,
  Trash2
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
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type InsertTask } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ProjectDetails() {
  const { id } = useParams();
  const projectId = Number(id);
  const { data: project, isLoading: isProjectLoading } = useProject(projectId);
  const { data: tasks, isLoading: isTasksLoading } = useProjectTasks(projectId);
  const deleteTaskMutation = useDeleteTask();
  const deleteProjectMutation = useDeleteProject();
  const createTaskMutation = useCreateTask();
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const { toast } = useToast();

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
    // Ensure projectId is set correctly
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

  const statusColor = (status: string) => {
    switch(status) {
      case 'active': return 'bg-green-500 text-white';
      case 'planning': return 'bg-blue-500 text-white';
      case 'completed': return 'bg-gray-500 text-white';
      case 'on_hold': return 'bg-yellow-500 text-black';
      default: return 'bg-gray-500';
    }
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
                {format(new Date(project.startDate), "MMM d")} - {format(new Date(project.endDate), "MMM d, yyyy")}
              </div>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={handleDeleteProject}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="team" disabled>Team</TabsTrigger>
            <TabsTrigger value="documents" disabled>Documents</TabsTrigger>
          </TabsList>
          
          <Dialog open={isTaskOpen} onOpenChange={setIsTaskOpen}>
            <DialogTrigger asChild>
              <Button>
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
                  <Input id="title" {...form.register("title")} placeholder="e.g. Foundation Pour" />
                  {form.formState.errors.title && <p className="text-red-500 text-xs">{form.formState.errors.title.message}</p>}
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" {...form.register("description")} placeholder="Details..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input id="startDate" type="date" {...form.register("startDate", { valueAsDate: true })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input id="endDate" type="date" {...form.register("endDate", { valueAsDate: true })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select onValueChange={(val) => form.setValue("status", val)} defaultValue="pending">
                      <SelectTrigger>
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
                      <SelectTrigger>
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
                  <Button type="submit" disabled={createTaskMutation.isPending}>
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
                <div key={task.id} className="group bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-all shadow-sm hover:shadow-md flex items-center justify-between">
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
                          {format(new Date(task.startDate), "MMM d")} - {format(new Date(task.endDate), "MMM d")}
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
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
