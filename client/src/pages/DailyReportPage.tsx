import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getProxyUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Save, Plus, Trash2, Cloud, Truck, ChevronDown, ChevronUp, CheckCircle, PenLine, Download, Camera, X, Image } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { NativeFileUploader } from "@/components/NativeFileUploader";
import type { Task, Project } from "@shared/schema";

const LABOR_TYPES = ["Foreman", "Operator", "Laborer"];
const EQUIPMENT_TYPES = ["Mini Excavator", "Excavator", "Skid Steer", "Compactor"];

// Debounce hook for text inputs
function useDebouncedCallback<T extends (...args: any[]) => void>(callback: T, delay: number) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]) as T;
}

interface TaskEntryWithDetails {
  id: number;
  reportId: number;
  taskId: number;
  taskTitleSnapshot: string;
  percentComplete: number;
  comments: string | null;
  laborLines: LaborLine[];
  equipmentLines: EquipmentLine[];
  photos: Photo[];
  allowedMin?: number;
  allowedMax?: number;
}

interface LaborLine {
  id: number;
  taskEntryId: number;
  laborType: string;
  quantity: number;
  hours: number;
}

interface EquipmentLine {
  id: number;
  taskEntryId: number;
  equipmentType: string;
  quantity: number;
  hours: number;
}

interface DeliveryEntry {
  id: number;
  reportId: number;
  vendor: string | null;
  deliveryTime: string | null;
  description: string | null;
  allDelivered: boolean | null;
  missingItemsDetails: string | null;
  photos: Photo[];
}

interface Photo {
  id: number;
  url: string;
  caption: string | null;
}

interface ReportWithDetails {
  id: number;
  projectId: number;
  reportDate: string;
  status: string;
  weatherSummary: string | null;
  temperature: string | null;
  temperatureHigh: string | null;
  temperatureLow: string | null;
  windSpeed: string | null;
  notes: string | null;
  signatureType: string | null;
  signatureValue: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  completedByName: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  updatedAt: Date | null;
  taskEntries: TaskEntryWithDetails[];
  deliveryEntries: DeliveryEntry[];
  isLatestReport?: boolean;
}

function safeFormatDate(dateString: string | null | undefined, formatStr: string, fallback: string = 'N/A'): string {
  if (!dateString) return fallback;
  try {
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) return fallback;
    return format(date, formatStr);
  } catch {
    return fallback;
  }
}

export default function DailyReportPage() {
  const [, setLocation] = useLocation();
  const [matchNew, paramsNew] = useRoute("/projects/:projectId/reports/new");
  const [matchEdit, paramsEdit] = useRoute("/projects/:projectId/reports/:reportId");
  
  const projectId = matchNew ? Number(paramsNew?.projectId) : matchEdit ? Number(paramsEdit?.projectId) : null;
  const reportId = matchEdit && paramsEdit?.reportId !== 'new' ? Number(paramsEdit?.reportId) : null;
  const isNewReport = matchNew || paramsEdit?.reportId === 'new';

  const { toast } = useToast();
  const [newReportDate, setNewReportDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [deleteTaskEntryId, setDeleteTaskEntryId] = useState<number | null>(null);
  const [deleteDeliveryId, setDeleteDeliveryId] = useState<number | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signatureType, setSignatureType] = useState<'freehand' | 'typed'>('freehand');
  const [typedSignature, setTypedSignature] = useState('');
  const [signerName, setSignerName] = useState('');
  const [notes, setNotes] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  
  // Local state for text fields to improve performance (debounced sync)
  const [localTaskComments, setLocalTaskComments] = useState<Record<number, string>>({});
  const [localTaskPercents, setLocalTaskPercents] = useState<Record<number, number>>({});
  const [localDeliveryDescriptions, setLocalDeliveryDescriptions] = useState<Record<number, string>>({});
  const [localDeliveryMissing, setLocalDeliveryMissing] = useState<Record<number, string>>({});
  
  // Unsaved changes protection
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const { data: project } = useQuery<Project>({
    queryKey: ['/api/projects', projectId],
    enabled: !!projectId,
  });

  const { data: report, isLoading: reportLoading, refetch: refetchReport } = useQuery<ReportWithDetails>({
    queryKey: ['/api/reports', reportId],
    enabled: !!reportId,
  });

  const { data: projectTasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
    enabled: !!projectId,
  });

  useEffect(() => {
    if (report?.notes) {
      setNotes(report.notes);
    }
  }, [report?.notes]);

  const isCompleted = report?.status === 'completed';
  
  // Check if there are unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    if (isCompleted) return false;
    // Check if notes have changed
    if (notes !== (report?.notes ?? '')) return true;
    
    // Check local task percentages - compare with actual server values
    for (const [id, percent] of Object.entries(localTaskPercents)) {
      const taskEntry = report?.taskEntries?.find(te => te.id === Number(id));
      if (taskEntry && percent !== taskEntry.percentComplete) return true;
    }
    
    // Check local task comments - compare with actual server values
    for (const [id, comment] of Object.entries(localTaskComments)) {
      const taskEntry = report?.taskEntries?.find(te => te.id === Number(id));
      if (taskEntry && comment !== (taskEntry.comments ?? '')) return true;
    }
    
    // Check local delivery descriptions - compare with actual server values
    for (const [id, description] of Object.entries(localDeliveryDescriptions)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && description !== (delivery.description ?? '')) return true;
    }
    
    // Check local missing items - compare with actual server values
    for (const [id, missingDetails] of Object.entries(localDeliveryMissing)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && missingDetails !== (delivery.missingItemsDetails ?? '')) return true;
    }
    
    return false;
  }, [notes, report?.notes, localTaskPercents, localTaskComments, localDeliveryDescriptions, localDeliveryMissing, isCompleted, report?.taskEntries, report?.deliveryEntries]);
  
  // Warn on browser navigation (back button, close tab, etc.)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
  
  // Handle navigation with confirmation
  const navigateWithCheck = (path: string) => {
    if (hasUnsavedChanges()) {
      setPendingNavigation(path);
      setShowLeaveDialog(true);
    } else {
      setLocation(path);
    }
  };
  
  const handleSaveAndLeave = async () => {
    // Save any pending changes
    const savePromises: Promise<any>[] = [];
    
    // Save notes if changed
    if (notes !== (report?.notes ?? '')) {
      savePromises.push(updateReportMutation.mutateAsync({ notes }));
    }
    
    // Save all pending task percentages
    for (const [id, percent] of Object.entries(localTaskPercents)) {
      const taskEntry = report?.taskEntries?.find(te => te.id === Number(id));
      if (taskEntry && percent !== taskEntry.percentComplete) {
        savePromises.push(updateTaskEntryMutation.mutateAsync({ id: Number(id), data: { percentComplete: percent } }));
      }
    }
    
    // Save all pending task comments
    for (const [id, comment] of Object.entries(localTaskComments)) {
      const taskEntry = report?.taskEntries?.find(te => te.id === Number(id));
      if (taskEntry && comment !== (taskEntry.comments ?? '')) {
        savePromises.push(updateTaskEntryMutation.mutateAsync({ id: Number(id), data: { comments: comment } }));
      }
    }
    
    // Save all pending delivery descriptions
    for (const [id, description] of Object.entries(localDeliveryDescriptions)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && description !== (delivery.description ?? '')) {
        savePromises.push(updateDeliveryMutation.mutateAsync({ id: Number(id), data: { description } }));
      }
    }
    
    // Save all pending missing items details
    for (const [id, missingDetails] of Object.entries(localDeliveryMissing)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && missingDetails !== (delivery.missingItemsDetails ?? '')) {
        savePromises.push(updateDeliveryMutation.mutateAsync({ id: Number(id), data: { missingItemsDetails: missingDetails } }));
      }
    }
    
    // Wait for all saves to complete
    await Promise.all(savePromises);
    
    // Clear local state
    setLocalTaskPercents({});
    setLocalTaskComments({});
    setLocalDeliveryDescriptions({});
    setLocalDeliveryMissing({});
    
    setShowLeaveDialog(false);
    if (pendingNavigation) {
      setLocation(pendingNavigation);
    } else {
      setLocation(`/projects/${projectId}?tab=daily-reports`);
    }
  };
  
  const handleDontSaveAndLeave = () => {
    setShowLeaveDialog(false);
    // Clear local state
    setLocalTaskPercents({});
    setLocalTaskComments({});
    setLocalDeliveryDescriptions({});
    setLocalDeliveryMissing({});
    if (pendingNavigation) {
      setLocation(pendingNavigation);
    } else {
      setLocation(`/projects/${projectId}?tab=daily-reports`);
    }
  };

  const createReportMutation = useMutation({
    mutationFn: async (reportDate: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/reports`, { reportDate });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Report created" });
      setLocation(`/projects/${projectId}/reports/${data.id}`);
    },
    onError: (error: any) => {
      if (error.message?.includes("409")) {
        toast({ title: "A report for this date already exists", variant: "destructive" });
      } else {
        toast({ title: "Failed to create report", variant: "destructive" });
      }
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/reports/${reportId}`, data);
    },
    onSuccess: () => {
      refetchReport();
    },
    onError: (error: any) => {
      if (error.message?.includes("403")) {
        toast({ title: "Cannot edit a completed report", variant: "destructive" });
      } else {
        toast({ title: "Failed to update report", variant: "destructive" });
      }
    },
  });

  const completeReportMutation = useMutation({
    mutationFn: async (data: { signatureType: string; signatureValue: string; completedByName: string }) => {
      return apiRequest("POST", `/api/reports/${reportId}/complete`, data);
    },
    onSuccess: () => {
      toast({ title: "Report completed and signed" });
      setShowSignatureDialog(false);
      refetchReport();
      // Invalidate the reports list so the status updates on the list page
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'reports'] });
      }
    },
    onError: (error: any) => {
      if (error.message?.includes("403")) {
        toast({ title: "Report is already completed", variant: "destructive" });
      } else {
        toast({ title: "Failed to complete report", variant: "destructive" });
      }
    },
  });

  const createTaskEntryMutation = useMutation({
    mutationFn: async (data: { taskId: number; taskTitleSnapshot: string; percentComplete: number }) => {
      return apiRequest("POST", `/api/reports/${reportId}/task-entries`, data);
    },
    onSuccess: () => {
      refetchReport();
      // Also invalidate project tasks to reflect any sync changes
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      setShowAddTaskDialog(false);
      setSelectedTaskId(null);
    },
    onError: () => {
      toast({ title: "Failed to add task", variant: "destructive" });
    },
  });

  const updateTaskEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/daily-report-task-entries/${id}`, data);
    },
    onSuccess: () => {
      refetchReport();
      // Invalidate project tasks so changes sync bi-directionally
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      }
    },
  });

  const deleteTaskEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/daily-report-task-entries/${id}`);
    },
    onSuccess: () => {
      refetchReport();
      setDeleteTaskEntryId(null);
    },
  });

  const createLaborLineMutation = useMutation({
    mutationFn: async ({ taskEntryId, data }: { taskEntryId: number; data: any }) => {
      return apiRequest("POST", `/api/daily-report-task-entries/${taskEntryId}/labor-lines`, data);
    },
    onSuccess: () => refetchReport(),
  });

  const updateLaborLineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/daily-report-labor-lines/${id}`, data);
    },
    onSuccess: () => refetchReport(),
  });

  const deleteLaborLineMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/daily-report-labor-lines/${id}`);
    },
    onSuccess: () => refetchReport(),
  });

  const createEquipmentLineMutation = useMutation({
    mutationFn: async ({ taskEntryId, data }: { taskEntryId: number; data: any }) => {
      return apiRequest("POST", `/api/daily-report-task-entries/${taskEntryId}/equipment-lines`, data);
    },
    onSuccess: () => refetchReport(),
  });

  const updateEquipmentLineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/daily-report-equipment-lines/${id}`, data);
    },
    onSuccess: () => refetchReport(),
  });

  const deleteEquipmentLineMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/daily-report-equipment-lines/${id}`);
    },
    onSuccess: () => refetchReport(),
  });

  const createDeliveryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/reports/${reportId}/delivery-entries`, { vendor: "", allDelivered: true });
    },
    onSuccess: () => refetchReport(),
  });

  const updateDeliveryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/daily-report-delivery-entries/${id}`, data);
    },
    onSuccess: () => refetchReport(),
  });

  const deleteDeliveryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/daily-report-delivery-entries/${id}`);
    },
    onSuccess: () => {
      refetchReport();
      setDeleteDeliveryId(null);
    },
  });

  // Photo mutations
  const createPhotoMutation = useMutation({
    mutationFn: async (data: { taskEntryId?: number; deliveryEntryId?: number; url: string; objectPath?: string; fileName?: string }) => {
      return apiRequest("POST", `/api/daily-report-photos`, data);
    },
    onSuccess: () => refetchReport(),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/daily-report-photos/${id}`);
    },
    onSuccess: () => refetchReport(),
  });

  const handleSaveAndClose = async () => {
    const savePromises: Promise<any>[] = [];
    
    // Save notes if changed
    if (notes !== (report?.notes ?? '')) {
      savePromises.push(updateReportMutation.mutateAsync({ notes }));
    }
    
    // Save all pending task percentages
    for (const [id, percent] of Object.entries(localTaskPercents)) {
      const taskEntry = report?.taskEntries?.find(te => te.id === Number(id));
      if (taskEntry && percent !== taskEntry.percentComplete) {
        savePromises.push(updateTaskEntryMutation.mutateAsync({ id: Number(id), data: { percentComplete: percent } }));
      }
    }
    
    // Save all pending task comments
    for (const [id, comment] of Object.entries(localTaskComments)) {
      const taskEntry = report?.taskEntries?.find(te => te.id === Number(id));
      if (taskEntry && comment !== (taskEntry.comments ?? '')) {
        savePromises.push(updateTaskEntryMutation.mutateAsync({ id: Number(id), data: { comments: comment } }));
      }
    }
    
    // Save all pending delivery descriptions
    for (const [id, description] of Object.entries(localDeliveryDescriptions)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && description !== (delivery.description ?? '')) {
        savePromises.push(updateDeliveryMutation.mutateAsync({ id: Number(id), data: { description } }));
      }
    }
    
    // Save all pending missing items details
    for (const [id, missingDetails] of Object.entries(localDeliveryMissing)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && missingDetails !== (delivery.missingItemsDetails ?? '')) {
        savePromises.push(updateDeliveryMutation.mutateAsync({ id: Number(id), data: { missingItemsDetails: missingDetails } }));
      }
    }
    
    // Wait for all saves to complete
    await Promise.all(savePromises);
    
    // Clear local state
    setLocalTaskPercents({});
    setLocalTaskComments({});
    setLocalDeliveryDescriptions({});
    setLocalDeliveryMissing({});
    
    setLocation(`/projects/${projectId}?tab=daily-reports`);
  };

  const handleCompleteAndSign = () => {
    setShowSignatureDialog(true);
  };

  const handleSignReport = () => {
    if (!signerName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }

    let signatureValue = '';
    if (signatureType === 'freehand') {
      const canvas = canvasRef.current;
      if (canvas) {
        signatureValue = canvas.toDataURL('image/png');
      }
    } else {
      signatureValue = typedSignature;
    }

    if (!signatureValue) {
      toast({ title: "Please provide a signature", variant: "destructive" });
      return;
    }

    completeReportMutation.mutate({
      signatureType,
      signatureValue,
      completedByName: signerName,
    });
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isCompleted) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isCompleted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const toggleTaskExpanded = (taskEntryId: number) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskEntryId)) {
      newExpanded.delete(taskEntryId);
    } else {
      newExpanded.add(taskEntryId);
    }
    setExpandedTasks(newExpanded);
  };

  const handleAddTask = () => {
    if (!selectedTaskId) return;
    const task = projectTasks.find(t => t.id === selectedTaskId);
    if (!task) return;
    createTaskEntryMutation.mutate({
      taskId: task.id,
      taskTitleSnapshot: task.title,
      percentComplete: task.percentComplete || 0,
    });
  };

  // Get uncompleted tasks that haven't been added yet
  const availableTasks = projectTasks.filter(t => 
    t.status !== 'completed' && 
    !report?.taskEntries?.some(te => te.taskId === t.id)
  );

  if (!projectId) {
    return <div className="p-8 text-foreground">Invalid project</div>;
  }

  if (isNewReport) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-card border-b">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setLocation(`/projects/${projectId}?tab=daily-reports`)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-foreground">New Daily Report</h1>
                <p className="text-sm text-muted-foreground">{project?.name}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Create New Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-date">
                  <span className="text-destructive">*</span> Report Date
                </Label>
                <Input
                  id="report-date"
                  type="date"
                  value={newReportDate}
                  onChange={(e) => setNewReportDate(e.target.value)}
                  data-testid="input-new-report-date"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setLocation(`/projects/${projectId}?tab=daily-reports`)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createReportMutation.mutate(newReportDate)}
                  disabled={createReportMutation.isPending}
                  data-testid="button-submit-create-report"
                >
                  {createReportMutation.isPending ? "Creating..." : "Create Report"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (reportLoading || !report) {
    return <div className="p-8 text-foreground">Loading report...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => isCompleted ? setLocation(`/projects/${projectId}?tab=daily-reports`) : navigateWithCheck(`/projects/${projectId}?tab=daily-reports`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground">
                  Daily Report - {safeFormatDate(report.reportDate, 'MMM d, yyyy')}
                </h1>
                {isCompleted && (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" /> Completed
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{project?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-download-pdf"
                >
                  <Download className="h-4 w-4 mr-2" /> Download PDF
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => window.open(`/api/reports/${reportId}/pdf`, "_blank")}
                  data-testid="menu-download-without-photos"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Without Photos
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => window.open(`/api/reports/${reportId}/pdf?includePhotos=true`, "_blank")}
                  data-testid="menu-download-with-photos"
                >
                  <Image className="h-4 w-4 mr-2" />
                  With Photos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isCompleted ? (
              <Button
                variant="outline"
                onClick={() => setLocation(`/projects/${projectId}?tab=daily-reports`)}
                data-testid="button-close-report"
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleSaveAndClose}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 mr-2" /> Save & Close
                </Button>
                <Button
                  onClick={handleCompleteAndSign}
                  data-testid="button-complete-sign"
                >
                  <PenLine className="h-4 w-4 mr-2" /> Complete & Sign
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Weather Section */}
        {report.weatherSummary && (
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <Cloud className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-200">{report.weatherSummary}</p>
                  <div className="flex items-center gap-4 text-sm text-blue-600 dark:text-blue-300">
                    {report.temperature && <span>Temp: {report.temperature}</span>}
                    {report.temperatureHigh && <span>High: {report.temperatureHigh}</span>}
                    {report.temperatureLow && <span>Low: {report.temperatureLow}</span>}
                    {report.windSpeed && <span>Wind: {report.windSpeed}</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Completed Signature Block */}
        {isCompleted && report.signatureValue && (
          <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="py-4">
              <div className="flex items-start gap-4">
                <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="font-medium text-green-800 dark:text-green-200">Report Completed & Signed</p>
                  <p className="text-sm text-green-600 dark:text-green-300">
                    Signed by {report.completedByName} on {report.completedAt ? format(new Date(report.completedAt), "MMM d, yyyy 'at' h:mm a") : 'N/A'}
                  </p>
                  {report.signatureType === 'freehand' && (
                    <img src={report.signatureValue} alt="Signature" className="mt-2 max-h-20 bg-white rounded border p-2" />
                  )}
                  {report.signatureType === 'typed' && (
                    <p className="mt-2 font-signature text-2xl text-green-800 dark:text-green-200 italic">
                      {report.signatureValue}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily Operations Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground">Daily Operations</CardTitle>
            {!isCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddTaskDialog(true)}
                disabled={availableTasks.length === 0}
                data-testid="button-add-task"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Task
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {(!report.taskEntries || report.taskEntries.length === 0) ? (
              <p className="text-muted-foreground text-center py-8">No tasks added yet. Click "Add Task" to get started.</p>
            ) : (
              report.taskEntries.map((taskEntry) => (
                <Card key={taskEntry.id} className="border">
                  <CardHeader 
                    className="cursor-pointer py-3"
                    onClick={() => toggleTaskExpanded(taskEntry.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {expandedTasks.has(taskEntry.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="font-medium text-foreground">{taskEntry.taskTitleSnapshot}</span>
                        <Badge variant="secondary">{taskEntry.percentComplete}%</Badge>
                      </div>
                      {!isCompleted && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTaskEntryId(taskEntry.id);
                          }}
                          data-testid={`button-delete-task-entry-${taskEntry.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  
                  {expandedTasks.has(taskEntry.id) && (
                    <CardContent className="pt-0 space-y-4">
                      {/* Progress Slider */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Label>Progress</Label>
                            {!report.isLatestReport && (
                              <Badge variant="secondary" className="text-xs">
                                Historical snapshot
                              </Badge>
                            )}
                          </div>
                          <Badge variant="outline" className="text-lg font-bold px-3 py-1">
                            {localTaskPercents[taskEntry.id] ?? taskEntry.percentComplete}%
                          </Badge>
                        </div>
                        <Slider
                          value={[localTaskPercents[taskEntry.id] ?? taskEntry.percentComplete]}
                          min={taskEntry.allowedMin ?? 0}
                          max={taskEntry.allowedMax ?? 100}
                          step={5}
                          disabled={isCompleted}
                          className="h-6"
                          onValueChange={(value) => {
                            setLocalTaskPercents(prev => ({ ...prev, [taskEntry.id]: value[0] }));
                          }}
                          data-testid={`slider-percent-${taskEntry.id}`}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{taskEntry.allowedMin ?? 0}%</span>
                          <span>{taskEntry.allowedMax ?? 100}%</span>
                        </div>
                        {!report.isLatestReport && (
                          <p className="text-xs text-muted-foreground italic">
                            Does not update task progress. Allowed range: {taskEntry.allowedMin ?? 0}% - {taskEntry.allowedMax ?? 100}%
                          </p>
                        )}
                      </div>

                      {/* Comments */}
                      <div className="space-y-2">
                        <Label>Comments</Label>
                        <Textarea
                          value={localTaskComments[taskEntry.id] ?? taskEntry.comments ?? ''}
                          disabled={isCompleted}
                          onChange={(e) => {
                            setLocalTaskComments(prev => ({ ...prev, [taskEntry.id]: e.target.value }));
                          }}
                          onBlur={(e) => {
                            const newValue = e.target.value;
                            if (newValue !== (taskEntry.comments ?? '')) {
                              updateTaskEntryMutation.mutate({
                                id: taskEntry.id,
                                data: { comments: newValue },
                              });
                            }
                          }}
                          placeholder="Add comments about this task..."
                          data-testid={`textarea-comments-${taskEntry.id}`}
                        />
                      </div>

                      {/* Labor Lines */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Labor</Label>
                          {!isCompleted && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => createLaborLineMutation.mutate({ taskEntryId: taskEntry.id, data: {} })}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add Labor
                            </Button>
                          )}
                        </div>
                        {taskEntry.laborLines.map((labor) => (
                          <div key={labor.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                            <Select
                              value={labor.laborType}
                              disabled={isCompleted}
                              onValueChange={(value) => updateLaborLineMutation.mutate({ id: labor.id, data: { laborType: value } })}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LABOR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min={1}
                              value={labor.quantity}
                              disabled={isCompleted}
                              onChange={(e) => updateLaborLineMutation.mutate({ id: labor.id, data: { quantity: Number(e.target.value) } })}
                              className="w-20"
                              placeholder="Qty"
                            />
                            <Input
                              type="number"
                              min={0}
                              value={labor.hours}
                              disabled={isCompleted}
                              onChange={(e) => updateLaborLineMutation.mutate({ id: labor.id, data: { hours: Number(e.target.value) } })}
                              className="w-20"
                              placeholder="Hours"
                            />
                            {!isCompleted && (
                              <Button variant="ghost" size="icon" onClick={() => deleteLaborLineMutation.mutate(labor.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Equipment Lines */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Equipment</Label>
                          {!isCompleted && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => createEquipmentLineMutation.mutate({ taskEntryId: taskEntry.id, data: {} })}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add Equipment
                            </Button>
                          )}
                        </div>
                        {taskEntry.equipmentLines.map((equip) => (
                          <div key={equip.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                            <Select
                              value={equip.equipmentType}
                              disabled={isCompleted}
                              onValueChange={(value) => updateEquipmentLineMutation.mutate({ id: equip.id, data: { equipmentType: value } })}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EQUIPMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min={1}
                              value={equip.quantity}
                              disabled={isCompleted}
                              onChange={(e) => updateEquipmentLineMutation.mutate({ id: equip.id, data: { quantity: Number(e.target.value) } })}
                              className="w-20"
                              placeholder="Qty"
                            />
                            <Input
                              type="number"
                              min={0}
                              value={equip.hours}
                              disabled={isCompleted}
                              onChange={(e) => updateEquipmentLineMutation.mutate({ id: equip.id, data: { hours: Number(e.target.value) } })}
                              className="w-20"
                              placeholder="Hours"
                            />
                            {!isCompleted && (
                              <Button variant="ghost" size="icon" onClick={() => deleteEquipmentLineMutation.mutate(equip.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Photos Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Photos</Label>
                          {!isCompleted && (
                            <NativeFileUploader
                              maxNumberOfFiles={5}
                              accept="image/*"
                              onUploadComplete={(uploadedFiles) => {
                                uploadedFiles.forEach((file) => {
                                  createPhotoMutation.mutate({ 
                                    taskEntryId: taskEntry.id, 
                                    url: file.objectPath,
                                    objectPath: file.objectPath,
                                    fileName: file.name,
                                  });
                                });
                              }}
                            >
                              <Camera className="h-3 w-3 mr-1" /> Upload Photos
                            </NativeFileUploader>
                          )}
                        </div>
                        {taskEntry.photos && taskEntry.photos.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {taskEntry.photos.map((photo) => (
                              <div key={photo.id} className="relative group">
                                <img
                                  src={getProxyUrl(photo.url)}
                                  alt={photo.caption || "Task photo"}
                                  className="w-full h-24 object-cover rounded border"
                                />
                                {!isCompleted && (
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => deletePhotoMutation.mutate(photo.id)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {(!taskEntry.photos || taskEntry.photos.length === 0) && (
                          <p className="text-sm text-muted-foreground">No photos uploaded.</p>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </CardContent>
        </Card>

        {/* Deliveries Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Truck className="h-5 w-5" /> Deliveries
            </CardTitle>
            {!isCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => createDeliveryMutation.mutate()}
                data-testid="button-add-delivery"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Delivery
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {(!report.deliveryEntries || report.deliveryEntries.length === 0) ? (
              <p className="text-muted-foreground text-center py-8">No deliveries recorded.</p>
            ) : (
              report.deliveryEntries.map((delivery) => (
                <Card key={delivery.id} className="border">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Vendor</Label>
                          <Input
                            value={delivery.vendor || ''}
                            disabled={isCompleted}
                            onChange={(e) => updateDeliveryMutation.mutate({ id: delivery.id, data: { vendor: e.target.value } })}
                            placeholder="Vendor name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Delivery Time</Label>
                          <Input
                            type="time"
                            value={delivery.deliveryTime || ''}
                            disabled={isCompleted}
                            onChange={(e) => updateDeliveryMutation.mutate({ id: delivery.id, data: { deliveryTime: e.target.value } })}
                          />
                        </div>
                      </div>
                      {!isCompleted && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteDeliveryId(delivery.id)}
                          data-testid={`button-delete-delivery-${delivery.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={localDeliveryDescriptions[delivery.id] ?? delivery.description ?? ''}
                        disabled={isCompleted}
                        onChange={(e) => setLocalDeliveryDescriptions(prev => ({ ...prev, [delivery.id]: e.target.value }))}
                        onBlur={(e) => {
                          const newValue = e.target.value;
                          if (newValue !== (delivery.description ?? '')) {
                            updateDeliveryMutation.mutate({ id: delivery.id, data: { description: newValue } });
                          }
                        }}
                        placeholder="What was delivered?"
                        data-testid={`textarea-delivery-desc-${delivery.id}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Was everything delivered?</Label>
                      <Select
                        value={delivery.allDelivered ? "yes" : "no"}
                        disabled={isCompleted}
                        onValueChange={(value) => updateDeliveryMutation.mutate({ id: delivery.id, data: { allDelivered: value === "yes" } })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {delivery.allDelivered === false && (
                      <div className="space-y-2">
                        <Label className="text-destructive">
                          <span className="text-destructive">*</span> Missing Items Details
                        </Label>
                        <Textarea
                          value={localDeliveryMissing[delivery.id] ?? delivery.missingItemsDetails ?? ''}
                          disabled={isCompleted}
                          onChange={(e) => setLocalDeliveryMissing(prev => ({ ...prev, [delivery.id]: e.target.value }))}
                          onBlur={(e) => {
                            const newValue = e.target.value;
                            if (newValue !== (delivery.missingItemsDetails ?? '')) {
                              updateDeliveryMutation.mutate({ id: delivery.id, data: { missingItemsDetails: newValue } });
                            }
                          }}
                          placeholder="Describe what was missing..."
                          data-testid={`textarea-missing-items-${delivery.id}`}
                        />
                      </div>
                    )}

                    {/* Photos Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Photos</Label>
                        {!isCompleted && (
                          <NativeFileUploader
                            maxNumberOfFiles={5}
                            accept="image/*"
                            onUploadComplete={(uploadedFiles) => {
                              uploadedFiles.forEach((file) => {
                                createPhotoMutation.mutate({ 
                                  deliveryEntryId: delivery.id, 
                                  url: file.objectPath,
                                  objectPath: file.objectPath,
                                  fileName: file.name,
                                });
                              });
                            }}
                          >
                            <Camera className="h-3 w-3 mr-1" /> Upload Photos
                          </NativeFileUploader>
                        )}
                      </div>
                      {delivery.photos && delivery.photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {delivery.photos.map((photo) => (
                            <div key={photo.id} className="relative group">
                              <img
                                src={getProxyUrl(photo.url)}
                                alt={photo.caption || "Delivery photo"}
                                className="w-full h-24 object-cover rounded border"
                              />
                              {!isCompleted && (
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => deletePhotoMutation.mutate(photo.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {(!delivery.photos || delivery.photos.length === 0) && (
                        <p className="text-sm text-muted-foreground">
                          Please upload photos of the delivery slip and delivered items.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>

        {/* Notes Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              disabled={isCompleted}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== report.notes) {
                  updateReportMutation.mutate({ notes });
                }
              }}
              placeholder="Additional notes about today's work..."
              rows={4}
            />
          </CardContent>
        </Card>
      </div>

      {/* Add Task Dialog */}
      <Dialog open={showAddTaskDialog} onOpenChange={setShowAddTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task to Report</DialogTitle>
            <DialogDescription>
              Select a task from the project to add to this report.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedTaskId?.toString() || ''} onValueChange={(v) => setSelectedTaskId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a task..." />
              </SelectTrigger>
              <SelectContent>
                {availableTasks.map(task => (
                  <SelectItem key={task.id} value={task.id.toString()}>
                    {task.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTaskDialog(false)}>Cancel</Button>
            <Button onClick={handleAddTask} disabled={!selectedTaskId || createTaskEntryMutation.isPending}>
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Dialog */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete & Sign Report</DialogTitle>
            <DialogDescription>
              Sign below to complete and lock this report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="signer-name">
                <span className="text-destructive">*</span> Your Name
              </Label>
              <Input
                id="signer-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your name"
                data-testid="input-signer-name"
              />
            </div>
            
            <div className="flex gap-2">
              <Button
                variant={signatureType === 'freehand' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSignatureType('freehand')}
              >
                Freehand
              </Button>
              <Button
                variant={signatureType === 'typed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSignatureType('typed')}
              >
                Typed
              </Button>
            </div>

            {signatureType === 'freehand' ? (
              <div className="space-y-2">
                <Label>Draw your signature</Label>
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={150}
                  className="border rounded bg-white cursor-crosshair w-full"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  data-testid="canvas-signature"
                />
                <Button variant="outline" size="sm" onClick={clearCanvas}>
                  Clear
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Type your signature</Label>
                <Input
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="Type your name as signature"
                  className="font-signature text-xl italic"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignatureDialog(false)}>Cancel</Button>
            <Button onClick={handleSignReport} disabled={completeReportMutation.isPending} data-testid="button-sign-save">
              <PenLine className="h-4 w-4 mr-2" />
              {completeReportMutation.isPending ? "Signing..." : "Complete & Sign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Task Entry Confirmation */}
      <AlertDialog open={!!deleteTaskEntryId} onOpenChange={() => setDeleteTaskEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the task and all associated labor, equipment, and photos from this report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTaskEntryId && deleteTaskEntryMutation.mutate(deleteTaskEntryId)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Delivery Confirmation */}
      <AlertDialog open={!!deleteDeliveryId} onOpenChange={() => setDeleteDeliveryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the delivery and all associated photos from this report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDeliveryId && deleteDeliveryMutation.mutate(deleteDeliveryId)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Leave Confirmation Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button variant="outline" onClick={handleDontSaveAndLeave} className="w-full sm:w-auto">
              Don't Save
            </Button>
            <Button onClick={handleSaveAndLeave} className="w-full sm:w-auto" data-testid="button-save-and-exit">
              Save and Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
