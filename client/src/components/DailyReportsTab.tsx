import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Plus, Trash2, Calendar, Cloud, Truck, ChevronDown, ChevronUp, Upload, Image as ImageIcon, X } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { DailyReport, Task, ReportTask, LaborEntry, EquipmentEntry, Delivery, FileMetadata } from "@shared/schema";

const LABOR_TYPES = ["Foreman", "Operator", "Laborer"];
const EQUIPMENT_TYPES = ["Mini Excavator", "Excavator", "Skidsteer", "Compactor"];

interface DailyReportsTabProps {
  projectId: number;
  projectAddress?: string;
  projectCity?: string;
  projectState?: string;
}

interface ReportTaskWithDetails extends ReportTask {
  laborEntries?: LaborEntry[];
  equipmentEntries?: EquipmentEntry[];
  photos?: FileMetadata[];
}

interface DeliveryWithPhotos extends Delivery {
  photos?: FileMetadata[];
}

export function DailyReportsTab({ projectId, projectAddress, projectCity, projectState }: DailyReportsTabProps) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [newReportDate, setNewReportDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [existingReportForDate, setExistingReportForDate] = useState<DailyReport | null>(null);
  const [showDateConflictDialog, setShowDateConflictDialog] = useState(false);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [showTaskPhotoUpload, setShowTaskPhotoUpload] = useState<number | null>(null);
  const [showDeliveryPhotoUpload, setShowDeliveryPhotoUpload] = useState<number | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  const [deleteDeliveryId, setDeleteDeliveryId] = useState<number | null>(null);

  const { data: reports = [], isLoading: reportsLoading } = useQuery<DailyReport[]>({
    queryKey: ['/api/projects', projectId, 'reports'],
  });

  const { data: projectTasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
  });

  const { data: reportTasks = [], refetch: refetchReportTasks } = useQuery<ReportTask[]>({
    queryKey: ['/api/reports', selectedReportId, 'tasks'],
    enabled: !!selectedReportId,
  });

  const { data: deliveries = [], refetch: refetchDeliveries } = useQuery<Delivery[]>({
    queryKey: ['/api/reports', selectedReportId, 'deliveries'],
    enabled: !!selectedReportId,
  });

  const { data: files = [] } = useQuery<FileMetadata[]>({
    queryKey: ['/api/projects', projectId, 'files'],
  });

  const selectedReport = reports.find(r => r.id === selectedReportId);
  const uncompletedTasks = projectTasks.filter(t => t.status !== 'completed');

  const createReportMutation = useMutation({
    mutationFn: async (data: { reportDate: string }) => {
      const weatherData = await fetchWeather();
      const response = await apiRequest('POST', `/api/projects/${projectId}/reports`, {
        ...data,
        ...weatherData,
      });
      return (await response.json()) as DailyReport;
    },
    onSuccess: (newReport) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'reports'] });
      setIsCreateDialogOpen(false);
      setSelectedReportId(newReport.id);
      toast({ title: "Report created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create report", variant: "destructive" });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<DailyReport> }) => {
      return apiRequest('PUT', `/api/reports/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'reports'] });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'reports'] });
      if (selectedReportId === deleteReportId) {
        setSelectedReportId(null);
      }
      setDeleteReportId(null);
      toast({ title: "Report deleted" });
    },
  });

  const createReportTaskMutation = useMutation({
    mutationFn: async (data: { taskId: number; percentComplete: number }) => {
      return apiRequest('POST', `/api/reports/${selectedReportId}/tasks`, data);
    },
    onSuccess: () => {
      refetchReportTasks();
      toast({ title: "Task added to report" });
    },
  });

  const updateReportTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ReportTask> }) => {
      return apiRequest('PUT', `/api/report-tasks/${id}`, data);
    },
    onSuccess: (_, variables) => {
      refetchReportTasks();
      if (variables.data.percentComplete !== undefined) {
        const reportTask = reportTasks.find(rt => rt.id === variables.id);
        if (reportTask) {
          updateProjectTaskPercent(reportTask.taskId, variables.data.percentComplete);
        }
      }
    },
  });

  const deleteReportTaskMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/report-tasks/${id}`);
    },
    onSuccess: () => {
      refetchReportTasks();
      setDeleteTaskId(null);
      toast({ title: "Task removed from report" });
    },
  });

  const createLaborEntryMutation = useMutation({
    mutationFn: async (data: { reportTaskId: number; laborType: string; quantity: number; hours: number }) => {
      return apiRequest('POST', `/api/report-tasks/${data.reportTaskId}/labor`, {
        laborType: data.laborType,
        quantity: data.quantity,
        hours: data.hours,
      });
    },
    onSuccess: () => {
      refetchReportTasks();
    },
  });

  const deleteLaborEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/labor/${id}`);
    },
    onSuccess: () => {
      refetchReportTasks();
    },
  });

  const createEquipmentEntryMutation = useMutation({
    mutationFn: async (data: { reportTaskId: number; equipmentType: string; quantity: number; hours: number }) => {
      return apiRequest('POST', `/api/report-tasks/${data.reportTaskId}/equipment-entries`, {
        equipmentType: data.equipmentType,
        quantity: data.quantity,
        hours: data.hours,
      });
    },
    onSuccess: () => {
      refetchReportTasks();
    },
  });

  const deleteEquipmentEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/equipment-entries/${id}`);
    },
    onSuccess: () => {
      refetchReportTasks();
    },
  });

  const createDeliveryMutation = useMutation({
    mutationFn: async (data: Partial<Delivery>) => {
      return apiRequest('POST', `/api/reports/${selectedReportId}/deliveries`, data);
    },
    onSuccess: () => {
      refetchDeliveries();
      toast({ title: "Delivery added" });
    },
  });

  const updateDeliveryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Delivery> }) => {
      return apiRequest('PUT', `/api/deliveries/${id}`, data);
    },
    onSuccess: () => {
      refetchDeliveries();
    },
  });

  const deleteDeliveryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/deliveries/${id}`);
    },
    onSuccess: () => {
      refetchDeliveries();
      setDeleteDeliveryId(null);
      toast({ title: "Delivery removed" });
    },
  });

  async function fetchWeather() {
    try {
      const location = [projectCity, projectState].filter(Boolean).join(', ') || 'New York';
      const geocodeRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
      const geocodeData = await geocodeRes.json();
      
      if (geocodeData.results?.[0]) {
        const { latitude, longitude } = geocodeData.results[0];
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
        );
        const weatherData = await weatherRes.json();
        
        const weatherCodes: Record<number, string> = {
          0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
          45: "Foggy", 48: "Depositing rime fog",
          51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
          61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
          71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
          80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
          95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
        };

        return {
          weather: weatherCodes[weatherData.current?.weather_code] || "Unknown",
          weatherDescription: weatherCodes[weatherData.current?.weather_code] || "Unknown",
          temperature: `${Math.round(weatherData.current?.temperature_2m || 0)}°F`,
          temperatureHigh: `${Math.round(weatherData.daily?.temperature_2m_max?.[0] || 0)}°F`,
          temperatureLow: `${Math.round(weatherData.daily?.temperature_2m_min?.[0] || 0)}°F`,
          humidity: `${weatherData.current?.relative_humidity_2m || 0}%`,
          windSpeed: `${Math.round(weatherData.current?.wind_speed_10m || 0)} mph`,
        };
      }
    } catch (error) {
      console.error("Failed to fetch weather:", error);
    }
    return {};
  }

  async function updateProjectTaskPercent(taskId: number, percentComplete: number) {
    try {
      let status = 'in_progress';
      if (percentComplete === 0) status = 'pending';
      else if (percentComplete === 100) status = 'completed';

      await apiRequest('PUT', `/api/tasks/${taskId}`, { percentComplete, status });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  }

  async function handleCreateReport() {
    try {
      const existingRes = await fetch(`/api/projects/${projectId}/reports/by-date/${newReportDate}`);
      if (existingRes.ok) {
        const existing = await existingRes.json();
        setExistingReportForDate(existing);
        setShowDateConflictDialog(true);
        return;
      }
    } catch {}
    
    createReportMutation.mutate({ reportDate: newReportDate });
  }

  function handleEditExistingReport() {
    if (existingReportForDate) {
      setSelectedReportId(existingReportForDate.id);
      setShowDateConflictDialog(false);
      setIsCreateDialogOpen(false);
    }
  }

  function toggleTaskExpanded(taskId: number) {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  }

  if (reportsLoading) {
    return <div className="text-muted-foreground">Loading reports...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Daily Reports</h3>
        <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-report">
          <Plus className="w-4 h-4 mr-2" /> New Report
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Select a Report</h4>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports yet. Create your first report.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {reports.map(report => (
                <Card 
                  key={report.id}
                  className={`cursor-pointer transition-colors ${selectedReportId === report.id ? 'ring-2 ring-primary' : 'hover-elevate'}`}
                  onClick={() => setSelectedReportId(report.id)}
                  data-testid={`card-report-${report.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">
                          {format(new Date(report.reportDate + 'T00:00:00'), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteReportId(report.id);
                        }}
                        data-testid={`button-delete-report-${report.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    {report.weather && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                        <Cloud className="w-3 h-3" />
                        {report.weather} - {report.temperature}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          {selectedReport ? (
            <ReportEditor
              report={selectedReport}
              reportTasks={reportTasks}
              deliveries={deliveries}
              uncompletedTasks={uncompletedTasks}
              projectTasks={projectTasks}
              files={files}
              projectId={projectId}
              expandedTasks={expandedTasks}
              toggleTaskExpanded={toggleTaskExpanded}
              onUpdateReport={(data) => updateReportMutation.mutate({ id: selectedReport.id, data })}
              onAddTask={(taskId) => {
                const task = projectTasks.find(t => t.id === taskId);
                createReportTaskMutation.mutate({
                  taskId,
                  percentComplete: task?.percentComplete || 0,
                });
              }}
              onUpdateReportTask={(id, data) => updateReportTaskMutation.mutate({ id, data })}
              onDeleteReportTask={(id) => setDeleteTaskId(id)}
              onAddLabor={(reportTaskId, laborType) => createLaborEntryMutation.mutate({
                reportTaskId,
                laborType,
                quantity: 1,
                hours: 0,
              })}
              onDeleteLabor={(id) => deleteLaborEntryMutation.mutate(id)}
              onAddEquipment={(reportTaskId, equipmentType) => createEquipmentEntryMutation.mutate({
                reportTaskId,
                equipmentType,
                quantity: 1,
                hours: 0,
              })}
              onDeleteEquipment={(id) => deleteEquipmentEntryMutation.mutate(id)}
              onAddDelivery={() => createDeliveryMutation.mutate({
                vendor: '',
                deliveryTime: '',
                description: '',
                allItemsDelivered: true,
              })}
              onUpdateDelivery={(id, data) => updateDeliveryMutation.mutate({ id, data })}
              onDeleteDelivery={(id) => setDeleteDeliveryId(id)}
              showTaskPhotoUpload={showTaskPhotoUpload}
              setShowTaskPhotoUpload={setShowTaskPhotoUpload}
              showDeliveryPhotoUpload={showDeliveryPhotoUpload}
              setShowDeliveryPhotoUpload={setShowDeliveryPhotoUpload}
              refetchReportTasks={refetchReportTasks}
              refetchDeliveries={refetchDeliveries}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Select a report to view or edit, or create a new one
            </div>
          )}
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Create New Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="report-date" className="text-black dark:text-white">
                <span className="text-red-500">*</span> Report Date
              </Label>
              <Input
                id="report-date"
                type="date"
                value={newReportDate}
                onChange={(e) => setNewReportDate(e.target.value)}
                className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                data-testid="input-report-date"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Weather information will be automatically fetched for the project location.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateReport}
              disabled={createReportMutation.isPending}
              data-testid="button-submit-create-report"
            >
              {createReportMutation.isPending ? "Creating..." : "Create Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDateConflictDialog} onOpenChange={setShowDateConflictDialog}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">Report Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A report for {format(new Date(newReportDate + 'T00:00:00'), 'MMMM d, yyyy')} already exists for this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDateConflictDialog(false)}>
              Choose Different Date
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleEditExistingReport} data-testid="button-edit-existing-report">
              Edit Existing Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteReportId} onOpenChange={() => setDeleteReportId(null)}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">Delete Report?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All tasks and deliveries associated with this report will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteReportId && deleteReportMutation.mutate(deleteReportId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-report"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">Remove Task from Report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the task and its associated labor and equipment entries from this report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteTaskId && deleteReportTaskMutation.mutate(deleteTaskId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-task"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteDeliveryId} onOpenChange={() => setDeleteDeliveryId(null)}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">Remove Delivery?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the delivery record from this report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteDeliveryId && deleteDeliveryMutation.mutate(deleteDeliveryId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-delivery"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ReportEditorProps {
  report: DailyReport;
  reportTasks: ReportTask[];
  deliveries: Delivery[];
  uncompletedTasks: Task[];
  projectTasks: Task[];
  files: FileMetadata[];
  projectId: number;
  expandedTasks: Set<number>;
  toggleTaskExpanded: (id: number) => void;
  onUpdateReport: (data: Partial<DailyReport>) => void;
  onAddTask: (taskId: number) => void;
  onUpdateReportTask: (id: number, data: Partial<ReportTask>) => void;
  onDeleteReportTask: (id: number) => void;
  onAddLabor: (reportTaskId: number, laborType: string) => void;
  onDeleteLabor: (id: number) => void;
  onAddEquipment: (reportTaskId: number, equipmentType: string) => void;
  onDeleteEquipment: (id: number) => void;
  onAddDelivery: () => void;
  onUpdateDelivery: (id: number, data: Partial<Delivery>) => void;
  onDeleteDelivery: (id: number) => void;
  showTaskPhotoUpload: number | null;
  setShowTaskPhotoUpload: (id: number | null) => void;
  showDeliveryPhotoUpload: number | null;
  setShowDeliveryPhotoUpload: (id: number | null) => void;
  refetchReportTasks: () => void;
  refetchDeliveries: () => void;
}

function ReportEditor({
  report,
  reportTasks,
  deliveries,
  uncompletedTasks,
  projectTasks,
  files,
  projectId,
  expandedTasks,
  toggleTaskExpanded,
  onUpdateReport,
  onAddTask,
  onUpdateReportTask,
  onDeleteReportTask,
  onAddLabor,
  onDeleteLabor,
  onAddEquipment,
  onDeleteEquipment,
  onAddDelivery,
  onUpdateDelivery,
  onDeleteDelivery,
  showTaskPhotoUpload,
  setShowTaskPhotoUpload,
  showDeliveryPhotoUpload,
  setShowDeliveryPhotoUpload,
  refetchReportTasks,
  refetchDeliveries,
}: ReportEditorProps) {
  const [selectedTaskToAdd, setSelectedTaskToAdd] = useState<string>("");
  const { data: laborEntriesMap = {} } = useQuery({
    queryKey: ['laborEntries', reportTasks.map(rt => rt.id)],
    queryFn: async () => {
      const entries: Record<number, LaborEntry[]> = {};
      for (const rt of reportTasks) {
        const res = await fetch(`/api/report-tasks/${rt.id}/labor`);
        if (res.ok) {
          entries[rt.id] = await res.json();
        }
      }
      return entries;
    },
    enabled: reportTasks.length > 0,
  });

  const { data: equipmentEntriesMap = {} } = useQuery({
    queryKey: ['equipmentEntries', reportTasks.map(rt => rt.id)],
    queryFn: async () => {
      const entries: Record<number, EquipmentEntry[]> = {};
      for (const rt of reportTasks) {
        const res = await fetch(`/api/report-tasks/${rt.id}/equipment-entries`);
        if (res.ok) {
          entries[rt.id] = await res.json();
        }
      }
      return entries;
    },
    enabled: reportTasks.length > 0,
  });

  const availableTasksToAdd = uncompletedTasks.filter(
    t => !reportTasks.some(rt => rt.taskId === t.id)
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {format(new Date(report.reportDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {report.weather && (
            <div className="flex flex-wrap gap-4 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500" />
                <span className="font-medium">{report.weather}</span>
              </div>
              {report.temperature && (
                <span>Current: {report.temperature}</span>
              )}
              {report.temperatureHigh && (
                <span>High: {report.temperatureHigh}</span>
              )}
              {report.temperatureLow && (
                <span>Low: {report.temperatureLow}</span>
              )}
              {report.humidity && (
                <span>Humidity: {report.humidity}</span>
              )}
              {report.windSpeed && (
                <span>Wind: {report.windSpeed}</span>
              )}
            </div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="notes" className="text-black dark:text-white">Notes</Label>
            <Textarea
              id="notes"
              placeholder="General notes for this day..."
              value={report.notes || ''}
              onChange={(e) => onUpdateReport({ notes: e.target.value })}
              className="bg-white dark:bg-zinc-900 text-black dark:text-white"
              data-testid="textarea-report-notes"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Daily Operations</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={selectedTaskToAdd} onValueChange={setSelectedTaskToAdd}>
                <SelectTrigger className="w-48 bg-white dark:bg-zinc-900 text-black" data-testid="select-add-task">
                  <SelectValue placeholder="Select task..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-900 text-black">
                  {availableTasksToAdd.length === 0 ? (
                    <SelectItem value="none" disabled>No available tasks</SelectItem>
                  ) : (
                    availableTasksToAdd.map(task => (
                      <SelectItem key={task.id} value={task.id.toString()}>
                        {task.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={() => {
                  if (selectedTaskToAdd && selectedTaskToAdd !== "none") {
                    onAddTask(Number(selectedTaskToAdd));
                    setSelectedTaskToAdd("");
                  }
                }}
                disabled={!selectedTaskToAdd || selectedTaskToAdd === "none"}
                data-testid="button-add-task-to-report"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Task
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {reportTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tasks added yet. Select a task from the dropdown to add it to this report.
            </p>
          ) : (
            reportTasks.map(reportTask => {
              const task = projectTasks.find(t => t.id === reportTask.taskId);
              const isExpanded = expandedTasks.has(reportTask.id);
              const laborEntries = laborEntriesMap[reportTask.id] || [];
              const equipmentEntries = equipmentEntriesMap[reportTask.id] || [];

              return (
                <Card key={reportTask.id} className="border" data-testid={`card-report-task-${reportTask.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleTaskExpanded(reportTask.id)}
                            data-testid={`button-toggle-task-${reportTask.id}`}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <h4 className="font-medium">{task?.title || 'Unknown Task'}</h4>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteReportTask(reportTask.id)}
                        data-testid={`button-delete-report-task-${reportTask.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="mb-4">
                      <Label className="text-sm text-black dark:text-white">Percent Complete: {reportTask.percentComplete}%</Label>
                      <Slider
                        value={[reportTask.percentComplete]}
                        min={0}
                        max={100}
                        step={5}
                        onValueChange={(value) => onUpdateReportTask(reportTask.id, { percentComplete: value[0] })}
                        className="mt-2"
                        data-testid={`slider-task-percent-${reportTask.id}`}
                      />
                    </div>

                    {isExpanded && (
                      <div className="space-y-4 mt-4 pt-4 border-t">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium text-black dark:text-white">Labor</Label>
                            <Select onValueChange={(type) => onAddLabor(reportTask.id, type)}>
                              <SelectTrigger className="w-40 bg-white dark:bg-zinc-900 text-black" data-testid={`select-add-labor-${reportTask.id}`}>
                                <SelectValue placeholder="Add labor..." />
                              </SelectTrigger>
                              <SelectContent className="bg-white dark:bg-zinc-900 text-black">
                                {LABOR_TYPES.map(type => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {laborEntries.map(entry => (
                            <div key={entry.id} className="flex items-center gap-2 mb-2 p-2 bg-gray-50 dark:bg-zinc-800 rounded">
                              <span className="w-24 text-sm">{entry.laborType}</span>
                              <Input
                                type="number"
                                value={entry.quantity}
                                onChange={(e) => {}}
                                className="w-16 bg-white dark:bg-zinc-900 text-black"
                                placeholder="Qty"
                              />
                              <span className="text-sm">x</span>
                              <Input
                                type="number"
                                value={entry.hours}
                                onChange={(e) => {}}
                                className="w-16 bg-white dark:bg-zinc-900 text-black"
                                placeholder="Hrs"
                              />
                              <span className="text-sm">hours</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDeleteLabor(entry.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium text-black dark:text-white">Equipment</Label>
                            <Select onValueChange={(type) => onAddEquipment(reportTask.id, type)}>
                              <SelectTrigger className="w-40 bg-white dark:bg-zinc-900 text-black" data-testid={`select-add-equipment-${reportTask.id}`}>
                                <SelectValue placeholder="Add equipment..." />
                              </SelectTrigger>
                              <SelectContent className="bg-white dark:bg-zinc-900 text-black">
                                {EQUIPMENT_TYPES.map(type => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {equipmentEntries.map(entry => (
                            <div key={entry.id} className="flex items-center gap-2 mb-2 p-2 bg-gray-50 dark:bg-zinc-800 rounded">
                              <span className="w-24 text-sm">{entry.equipmentType}</span>
                              <Input
                                type="number"
                                value={entry.quantity}
                                onChange={(e) => {}}
                                className="w-16 bg-white dark:bg-zinc-900 text-black"
                                placeholder="Qty"
                              />
                              <span className="text-sm">x</span>
                              <Input
                                type="number"
                                value={entry.hours}
                                onChange={(e) => {}}
                                className="w-16 bg-white dark:bg-zinc-900 text-black"
                                placeholder="Hrs"
                              />
                              <span className="text-sm">hours</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDeleteEquipment(entry.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div>
                          <Label className="text-sm font-medium text-black dark:text-white">Comments</Label>
                          <Textarea
                            value={reportTask.comments || ''}
                            onChange={(e) => onUpdateReportTask(reportTask.id, { comments: e.target.value })}
                            placeholder="Add comments about this task..."
                            className="mt-1 bg-white dark:bg-zinc-900 text-black"
                            data-testid={`textarea-task-comments-${reportTask.id}`}
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium text-black dark:text-white">Task Photos</Label>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setShowTaskPhotoUpload(reportTask.id)}
                              data-testid={`button-upload-task-photos-${reportTask.id}`}
                            >
                              <Upload className="w-4 h-4 mr-1" /> Upload Photos
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Deliveries
            </CardTitle>
            <Button onClick={onAddDelivery} data-testid="button-add-delivery">
              <Plus className="w-4 h-4 mr-1" /> Add Delivery
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No deliveries recorded. Click "Add Delivery" to add one.
            </p>
          ) : (
            deliveries.map(delivery => (
              <Card key={delivery.id} className="border" data-testid={`card-delivery-${delivery.id}`}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm text-black dark:text-white"><span className="text-red-500">*</span> Vendor</Label>
                        <Input
                          value={delivery.vendor || ''}
                          onChange={(e) => onUpdateDelivery(delivery.id, { vendor: e.target.value })}
                          placeholder="Vendor name"
                          className="mt-1 bg-white dark:bg-zinc-900 text-black"
                          data-testid={`input-delivery-vendor-${delivery.id}`}
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-black dark:text-white">Delivery Time</Label>
                        <Input
                          type="time"
                          value={delivery.deliveryTime || ''}
                          onChange={(e) => onUpdateDelivery(delivery.id, { deliveryTime: e.target.value })}
                          className="mt-1 bg-white dark:bg-zinc-900 text-black"
                          data-testid={`input-delivery-time-${delivery.id}`}
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteDelivery(delivery.id)}
                      data-testid={`button-delete-delivery-${delivery.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>

                  <div>
                    <Label className="text-sm text-black dark:text-white">Description</Label>
                    <Textarea
                      value={delivery.description || ''}
                      onChange={(e) => onUpdateDelivery(delivery.id, { description: e.target.value })}
                      placeholder="What was delivered..."
                      className="mt-1 bg-white dark:bg-zinc-900 text-black"
                      data-testid={`textarea-delivery-description-${delivery.id}`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-black dark:text-white">All items on delivery slip delivered?</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`delivered-${delivery.id}`}
                          checked={delivery.allItemsDelivered === true}
                          onChange={() => onUpdateDelivery(delivery.id, { allItemsDelivered: true, missingItemsDetails: null })}
                          data-testid={`radio-delivered-yes-${delivery.id}`}
                        />
                        <span className="text-sm">Yes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`delivered-${delivery.id}`}
                          checked={delivery.allItemsDelivered === false}
                          onChange={() => onUpdateDelivery(delivery.id, { allItemsDelivered: false })}
                          data-testid={`radio-delivered-no-${delivery.id}`}
                        />
                        <span className="text-sm">No</span>
                      </label>
                    </div>
                  </div>

                  {delivery.allItemsDelivered === false && (
                    <div>
                      <Label className="text-sm text-black dark:text-white">
                        <span className="text-red-500">*</span> Details of Missing Items
                      </Label>
                      <Textarea
                        value={delivery.missingItemsDetails || ''}
                        onChange={(e) => onUpdateDelivery(delivery.id, { missingItemsDetails: e.target.value })}
                        placeholder="Describe what items were missing..."
                        className="mt-1 bg-white dark:bg-zinc-900 text-black"
                        data-testid={`textarea-missing-items-${delivery.id}`}
                      />
                    </div>
                  )}

                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                      Please upload photos of the delivery slip and delivered items
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowDeliveryPhotoUpload(delivery.id)}
                      data-testid={`button-upload-delivery-photos-${delivery.id}`}
                    >
                      <Upload className="w-4 h-4 mr-1" /> Upload Photos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={showTaskPhotoUpload !== null} onOpenChange={() => setShowTaskPhotoUpload(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Upload Task Photos</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-muted-foreground mb-4">
              To upload photos for this task, please use the Photos tab in the project.
            </p>
            <Button variant="outline" onClick={() => setShowTaskPhotoUpload(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeliveryPhotoUpload !== null} onOpenChange={() => setShowDeliveryPhotoUpload(null)}>
        <DialogContent className="bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Upload Delivery Photos</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-muted-foreground mb-4">
              To upload photos for this delivery, please use the Photos tab in the project.
            </p>
            <Button variant="outline" onClick={() => setShowDeliveryPhotoUpload(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
