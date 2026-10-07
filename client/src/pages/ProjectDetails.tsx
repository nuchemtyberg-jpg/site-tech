import { useParams, Link, useLocation, useSearch } from "wouter";
import { DocumentsTool } from "@/components/documents/DocumentsTool";
import { useProject, useDeleteProject, useUpdateProject } from "@/hooks/use-projects";
import { useProjectTasks, useCreateTask, useDeleteTask, useUpdateTask, useTaskStatusHistory } from "@/hooks/use-tasks";
import { lazy, Suspense } from "react";

const PhotosTab = lazy(() => import("@/components/PhotosTab"));
import { FloatingProjectTools } from "@/components/FloatingProjectTools";
import { CommunicationsTab } from "@/components/CommunicationsTab";
import { RfiTab } from "@/components/RfiTab";
import { ProjectTodosTab } from "@/components/ProjectTodosTab";
import { ProjectActivityTab } from "@/components/ProjectActivityTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  MoreVertical, 
  Plus, 
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Pencil,
  User,
  DollarSign,
  StickyNote,
  Check,
  ChevronsUpDown,
  Clock,
  Settings,
  Mail,
  Phone,
  Smartphone,
  UserPlus
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
import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type InsertTask, type Task, type TaskTitle } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Customer, Contact, ProjectContact } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { DailyReportsTab } from "@/components/DailyReportsTab";
import { logRouteMount, logRouteUnmount } from "@/lib/debugPerf";
import { HardHat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FingercheckJob {
  code: string;
  description: string;
}

interface ProjectMapping {
  id: number;
  projectId: number;
  fingercheckJobCode: string;
  fingercheckJobDescription: string | null;
}

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

// Canonical status list shared with the server and workflow rules
import { PROJECT_STATUSES } from "@shared/projectStatus";

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
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: taskTitleRecords = [] } = useQuery<TaskTitle[]>({ queryKey: ["/api/task-titles"] });
  const customTaskTitles = useMemo(() => taskTitleRecords.map(t => t.name), [taskTitleRecords]);
  const createTaskTitleMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/task-titles", { name });
      return res.json() as Promise<TaskTitle>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-titles"] });
    },
  });
  const deleteTaskMutation = useDeleteTask();
  const deleteProjectMutation = useDeleteProject();
  const updateProjectMutation = useUpdateProject();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [isCustomTitleOpen, setIsCustomTitleOpen] = useState(false);
  const [newCustomTitle, setNewCustomTitle] = useState("");
  const [taskTitleSearch, setTaskTitleSearch] = useState("");
  const [taskTitlePopoverOpen, setTaskTitlePopoverOpen] = useState(false);
  
  // Delete confirmation states
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  
  // Edit task state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dailyReportsFormOpen, setDailyReportsFormOpen] = useState(false);
  const [isProjectDetailsExpanded, setIsProjectDetailsExpanded] = useState(false);
  const [editTaskDescription, setEditTaskDescription] = useState("");
  const [editTaskScheduledDate, setEditTaskScheduledDate] = useState("");
  const [editTaskStatus, setEditTaskStatus] = useState("pending");
  const [editTaskPriority, setEditTaskPriority] = useState("medium");
  const [editTaskPercentComplete, setEditTaskPercentComplete] = useState(0);
  const [editTaskScheduledValue, setEditTaskScheduledValue] = useState<string>("");
  const [selectedFingercheckJob, setSelectedFingercheckJob] = useState<string>("none");
  
  // Task status history
  const { data: taskStatusHistory = [], isLoading: isHistoryLoading } = useTaskStatusHistory(editingTask?.id || null);

  const { data: fingercheckJobs = [] } = useQuery<FingercheckJob[]>({
    queryKey: ["/api/fingercheck-jobs/all"],
  });

  const { data: projectMappings = [] } = useQuery<ProjectMapping[]>({
    queryKey: ["/api/project-mappings/project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/project-mappings/project/${projectId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const currentMapping = projectMappings.length > 0 ? projectMappings[0] : null;

  interface DailyReportRecipient {
    id: number;
    projectId: number;
    email: string;
    name: string | null;
    createdAt: string | null;
  }

  const { data: recipients = [] } = useQuery<DailyReportRecipient[]>({
    queryKey: ["/api/projects", projectId, "daily-report-recipients"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/daily-report-recipients`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createRecipientMutation = useMutation({
    mutationFn: async (data: { email: string; name?: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/daily-report-recipients`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "daily-report-recipients"] });
      toast({ title: "Recipient added successfully" });
      setNewRecipientEmail("");
      setNewRecipientName("");
    },
    onError: () => {
      toast({ title: "Failed to add recipient", variant: "destructive" });
    },
  });

  const deleteRecipientMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/daily-report-recipients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "daily-report-recipients"] });
      toast({ title: "Recipient removed" });
      setDeleteRecipientId(null);
    },
    onError: () => {
      toast({ title: "Failed to remove recipient", variant: "destructive" });
    },
  });

  // Project Contacts
  type ProjectContactWithContact = ProjectContact & { contact: Contact };
  const { data: projectContacts = [] } = useQuery<ProjectContactWithContact[]>({
    queryKey: ["/api/projects", projectId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contacts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !isNaN(projectId),
  });

  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [contactRoleLabel, setContactRoleLabel] = useState("");
  const [removeProjectContactId, setRemoveProjectContactId] = useState<number | null>(null);

  const { data: customerContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/customers", project?.customerId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${project?.customerId}/contacts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAddContactOpen && !!project?.customerId,
  });

  const linkContactMutation = useMutation({
    mutationFn: async (data: { contactId: number; roleLabel?: string | null }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/contacts`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "contacts"] });
      toast({ title: "Contact linked to project" });
      setIsAddContactOpen(false);
      setSelectedContactId("");
      setContactRoleLabel("");
    },
    onError: async (err: any) => {
      const message = err?.message?.replace(/^\d+:\s*/, "") || "Failed to link contact";
      toast({ title: message, variant: "destructive" });
    },
  });

  const unlinkContactMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/project-contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "contacts"] });
      toast({ title: "Contact removed from project" });
      setRemoveProjectContactId(null);
    },
    onError: () => {
      toast({ title: "Failed to remove contact", variant: "destructive" });
    },
  });

  const linkedContactIds = new Set(projectContacts.map((pc) => pc.contactId));
  const availableContacts = customerContacts.filter((c) => c.isActive && !linkedContactIds.has(c.id));

  const [newRecipientEmail, setNewRecipientEmail] = useState("");
  const [newRecipientName, setNewRecipientName] = useState("");
  const [deleteRecipientId, setDeleteRecipientId] = useState<number | null>(null);
  const [settingsFingercheckJob, setSettingsFingercheckJob] = useState<string>("none");
  const [isSavingFingercheck, setIsSavingFingercheck] = useState(false);

  useEffect(() => {
    setSettingsFingercheckJob(currentMapping?.fingercheckJobCode || "none");
  }, [currentMapping]);

  useEffect(() => {
    if (isEditOpen) {
      setSelectedFingercheckJob(currentMapping?.fingercheckJobCode || "none");
    }
  }, [isEditOpen, currentMapping]);

  const handleSaveFingercheckMapping = async () => {
    setIsSavingFingercheck(true);
    try {
      if (settingsFingercheckJob !== (currentMapping?.fingercheckJobCode || "none")) {
        if (currentMapping) {
          await apiRequest("DELETE", `/api/project-mappings/${currentMapping.id}`);
        }
        if (settingsFingercheckJob !== "none") {
          const selectedJob = fingercheckJobs.find(j => j.code === settingsFingercheckJob);
          await apiRequest("POST", "/api/project-mappings", {
            projectId,
            fingercheckJobCode: settingsFingercheckJob,
            fingercheckJobDescription: selectedJob?.description || null,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/project-mappings/project", projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/project-mappings"] });
      }
      toast({ title: "Fingercheck mapping updated" });
    } catch {
      toast({ title: "Failed to update Fingercheck mapping", variant: "destructive" });
    } finally {
      setIsSavingFingercheck(false);
    }
  };

  const handleAddRecipient = () => {
    if (!newRecipientEmail.trim()) return;
    createRecipientMutation.mutate({
      email: newRecipientEmail.trim(),
      name: newRecipientName.trim() || undefined,
    });
  };

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

  const handleEditSubmit = async (data: EditProjectFormData) => {
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
  // Tab state from URL using wouter's useSearch hook
  const search = useSearch();
  const [location, navigate] = useLocation();

  // Derive active tab from search params - default to documents
  const activeTab = useMemo(() => {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    return tab && ["tasks", "todos", "documents", "photos", "daily-reports", "communications", "rfis", "activity", "settings"].includes(tab) ? tab : "documents";
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
  const { toast } = useToast();

  // Debug logging for route mount/unmount
  useEffect(() => {
    logRouteMount('ProjectDetails');
    return () => {
      logRouteUnmount('ProjectDetails');
    };
  }, []);

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
    setEditTaskScheduledValue(task.scheduledValue != null ? String(task.scheduledValue) : "");
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
      scheduledValue: editTaskScheduledValue ? parseInt(editTaskScheduledValue, 10) : null,
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
        
        {/* Collapsible Project Details Header */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Collapsed View - Always visible */}
          <div 
            className="flex items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-3 cursor-pointer hover-elevate"
            onClick={() => setIsProjectDetailsExpanded(!isProjectDetailsExpanded)}
            data-testid="button-toggle-project-details"
          >
            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
              <div 
                className="px-2 py-0.5 rounded text-[10px] md:text-xs font-bold uppercase tracking-wider text-white shrink-0"
                style={{ backgroundColor: getStatusBgColor(project.status) }}
              >
                {project.status.replace('_', ' ')}
              </div>
              {project.projectNumber && (
                <span className="text-xs md:text-sm font-mono text-muted-foreground shrink-0">#{project.projectNumber}</span>
              )}
              <h1 className="text-sm md:text-lg font-bold font-display truncate">{project.name}</h1>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="shrink-0 min-h-[44px] min-w-[44px] md:min-h-8 md:min-w-8"
              onClick={(e) => {
                e.stopPropagation();
                setIsProjectDetailsExpanded(!isProjectDetailsExpanded);
              }}
              data-testid="button-expand-project-details"
            >
              {isProjectDetailsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
          
          {/* Expanded View - Full details */}
          {isProjectDetailsExpanded && (
            <div className="border-t border-border px-3 py-3 md:px-4 md:py-4 animate-in slide-in-from-top-2 duration-200">
              {project.description && (
                <p className="text-muted-foreground mb-4 max-w-2xl text-sm">{project.description}</p>
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

              {currentMapping && (
                <div className="flex items-start gap-3 text-sm border-t border-border pt-4 mt-2">
                  <HardHat className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Fingercheck Job</span>
                    <span className="text-foreground" data-testid="text-fingercheck-mapping">{currentMapping.fingercheckJobDescription || currentMapping.fingercheckJobCode}</span>
                  </div>
                </div>
              )}
              
              {/* Project Contacts */}
              <div className="text-sm border-t border-border pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Project Contacts</span>
                  </div>
                  {project.customerId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setIsAddContactOpen(true); }}
                      data-testid="button-add-project-contact"
                    >
                      <UserPlus className="w-4 h-4 mr-1" /> Link Contact
                    </Button>
                  )}
                </div>
                {projectContacts.length === 0 ? (
                  <p className="text-muted-foreground text-sm" data-testid="text-no-project-contacts">
                    {project.customerId
                      ? "No contacts linked yet. Link the customer's contacts involved in this job."
                      : "Assign a customer to this project to link contacts."}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {projectContacts.map((pc) => (
                      <div key={pc.id} className="border border-border rounded-lg p-3 flex flex-col gap-1" data-testid={`card-project-contact-${pc.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-foreground block truncate">
                              {pc.contact.firstName} {pc.contact.lastName || ""}
                            </span>
                            <span className="text-xs text-muted-foreground block truncate">
                              {[pc.roleLabel, pc.contact.jobTitle].filter(Boolean).join(" · ") || null}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setRemoveProjectContactId(pc.id)}
                            data-testid={`button-remove-project-contact-${pc.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex flex-col gap-1 text-sm">
                          {pc.contact.mobilePhone && (
                            <a href={`tel:${pc.contact.mobilePhone}`} className="flex items-center gap-2 text-foreground hover:text-primary" data-testid={`link-contact-mobile-${pc.id}`}>
                              <Smartphone className="w-3.5 h-3.5 shrink-0" /> {pc.contact.mobilePhone}
                            </a>
                          )}
                          {pc.contact.officePhone && (
                            <a href={`tel:${pc.contact.officePhone}`} className="flex items-center gap-2 text-foreground hover:text-primary" data-testid={`link-contact-office-${pc.id}`}>
                              <Phone className="w-3.5 h-3.5 shrink-0" /> {pc.contact.officePhone}{pc.contact.extension ? ` x${pc.contact.extension}` : ""}
                            </a>
                          )}
                          {pc.contact.email && (
                            <a href={`mailto:${pc.contact.email}`} className="flex items-center gap-2 text-foreground hover:text-primary truncate" data-testid={`link-contact-email-${pc.id}`}>
                              <Mail className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{pc.contact.email}</span>
                            </a>
                          )}
                          {!pc.contact.mobilePhone && !pc.contact.officePhone && !pc.contact.email && (
                            <span className="text-muted-foreground text-xs">No phone or email on file</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setIsEditOpen(true)} data-testid="button-edit-project" className="min-h-[44px] md:min-h-9">
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </Button>
                <Button variant="outline" size="icon" onClick={() => handleTabChange("settings")} data-testid="button-project-settings" className="min-h-[44px] min-w-[44px] md:min-h-9 md:min-w-9">
                  <Settings className="w-4 h-4" />
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
          )}
        </div>

        {/* Link Contact Dialog */}
        <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Link Contact to Project</DialogTitle>
              <DialogDescription>
                Choose one of the customer's contacts and optionally note their role on this job.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Contact *</Label>
                <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                  <SelectTrigger data-testid="select-project-contact" className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                    <SelectValue placeholder={availableContacts.length ? "Select a contact" : "No contacts available"} />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                    {availableContacts.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.firstName} {c.lastName || ""}{c.jobTitle ? ` — ${c.jobTitle}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableContacts.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    All of this customer's active contacts are already linked, or none exist yet. Add contacts from the customer's page.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Role on this job (optional)</Label>
                <Input
                  placeholder="e.g. Site Super, Billing (AP)"
                  value={contactRoleLabel}
                  onChange={(e) => setContactRoleLabel(e.target.value)}
                  maxLength={100}
                  data-testid="input-project-contact-role"
                  className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddContactOpen(false)}>Cancel</Button>
              <Button
                disabled={!selectedContactId || linkContactMutation.isPending}
                onClick={() => linkContactMutation.mutate({
                  contactId: Number(selectedContactId),
                  roleLabel: contactRoleLabel.trim() || null,
                })}
                data-testid="button-confirm-link-contact"
              >
                {linkContactMutation.isPending ? "Linking..." : "Link Contact"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Project Contact Confirmation */}
        <AlertDialog open={removeProjectContactId !== null} onOpenChange={(open) => !open && setRemoveProjectContactId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove contact from project?</AlertDialogTitle>
              <AlertDialogDescription>
                This only unlinks the contact from this project. The contact stays on the customer's record.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => removeProjectContactId !== null && unlinkContactMutation.mutate(removeProjectContactId)}
                data-testid="button-confirm-remove-project-contact"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                              {Array.from(new Map([...PREDEFINED_TASK_TITLES, ...customTaskTitles].map(t => [t.toLowerCase(), t])).values()).sort().map((title) => (
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="dueDate">Scheduled Date</Label>
                      <Input id="dueDate" type="date" {...form.register("dueDate")} data-testid="input-task-due" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="scheduledValue">Scheduled Value ($)</Label>
                      <Input
                        id="scheduledValue"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        {...form.register("scheduledValue", { valueAsNumber: true })}
                        data-testid="input-task-scheduled-value"
                        className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        const name = newCustomTitle.trim();
                        if (!name) return;
                        createTaskTitleMutation.mutate(name, {
                          onSuccess: (created) => {
                            form.setValue("title", created.name);
                            setNewCustomTitle("");
                            setIsCustomTitleOpen(false);
                          },
                          onError: (err: any) => {
                            toast({ title: "Error", description: err?.message ?? "Could not add task title", variant: "destructive" });
                          },
                        });
                      }}
                      disabled={!newCustomTitle.trim() || createTaskTitleMutation.isPending}
                      data-testid="button-add-custom-title"
                    >
                      {createTaskTitleMutation.isPending ? "Adding..." : "Add Title"}
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

        <TabsContent value="documents">
          <DocumentsTool entityType="project" entityId={projectId} />
        </TabsContent>

        {activeTab === "photos" && (
          <TabsContent value="photos" className="space-y-4 overflow-x-hidden" forceMount>
            <Suspense fallback={<div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <PhotosTab projectId={projectId} />
            </Suspense>
          </TabsContent>
        )}

        <TabsContent value="daily-reports">
          <div className="flex flex-col h-[calc(100vh-180px)] overflow-hidden">
            {project && <DailyReportsTab project={project} onFormVisibilityChange={setDailyReportsFormOpen} />}
          </div>
        </TabsContent>

        <TabsContent value="communications">
          {project && <CommunicationsTab project={project} />}
        </TabsContent>

        <TabsContent value="rfis">
          {project && <RfiTab project={project} />}
        </TabsContent>

        <TabsContent value="todos" className="overflow-x-hidden">
          <ProjectTodosTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="activity" className="overflow-x-hidden">
          <ProjectActivityTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-6 max-w-2xl">
            {fingercheckJobs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HardHat className="w-5 h-5" />
                    Fingercheck Job Mapping
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Link this project to a Fingercheck job to track employee hours against it.
                  </p>
                  <Select value={settingsFingercheckJob} onValueChange={setSettingsFingercheckJob}>
                    <SelectTrigger className="bg-white dark:bg-zinc-900 text-black dark:text-white" data-testid="select-settings-fingercheck-job">
                      <SelectValue placeholder="Select a Fingercheck job..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                      <SelectItem value="none">No mapping</SelectItem>
                      {fingercheckJobs.map((job) => (
                        <SelectItem key={job.code} value={job.code}>{job.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleSaveFingercheckMapping}
                    disabled={isSavingFingercheck}
                    data-testid="button-save-fingercheck-mapping"
                  >
                    {isSavingFingercheck ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="w-5 h-5" />
                  Daily Report Recipients
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Email addresses that will automatically receive daily report PDFs when reports are signed
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                  <div className="grid gap-1.5 flex-1 w-full">
                    <Label htmlFor="recipient-email"><span className="text-red-500">*</span> Email</Label>
                    <Input
                      id="recipient-email"
                      type="email"
                      placeholder="email@example.com"
                      value={newRecipientEmail}
                      onChange={(e) => setNewRecipientEmail(e.target.value)}
                      data-testid="input-recipient-email"
                      className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                    />
                  </div>
                  <div className="grid gap-1.5 flex-1 w-full">
                    <Label htmlFor="recipient-name">Name</Label>
                    <Input
                      id="recipient-name"
                      placeholder="John Doe"
                      value={newRecipientName}
                      onChange={(e) => setNewRecipientName(e.target.value)}
                      data-testid="input-recipient-name"
                      className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                    />
                  </div>
                  <Button
                    onClick={handleAddRecipient}
                    disabled={!newRecipientEmail.trim() || createRecipientMutation.isPending}
                    data-testid="button-add-recipient"
                    className="w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {createRecipientMutation.isPending ? "Adding..." : "Add"}
                  </Button>
                </div>

                {recipients.length > 0 && (
                  <div className="space-y-2 border-t border-border pt-4">
                    {recipients.map((recipient) => (
                      <div key={recipient.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-muted/50" data-testid={`recipient-row-${recipient.id}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" data-testid={`text-recipient-email-${recipient.id}`}>{recipient.email}</p>
                          {recipient.name && (
                            <p className="text-xs text-muted-foreground truncate" data-testid={`text-recipient-name-${recipient.id}`}>{recipient.name}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteRecipientId(recipient.id)}
                          data-testid={`button-delete-recipient-${recipient.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {recipients.length === 0 && (
                  <p className="text-sm text-muted-foreground italic" data-testid="text-no-recipients">No recipients added yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteRecipientId !== null} onOpenChange={(open) => { if (!open) setDeleteRecipientId(null); }}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Recipient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this recipient? They will no longer receive daily report PDFs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-recipient">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteRecipientId) deleteRecipientMutation.mutate(deleteRecipientId); }}
              data-testid="button-confirm-delete-recipient"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <Label htmlFor="edit-scheduled-value">Scheduled Value ($)</Label>
                <Input
                  id="edit-scheduled-value"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={editTaskScheduledValue}
                  onChange={(e) => setEditTaskScheduledValue(e.target.value)}
                  className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                  data-testid="input-edit-task-scheduled-value"
                />
              </div>
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

    </div>

    {/* Floating Project Tools Button - Outside animated container for proper fixed positioning */}
    <FloatingProjectTools
      activeTab={activeTab}
      onTabChange={handleTabChange}
      hidden={isTaskOpen || isEditOpen || deleteProjectOpen || editingTask !== null || dailyReportsFormOpen}
    />
    </>
  );
}
