import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { ArrowLeft, Save, Plus, Trash2, Cloud, Truck, ChevronDown, ChevronUp, CheckCircle, PenLine, Download, Camera, X, Image, Clock, Users, AlertTriangle, ClipboardList, StickyNote, ImagePlus } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { NativeFileUploader } from "@/components/NativeFileUploader";
import { TimePicker } from "@/components/ui/time-picker";
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
  employeeId: number | null;
  employeeName: string | null;
}

interface ProjectEmployee {
  employeeId: number;
  employeeName: string;
  totalHours: number;
  hasOpenShift: boolean;
  shifts: Array<{ punchIn: string; punchOut: string | null; hours: number | null; jobCode: string | null }>;
  jobCode: string | null;
  jobDescription: string | null;
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

interface InspectionEntry {
  id: number;
  reportId: number;
  inspectionType: string;
  inspectionAuthority: string;
  inspectorName: string | null;
  passed: boolean | null;
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
  inspectionEntries: InspectionEntry[];
  reportPhotos: Photo[];
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
  const { user } = useAuth();
  const [newReportDate, setNewReportDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [deleteTaskEntryId, setDeleteTaskEntryId] = useState<number | null>(null);
  const [deleteDeliveryId, setDeleteDeliveryId] = useState<number | null>(null);
  const [deleteInspectionId, setDeleteInspectionId] = useState<number | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signatureType, setSignatureType] = useState<'freehand' | 'typed'>('freehand');
  const [typedSignature, setTypedSignature] = useState('');
  const [signerName, setSignerName] = useState('');
  const [notes, setNotes] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [showAddEntryDialog, setShowAddEntryDialog] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showReportPhotoUploader, setShowReportPhotoUploader] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  
  // Local state for text fields to improve performance (debounced sync)
  const [localTaskComments, setLocalTaskComments] = useState<Record<number, string>>({});
  const [localTaskPercents, setLocalTaskPercents] = useState<Record<number, number>>({});
  const [localDeliveryDescriptions, setLocalDeliveryDescriptions] = useState<Record<number, string>>({});
  const [localDeliveryMissing, setLocalDeliveryMissing] = useState<Record<number, string>>({});
  const [localLaborQuantities, setLocalLaborQuantities] = useState<Record<number, string>>({});
  const [localLaborHours, setLocalLaborHours] = useState<Record<number, string>>({});
  const [localEquipmentQuantities, setLocalEquipmentQuantities] = useState<Record<number, string>>({});
  const [localEquipmentHours, setLocalEquipmentHours] = useState<Record<number, string>>({});
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<number>>(new Set());
  const [expandedInspections, setExpandedInspections] = useState<Set<number>>(new Set());
  const [localDeliveryVendors, setLocalDeliveryVendors] = useState<Record<number, string>>({});
  
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

  const reportDate = report?.reportDate || newReportDate;
  const { data: projectEmployees = [], isLoading: employeesLoading } = useQuery<ProjectEmployee[]>({
    queryKey: ['/api/daily-reports/project-employees', projectId, reportDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/daily-reports/project-employees?projectId=${projectId}&date=${reportDate}`);
      return res.json();
    },
    enabled: !!projectId && !!reportDate,
  });

  const getEffectiveHours = useCallback((laborLine: LaborLine): number => {
    const localVal = localLaborHours[laborLine.id];
    const hrs = localVal !== undefined ? Number(localVal) : Number(laborLine.hours || 0);
    return isNaN(hrs) ? 0 : hrs;
  }, [localLaborHours]);

  const employeeAllocatedHours = useMemo(() => {
    if (!report?.taskEntries) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const entry of report.taskEntries) {
      for (const labor of entry.laborLines) {
        if (labor.employeeId) {
          const current = map.get(labor.employeeId) || 0;
          map.set(labor.employeeId, Math.round((current + getEffectiveHours(labor)) * 100) / 100);
        }
      }
    }
    return map;
  }, [report?.taskEntries, getEffectiveHours]);

  const getEmployeeRemainingHours = useCallback((employeeId: number, excludeLaborLineId?: number) => {
    const employee = projectEmployees.find(e => e.employeeId === employeeId);
    if (!employee) return 0;
    let totalAllocated = employeeAllocatedHours.get(employeeId) || 0;
    if (excludeLaborLineId) {
      const line = report?.taskEntries?.flatMap(te => te.laborLines).find(l => l.id === excludeLaborLineId);
      if (line) {
        totalAllocated = Math.round((totalAllocated - getEffectiveHours(line)) * 100) / 100;
      }
    }
    return Math.max(0, Math.round((employee.totalHours - totalAllocated) * 100) / 100);
  }, [projectEmployees, employeeAllocatedHours, report?.taskEntries, getEffectiveHours]);

  useEffect(() => {
    if (report?.notes) {
      setNotes(report.notes);
      setShowNotes(true);
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
    
    // Check local labor quantities
    for (const [id, qty] of Object.entries(localLaborQuantities)) {
      const laborLine = report?.taskEntries?.flatMap(te => te.laborLines).find(l => l.id === Number(id));
      if (laborLine && qty !== String(laborLine.quantity)) return true;
    }
    
    // Check local labor hours
    for (const [id, hrs] of Object.entries(localLaborHours)) {
      const laborLine = report?.taskEntries?.flatMap(te => te.laborLines).find(l => l.id === Number(id));
      if (laborLine && hrs !== String(laborLine.hours)) return true;
    }
    
    // Check local equipment quantities
    for (const [id, qty] of Object.entries(localEquipmentQuantities)) {
      const equipLine = report?.taskEntries?.flatMap(te => te.equipmentLines).find(e => e.id === Number(id));
      if (equipLine && qty !== String(equipLine.quantity)) return true;
    }
    
    // Check local equipment hours
    for (const [id, hrs] of Object.entries(localEquipmentHours)) {
      const equipLine = report?.taskEntries?.flatMap(te => te.equipmentLines).find(e => e.id === Number(id));
      if (equipLine && hrs !== String(equipLine.hours)) return true;
    }
    
    // Check local delivery vendors
    for (const [id, vendor] of Object.entries(localDeliveryVendors)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && vendor !== (delivery.vendor ?? '')) return true;
    }
    
    return false;
  }, [notes, report?.notes, localTaskPercents, localTaskComments, localDeliveryDescriptions, localDeliveryMissing, localLaborQuantities, localLaborHours, localEquipmentQuantities, localEquipmentHours, localDeliveryVendors, isCompleted, report?.taskEntries, report?.deliveryEntries]);
  
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
    if (!checkDeliveryMissingItems()) return;
    
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
    
    for (const [id, qty] of Object.entries(localLaborQuantities)) {
      const qtyNum = Number(qty);
      if (!isNaN(qtyNum) && qtyNum > 0) {
        savePromises.push(updateLaborLineMutation.mutateAsync({ id: Number(id), data: { quantity: qtyNum } }));
      }
    }
    for (const [id, hrs] of Object.entries(localLaborHours)) {
      const hrsNum = Number(hrs);
      if (!isNaN(hrsNum) && hrsNum >= 0) {
        savePromises.push(updateLaborLineMutation.mutateAsync({ id: Number(id), data: { hours: hrsNum } }));
      }
    }
    for (const [id, qty] of Object.entries(localEquipmentQuantities)) {
      const qtyNum = Number(qty);
      if (!isNaN(qtyNum) && qtyNum > 0) {
        savePromises.push(updateEquipmentLineMutation.mutateAsync({ id: Number(id), data: { quantity: qtyNum } }));
      }
    }
    for (const [id, hrs] of Object.entries(localEquipmentHours)) {
      const hrsNum = Number(hrs);
      if (!isNaN(hrsNum) && hrsNum >= 0) {
        savePromises.push(updateEquipmentLineMutation.mutateAsync({ id: Number(id), data: { hours: hrsNum } }));
      }
    }
    for (const [id, vendor] of Object.entries(localDeliveryVendors)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && vendor !== (delivery.vendor ?? '')) {
        savePromises.push(updateDeliveryMutation.mutateAsync({ id: Number(id), data: { vendor } }));
      }
    }
    
    // Wait for all saves to complete
    await Promise.all(savePromises);
    
    // Clear local state
    setLocalTaskPercents({});
    setLocalTaskComments({});
    setLocalDeliveryDescriptions({});
    setLocalDeliveryMissing({});
    setLocalLaborQuantities({});
    setLocalLaborHours({});
    setLocalEquipmentQuantities({});
    setLocalEquipmentHours({});
    setLocalDeliveryVendors({});
    
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
    setLocalLaborQuantities({});
    setLocalLaborHours({});
    setLocalEquipmentQuantities({});
    setLocalEquipmentHours({});
    setLocalDeliveryVendors({});
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

  // Inspection mutations
  const createInspectionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/reports/${reportId}/inspection-entries`, { inspectionType: "", inspectionAuthority: "", passed: null });
    },
    onSuccess: () => refetchReport(),
  });

  const updateInspectionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/daily-report-inspection-entries/${id}`, data);
    },
    onSuccess: () => refetchReport(),
  });

  const deleteInspectionMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/daily-report-inspection-entries/${id}`);
    },
    onSuccess: () => {
      refetchReport();
      setDeleteInspectionId(null);
    },
  });

  // Photo mutations
  const createPhotoMutation = useMutation({
    mutationFn: async (data: { taskEntryId?: number; deliveryEntryId?: number; inspectionEntryId?: number; url: string; cloudinaryPublicId?: string; cloudinaryUrl?: string; fileName?: string; takenAt?: string }) => {
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

  const checkDeliveryMissingItems = (): boolean => {
    const deliveries = report?.deliveryEntries;
    if (!deliveries) return true;
    for (const d of deliveries) {
      if (d.allDelivered === false) {
        const missing = (localDeliveryMissing[d.id] ?? d.missingItemsDetails ?? '').trim();
        if (!missing) {
          toast({ title: "Please describe what was missing for all incomplete deliveries", variant: "destructive" });
          return false;
        }
      }
    }
    return true;
  };

  const handleSaveAndClose = async () => {
    if (!checkDeliveryMissingItems()) return;
    
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
    
    for (const [id, qty] of Object.entries(localLaborQuantities)) {
      const qtyNum = Number(qty);
      if (!isNaN(qtyNum) && qtyNum > 0) {
        savePromises.push(updateLaborLineMutation.mutateAsync({ id: Number(id), data: { quantity: qtyNum } }));
      }
    }
    for (const [id, hrs] of Object.entries(localLaborHours)) {
      const hrsNum = Number(hrs);
      if (!isNaN(hrsNum) && hrsNum >= 0) {
        savePromises.push(updateLaborLineMutation.mutateAsync({ id: Number(id), data: { hours: hrsNum } }));
      }
    }
    for (const [id, qty] of Object.entries(localEquipmentQuantities)) {
      const qtyNum = Number(qty);
      if (!isNaN(qtyNum) && qtyNum > 0) {
        savePromises.push(updateEquipmentLineMutation.mutateAsync({ id: Number(id), data: { quantity: qtyNum } }));
      }
    }
    for (const [id, hrs] of Object.entries(localEquipmentHours)) {
      const hrsNum = Number(hrs);
      if (!isNaN(hrsNum) && hrsNum >= 0) {
        savePromises.push(updateEquipmentLineMutation.mutateAsync({ id: Number(id), data: { hours: hrsNum } }));
      }
    }
    for (const [id, vendor] of Object.entries(localDeliveryVendors)) {
      const delivery = report?.deliveryEntries?.find(d => d.id === Number(id));
      if (delivery && vendor !== (delivery.vendor ?? '')) {
        savePromises.push(updateDeliveryMutation.mutateAsync({ id: Number(id), data: { vendor } }));
      }
    }
    
    // Wait for all saves to complete
    await Promise.all(savePromises);
    
    // Clear local state
    setLocalTaskPercents({});
    setLocalTaskComments({});
    setLocalDeliveryDescriptions({});
    setLocalDeliveryMissing({});
    setLocalLaborQuantities({});
    setLocalLaborHours({});
    setLocalEquipmentQuantities({});
    setLocalEquipmentHours({});
    setLocalDeliveryVendors({});
    
    setLocation(`/projects/${projectId}?tab=daily-reports`);
  };

  const handleCompleteAndSign = () => {
    if (user) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      setSignerName(fullName || user.email || '');
    }
    setShowSignatureDialog(true);
  };

  const handleSignReport = () => {
    if (!signerName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }

    if (!checkDeliveryMissingItems()) return;

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

  const toggleDeliveryExpanded = (deliveryId: number) => {
    const newExpanded = new Set(expandedDeliveries);
    if (newExpanded.has(deliveryId)) {
      newExpanded.delete(deliveryId);
    } else {
      newExpanded.add(deliveryId);
    }
    setExpandedDeliveries(newExpanded);
  };

  const toggleInspectionExpanded = (inspectionId: number) => {
    const newExpanded = new Set(expandedInspections);
    if (newExpanded.has(inspectionId)) {
      newExpanded.delete(inspectionId);
    } else {
      newExpanded.add(inspectionId);
    }
    setExpandedInspections(newExpanded);
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
                  max={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setNewReportDate(e.target.value)}
                  data-testid="input-new-report-date"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setLocation(`/projects/${projectId}?tab=daily-reports`)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (newReportDate > format(new Date(), "yyyy-MM-dd")) {
                      toast({ title: "Cannot create reports for future dates", variant: "destructive" });
                      return;
                    }
                    createReportMutation.mutate(newReportDate);
                  }}
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
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 bg-card border-b z-50">
        <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-4 md:py-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={() => isCompleted ? setLocation(`/projects/${projectId}?tab=daily-reports`) : navigateWithCheck(`/projects/${projectId}?tab=daily-reports`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base md:text-lg font-semibold text-foreground truncate">
                  Daily Report - {safeFormatDate(report.reportDate, 'MMM d, yyyy')}
                </h1>
                {isCompleted && (
                  <Badge variant="default" className="bg-green-600 shrink-0">
                    <CheckCircle className="h-3 w-3 mr-1" /> Completed
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{project?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-4 inline-flex items-center justify-center gap-2"
                  data-testid="button-download-pdf"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Download PDF</span>
                  <ChevronDown className="h-3 w-3 hidden sm:inline" />
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
                className="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-4 inline-flex items-center justify-center gap-2"
                onClick={() => setLocation(`/projects/${projectId}?tab=daily-reports`)}
                data-testid="button-close-report"
              >
                <X className="h-4 w-4 shrink-0 sm:hidden" />
                <span className="hidden sm:inline">Close</span>
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-4 inline-flex items-center justify-center gap-2"
                  onClick={handleSaveAndClose}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Save & Close</span>
                </Button>
                <Button
                  className="h-11 w-11 p-0 sm:h-9 sm:w-auto sm:px-4 inline-flex items-center justify-center gap-2"
                  onClick={handleCompleteAndSign}
                  data-testid="button-complete-sign"
                >
                  <PenLine className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Complete & Sign</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content - with padding for fixed header */}
      <div className="pt-[52px] md:pt-[52px]">
        <div className="max-w-4xl mx-auto p-3 md:p-6 space-y-4">
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

        {/* Add Entry Button */}
        {!isCompleted && (
          <div className="flex justify-center">
            <Button
              onClick={() => setShowAddEntryDialog(true)}
              data-testid="button-add-entry"
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Add Entry
            </Button>
          </div>
        )}

        {/* Tasks Section - only show header when tasks exist */}
        {report.taskEntries && report.taskEntries.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide" data-testid="section-header-tasks">Tasks</h3>
            {report.taskEntries.map((taskEntry) => (
              <Card key={taskEntry.id}>
                <div 
                  className="cursor-pointer px-4 py-3"
                  onClick={() => toggleTaskExpanded(taskEntry.id)}
                  data-testid={`task-entry-header-${taskEntry.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {expandedTasks.has(taskEntry.id) ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                      <span className="font-medium text-foreground truncate">{taskEntry.taskTitleSnapshot}</span>
                      <Badge variant="secondary">{localTaskPercents[taskEntry.id] ?? taskEntry.percentComplete}%</Badge>
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
                </div>
                
                {expandedTasks.has(taskEntry.id) && (
                  <div className="px-4 pb-4 space-y-4">
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
                        onValueCommit={(value) => {
                          const newPercent = value[0];
                          if (newPercent !== taskEntry.percentComplete) {
                            updateTaskEntryMutation.mutate({
                              id: taskEntry.id,
                              data: { percentComplete: newPercent },
                            });
                          }
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

                    {/* Labor - Employee Time Tracking */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <Label className="flex items-center gap-1">
                          <Users className="h-4 w-4" /> Labor
                        </Label>
                        {!isCompleted && projectEmployees.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" data-testid={`button-add-employee-${taskEntry.id}`}>
                                <Plus className="h-3 w-3 mr-1" /> Add Employee
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {projectEmployees
                                .filter(emp => !taskEntry.laborLines.some(l => l.employeeId === emp.employeeId))
                                .map(emp => {
                                  const remaining = getEmployeeRemainingHours(emp.employeeId);
                                  return (
                                    <DropdownMenuItem
                                      key={emp.employeeId}
                                      disabled={remaining <= 0}
                                      onClick={() => createLaborLineMutation.mutate({
                                        taskEntryId: taskEntry.id,
                                        data: {
                                          laborType: 'Laborer',
                                          quantity: 1,
                                          hours: 0,
                                          employeeId: emp.employeeId,
                                          employeeName: emp.employeeName,
                                        },
                                      })}
                                      data-testid={`menu-add-employee-${emp.employeeId}`}
                                    >
                                      <span className="flex-1">{emp.employeeName}</span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        {remaining > 0 ? `${remaining}h avail` : 'fully allocated'}
                                      </span>
                                    </DropdownMenuItem>
                                  );
                                })}
                              {projectEmployees.filter(emp => !taskEntry.laborLines.some(l => l.employeeId === emp.employeeId)).length === 0 && (
                                <DropdownMenuItem disabled>All employees already added</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {projectEmployees.length === 0 && !employeesLoading && (
                        <p className="text-xs text-muted-foreground italic">
                          No employees punched in for this project on this date. Sync time data from the Employees page or map a Fingercheck job to this project.
                        </p>
                      )}
                      {employeesLoading && (
                        <p className="text-xs text-muted-foreground italic">Loading time tracking data...</p>
                      )}
                      {taskEntry.laborLines.map((labor) => {
                        const employee = projectEmployees.find(e => e.employeeId === labor.employeeId);
                        const remaining = labor.employeeId ? getEmployeeRemainingHours(labor.employeeId, labor.id) : null;
                        const localHrs = localLaborHours[labor.id];
                        const currentHours = localHrs !== undefined ? Number(localHrs) : Number(labor.hours);
                        const isOverAllocated = remaining !== null && currentHours > remaining;

                        return (
                          <div key={labor.id} className="space-y-2 p-3 bg-muted rounded" data-testid={`labor-line-${labor.id}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm truncate" data-testid={`text-employee-name-${labor.id}`}>
                                    {labor.employeeName || 'Unknown Employee'}
                                  </span>
                                  {employee?.hasOpenShift && (
                                    <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
                                      <Clock className="h-3 w-3 mr-1" /> Still on site
                                    </Badge>
                                  )}
                                </div>
                                {employee && (
                                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                                    <span>Tracked: {employee.totalHours}h</span>
                                    <span>Remaining: {remaining !== null ? `${remaining}h` : 'N/A'}</span>
                                  </div>
                                )}
                              </div>
                              {!isCompleted && (
                                <Button variant="ghost" size="icon" onClick={() => deleteLaborLineMutation.mutate(labor.id)} data-testid={`button-delete-labor-${labor.id}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Role</Label>
                                <Select
                                  value={labor.laborType}
                                  disabled={isCompleted}
                                  onValueChange={(value) => updateLaborLineMutation.mutate({ id: labor.id, data: { laborType: value } })}
                                >
                                  <SelectTrigger data-testid={`select-labor-type-${labor.id}`}>
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {LABOR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Hours on Task</Label>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  max={remaining !== null ? remaining : undefined}
                                  step="0.25"
                                  value={localLaborHours[labor.id] ?? (labor.hours === 0 ? '' : String(labor.hours))}
                                  disabled={isCompleted}
                                  className={isOverAllocated ? 'border-destructive' : ''}
                                  onChange={(e) => setLocalLaborHours(prev => ({ ...prev, [labor.id]: e.target.value }))}
                                  onBlur={(e) => {
                                    const val = Number(e.target.value);
                                    if (!isNaN(val) && val >= 0 && val !== labor.hours) {
                                      if (remaining !== null && val > remaining) {
                                        toast({
                                          title: "Hours exceed available time",
                                          description: `${labor.employeeName} only has ${remaining}h remaining across all tasks.`,
                                          variant: "destructive",
                                        });
                                        return;
                                      }
                                      updateLaborLineMutation.mutate({ id: labor.id, data: { hours: val } });
                                    }
                                  }}
                                  placeholder="0"
                                  data-testid={`input-labor-hours-${labor.id}`}
                                />
                                {isOverAllocated && (
                                  <p className="text-xs text-destructive flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Exceeds available {remaining}h
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {taskEntry.laborLines.length > 0 && (
                        <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground pt-1 border-t">
                          <span>Workers: <strong className="text-foreground">{taskEntry.laborLines.length}</strong></span>
                          <span>Total Hours: <strong className="text-foreground">{taskEntry.laborLines.reduce((sum, l) => sum + (Number(localLaborHours[l.id]) || Number(l.hours)), 0).toFixed(2)}</strong></span>
                        </div>
                      )}
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
                        <div key={equip.id} className="space-y-2 p-3 bg-muted rounded">
                          <div className="flex items-center justify-between gap-2">
                            <Select
                              value={equip.equipmentType}
                              disabled={isCompleted}
                              onValueChange={(value) => updateEquipmentLineMutation.mutate({ id: equip.id, data: { equipmentType: value } })}
                            >
                              <SelectTrigger className="flex-1" data-testid={`select-equipment-type-${equip.id}`}>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {EQUIPMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {!isCompleted && (
                              <Button variant="ghost" size="icon" onClick={() => deleteEquipmentLineMutation.mutate(equip.id)} data-testid={`button-delete-equipment-${equip.id}`}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground"># of Units</Label>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={localEquipmentQuantities[equip.id] ?? (equip.quantity === 0 ? '' : String(equip.quantity))}
                                disabled={isCompleted}
                                onChange={(e) => setLocalEquipmentQuantities(prev => ({ ...prev, [equip.id]: e.target.value }))}
                                onBlur={(e) => {
                                  const val = Number(e.target.value);
                                  if (!isNaN(val) && val > 0 && val !== equip.quantity) {
                                    updateEquipmentLineMutation.mutate({ id: equip.id, data: { quantity: val } });
                                  }
                                }}
                                placeholder="0"
                                data-testid={`input-equipment-qty-${equip.id}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Hours</Label>
                              <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.5"
                                value={localEquipmentHours[equip.id] ?? (equip.hours === 0 ? '' : String(equip.hours))}
                                disabled={isCompleted}
                                onChange={(e) => setLocalEquipmentHours(prev => ({ ...prev, [equip.id]: e.target.value }))}
                                onBlur={(e) => {
                                  const val = Number(e.target.value);
                                  if (!isNaN(val) && val >= 0 && val !== equip.hours) {
                                    updateEquipmentLineMutation.mutate({ id: equip.id, data: { hours: val } });
                                  }
                                }}
                                placeholder="0"
                                data-testid={`input-equipment-hours-${equip.id}`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {taskEntry.equipmentLines.length > 0 && (
                        <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground pt-1 border-t">
                          <span>Total Units: <strong className="text-foreground">{taskEntry.equipmentLines.reduce((sum, e) => sum + (Number(localEquipmentQuantities[e.id]) || e.quantity), 0)}</strong></span>
                          <span>Total Hours: <strong className="text-foreground">{taskEntry.equipmentLines.reduce((sum, e) => sum + (Number(localEquipmentHours[e.id]) || e.hours), 0)}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Photos Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Photos</Label>
                        {!isCompleted && (
                          <NativeFileUploader
                            maxNumberOfFiles={50}
                            accept="image/*"
                            onUploadComplete={(uploadedFiles) => {
                              uploadedFiles.forEach((file) => {
                                createPhotoMutation.mutate({ 
                                  taskEntryId: taskEntry.id, 
                                  url: file.cloudinaryUrl,
                                  cloudinaryPublicId: file.cloudinaryPublicId,
                                  cloudinaryUrl: file.cloudinaryUrl,
                                  fileName: file.name,
                                  takenAt: file.takenAt?.toISOString(),
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
                                  className="absolute top-1 right-1 h-6 w-6 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
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

                    {/* Collapse Button at Bottom */}
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTaskExpanded(taskEntry.id)}
                        data-testid={`button-collapse-task-${taskEntry.id}`}
                        className="text-muted-foreground"
                      >
                        <ChevronUp className="h-4 w-4 mr-1" /> Collapse
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Deliveries Section - only show header when deliveries exist */}
        {report.deliveryEntries && report.deliveryEntries.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide" data-testid="section-header-deliveries">Deliveries</h3>
            {report.deliveryEntries.map((delivery) => (
              <Card key={delivery.id}>
                <div 
                  className="cursor-pointer px-4 py-3"
                  onClick={() => toggleDeliveryExpanded(delivery.id)}
                  data-testid={`delivery-entry-header-${delivery.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {expandedDeliveries.has(delivery.id) ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                      <span className="font-medium text-foreground truncate">{(localDeliveryVendors[delivery.id] ?? delivery.vendor) || 'New Delivery'}</span>
                      {delivery.deliveryTime && <Badge variant="secondary">{delivery.deliveryTime}</Badge>}
                    </div>
                    {!isCompleted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDeliveryId(delivery.id);
                        }}
                        data-testid={`button-delete-delivery-${delivery.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                {expandedDeliveries.has(delivery.id) && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Vendor</Label>
                        <Input
                          value={localDeliveryVendors[delivery.id] ?? delivery.vendor ?? ''}
                          disabled={isCompleted}
                          onChange={(e) => setLocalDeliveryVendors(prev => ({ ...prev, [delivery.id]: e.target.value }))}
                          onBlur={(e) => {
                            const newValue = e.target.value;
                            if (newValue !== (delivery.vendor ?? '')) {
                              updateDeliveryMutation.mutate({ id: delivery.id, data: { vendor: newValue } });
                            }
                          }}
                          placeholder="Vendor name"
                          data-testid={`input-vendor-${delivery.id}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Delivery Time</Label>
                        <TimePicker
                          value={delivery.deliveryTime || ''}
                          disabled={isCompleted}
                          onChange={(value) => updateDeliveryMutation.mutate({ id: delivery.id, data: { deliveryTime: value } })}
                        />
                      </div>
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
                            maxNumberOfFiles={50}
                            accept="image/*"
                            onUploadComplete={(uploadedFiles) => {
                              uploadedFiles.forEach((file) => {
                                createPhotoMutation.mutate({ 
                                  deliveryEntryId: delivery.id, 
                                  url: file.cloudinaryUrl,
                                  cloudinaryPublicId: file.cloudinaryPublicId,
                                  cloudinaryUrl: file.cloudinaryUrl,
                                  fileName: file.name,
                                  takenAt: file.takenAt?.toISOString(),
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
                                  className="absolute top-1 right-1 h-6 w-6 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
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

                    {/* Collapse Button at Bottom */}
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleDeliveryExpanded(delivery.id)}
                        data-testid={`button-collapse-delivery-${delivery.id}`}
                        className="text-muted-foreground"
                      >
                        <ChevronUp className="h-4 w-4 mr-1" /> Collapse
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Inspections Section - only show when inspections exist */}
        {report.inspectionEntries && report.inspectionEntries.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide" data-testid="section-header-inspections">Inspections</h3>
            {report.inspectionEntries.map((inspection) => (
              <Card key={inspection.id}>
                <div 
                  className="cursor-pointer px-4 py-3"
                  onClick={() => toggleInspectionExpanded(inspection.id)}
                  data-testid={`inspection-entry-header-${inspection.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {expandedInspections.has(inspection.id) ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                      <span className="font-medium text-foreground truncate">{inspection.inspectionType || 'New Inspection'}</span>
                      <Badge variant={inspection.passed === true ? "default" : inspection.passed === false ? "destructive" : "secondary"}>
                        {inspection.passed === true ? "Passed" : inspection.passed === false ? "Failed" : "Pending"}
                      </Badge>
                    </div>
                    {!isCompleted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteInspectionId(inspection.id);
                        }}
                        data-testid={`button-delete-inspection-${inspection.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                {expandedInspections.has(inspection.id) && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Inspection Type</Label>
                        <Select
                          value={inspection.inspectionType || '__custom__'}
                          disabled={isCompleted}
                          onValueChange={(value) => {
                            if (value === '__custom__') {
                              const custom = prompt("Enter custom inspection type:");
                              if (custom) updateInspectionMutation.mutate({ id: inspection.id, data: { inspectionType: custom } });
                            } else {
                              updateInspectionMutation.mutate({ id: inspection.id, data: { inspectionType: value } });
                            }
                          }}
                        >
                          <SelectTrigger data-testid={`select-inspection-type-${inspection.id}`}>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sewer removal">Sewer removal</SelectItem>
                            <SelectItem value="Demo">Demo</SelectItem>
                            <SelectItem value="Recharge">Recharge</SelectItem>
                            {inspection.inspectionType && !["Sewer removal", "Demo", "Recharge"].includes(inspection.inspectionType) && (
                              <SelectItem value={inspection.inspectionType}>{inspection.inspectionType}</SelectItem>
                            )}
                            <SelectItem value="__custom__">+ Add custom type...</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Inspection Authority</Label>
                        <Select
                          value={inspection.inspectionAuthority || '__custom__'}
                          disabled={isCompleted}
                          onValueChange={(value) => {
                            if (value === '__custom__') {
                              const custom = prompt("Enter custom authority:");
                              if (custom) updateInspectionMutation.mutate({ id: inspection.id, data: { inspectionAuthority: custom } });
                            } else {
                              updateInspectionMutation.mutate({ id: inspection.id, data: { inspectionAuthority: value } });
                            }
                          }}
                        >
                          <SelectTrigger data-testid={`select-inspection-authority-${inspection.id}`}>
                            <SelectValue placeholder="Select authority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Lakewood Township">Lakewood Township</SelectItem>
                            <SelectItem value="Lakewood MUA">Lakewood MUA</SelectItem>
                            {inspection.inspectionAuthority && !["Lakewood Township", "Lakewood MUA"].includes(inspection.inspectionAuthority) && (
                              <SelectItem value={inspection.inspectionAuthority}>{inspection.inspectionAuthority}</SelectItem>
                            )}
                            <SelectItem value="__custom__">+ Add custom authority...</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Inspector Name</Label>
                        <Input
                          defaultValue={inspection.inspectorName ?? ''}
                          key={`inspector-name-${inspection.id}-${inspection.inspectorName}`}
                          disabled={isCompleted}
                          onBlur={(e) => {
                            const newValue = e.target.value;
                            if (newValue !== (inspection.inspectorName ?? '')) {
                              updateInspectionMutation.mutate({ id: inspection.id, data: { inspectorName: newValue } });
                            }
                          }}
                          placeholder="Inspector name"
                          data-testid={`input-inspector-name-${inspection.id}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Result</Label>
                        <Select
                          value={inspection.passed === true ? "passed" : inspection.passed === false ? "failed" : "pending"}
                          disabled={isCompleted}
                          onValueChange={(value) => updateInspectionMutation.mutate({ id: inspection.id, data: { passed: value === "passed" ? true : value === "failed" ? false : null } })}
                        >
                          <SelectTrigger data-testid={`select-inspection-result-${inspection.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="passed">Passed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Photos Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Photos</Label>
                        {!isCompleted && (
                          <NativeFileUploader
                            maxNumberOfFiles={50}
                            accept="image/*"
                            onUploadComplete={(uploadedFiles) => {
                              uploadedFiles.forEach((file) => {
                                createPhotoMutation.mutate({ 
                                  inspectionEntryId: inspection.id, 
                                  url: file.cloudinaryUrl,
                                  cloudinaryPublicId: file.cloudinaryPublicId,
                                  cloudinaryUrl: file.cloudinaryUrl,
                                  fileName: file.name,
                                  takenAt: file.takenAt?.toISOString(),
                                });
                              });
                            }}
                          >
                            <Camera className="h-3 w-3 mr-1" /> Upload Photos
                          </NativeFileUploader>
                        )}
                      </div>
                      {inspection.photos && inspection.photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {inspection.photos.map((photo) => (
                            <div key={photo.id} className="relative group">
                              <img
                                src={getProxyUrl(photo.url)}
                                alt={photo.caption || "Inspection photo"}
                                className="w-full h-24 object-cover rounded border"
                              />
                              {!isCompleted && (
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  className="absolute top-1 right-1 h-6 w-6 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                  onClick={() => deletePhotoMutation.mutate(photo.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Collapse Button at Bottom */}
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleInspectionExpanded(inspection.id)}
                        data-testid={`button-collapse-inspection-${inspection.id}`}
                        className="text-muted-foreground"
                      >
                        <ChevronUp className="h-4 w-4 mr-1" /> Collapse
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Report-Level Photos Section - only show when photos exist */}
        {report.reportPhotos && report.reportPhotos.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide" data-testid="section-header-photos">Photos</h3>
            <div className="grid grid-cols-3 gap-2">
              {report.reportPhotos.map((photo) => (
                <div key={photo.id} className="relative group">
                  <img
                    src={getProxyUrl(photo.url)}
                    alt={photo.caption || "Report photo"}
                    className="w-full h-24 object-cover rounded border"
                    data-testid={`report-photo-${photo.id}`}
                  />
                  {!isCompleted && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      onClick={() => deletePhotoMutation.mutate(photo.id)}
                      data-testid={`button-delete-report-photo-${photo.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {!isCompleted && (
              <NativeFileUploader
                maxNumberOfFiles={50}
                accept="image/*"
                onUploadComplete={(uploadedFiles) => {
                  uploadedFiles.forEach((file) => {
                    createPhotoMutation.mutate({ 
                      reportId: report.id,
                      url: file.cloudinaryUrl,
                      cloudinaryPublicId: file.cloudinaryPublicId,
                      cloudinaryUrl: file.cloudinaryUrl,
                      fileName: file.name,
                      takenAt: file.takenAt?.toISOString(),
                    });
                  });
                }}
              >
                <Plus className="h-3 w-3 mr-1" /> Add More Photos
              </NativeFileUploader>
            )}
          </div>
        )}

        {/* Notes Section - show when notes exist, user toggled via Add Entry, or report is completed */}
        {(showNotes || (report.notes && report.notes.trim().length > 0) || isCompleted) && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide" data-testid="section-header-notes">Notes</h3>
            <Textarea
              ref={notesRef}
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
              data-testid="textarea-notes"
            />
          </div>
        )}

        {/* Report-level photo uploader shown when triggered from Add Entry */}
        {showReportPhotoUploader && !(report.reportPhotos && report.reportPhotos.length > 0) && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Photos</h3>
            <NativeFileUploader
              maxNumberOfFiles={50}
              accept="image/*"
              buttonVariant="outline"
              onUploadComplete={(uploadedFiles) => {
                uploadedFiles.forEach((file) => {
                  createPhotoMutation.mutate({ 
                    reportId: report.id,
                    url: file.cloudinaryUrl,
                    cloudinaryPublicId: file.cloudinaryPublicId,
                    cloudinaryUrl: file.cloudinaryUrl,
                    fileName: file.name,
                    takenAt: file.takenAt?.toISOString(),
                  });
                });
              }}
            >
              <Camera className="h-3 w-3 mr-1" /> Upload Photos
            </NativeFileUploader>
          </div>
        )}
      </div>
      </div>

      {/* Add Entry Dialog */}
      <Dialog open={showAddEntryDialog} onOpenChange={setShowAddEntryDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Entry</DialogTitle>
            <DialogDescription>
              Choose what to add to this report.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <Button
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4"
              onClick={() => {
                setShowAddEntryDialog(false);
                setShowAddTaskDialog(true);
              }}
              disabled={availableTasks.length === 0}
              data-testid="button-add-entry-task"
            >
              <ClipboardList className="h-6 w-6" />
              <span className="text-sm">Task</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4"
              onClick={() => {
                setShowAddEntryDialog(false);
                createDeliveryMutation.mutate();
              }}
              data-testid="button-add-entry-delivery"
            >
              <Truck className="h-6 w-6" />
              <span className="text-sm">Delivery</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4"
              onClick={() => {
                setShowAddEntryDialog(false);
                createInspectionMutation.mutate();
              }}
              data-testid="button-add-entry-inspection"
            >
              <CheckCircle className="h-6 w-6" />
              <span className="text-sm">Inspection</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4"
              onClick={() => {
                setShowAddEntryDialog(false);
                setShowNotes(true);
                setTimeout(() => {
                  notesRef.current?.focus();
                  notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
              }}
              data-testid="button-add-entry-note"
            >
              <StickyNote className="h-6 w-6" />
              <span className="text-sm">Note</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4"
              onClick={() => {
                setShowAddEntryDialog(false);
                setShowReportPhotoUploader(true);
              }}
              data-testid="button-add-entry-photos"
            >
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm">Photos</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle>Complete & Sign Report</DialogTitle>
            <DialogDescription>
              Sign below to complete and lock this report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Your Name</Label>
              <p className="text-sm font-medium text-foreground" data-testid="text-signer-name">{signerName}</p>
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
                  style={{ touchAction: 'none' }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
                  onTouchMove={(e) => { e.preventDefault(); draw(e); }}
                  onTouchEnd={(e) => { e.preventDefault(); stopDrawing(); }}
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
      
      {/* Delete Inspection Confirmation */}
      <AlertDialog open={!!deleteInspectionId} onOpenChange={() => setDeleteInspectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the inspection entry and all associated photos from this report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteInspectionId && deleteInspectionMutation.mutate(deleteInspectionId)}
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
