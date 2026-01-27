import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
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
import { ArrowLeft, Save, Plus, Trash2, Calendar, Cloud, Truck, ChevronDown, ChevronUp, Upload, X, CheckCircle, PenLine } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { DailyReport, Task, ReportTask, LaborEntry, EquipmentEntry, Delivery, Project } from "@shared/schema";

const LABOR_TYPES = ["Foreman", "Operator", "Laborer"];
const EQUIPMENT_TYPES = ["Mini Excavator", "Excavator", "Skidsteer", "Compactor"];

function safeFormatDate(dateString: string | null | undefined, formatStr: string, fallback: string = 'this date'): string {
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
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  const [deleteDeliveryId, setDeleteDeliveryId] = useState<number | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signatureType, setSignatureType] = useState<'freehand' | 'typed'>('freehand');
  const [typedSignature, setTypedSignature] = useState('');
  const [signerName, setSignerName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const { data: project } = useQuery<Project>({
    queryKey: ['/api/projects', projectId],
    enabled: !!projectId,
  });

  const { data: report, isLoading: reportLoading } = useQuery<DailyReport>({
    queryKey: ['/api/reports', reportId],
    enabled: !!reportId,
  });

  const { data: projectTasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/projects', projectId, 'tasks'],
    enabled: !!projectId,
  });

  const { data: reportTasks = [], refetch: refetchReportTasks } = useQuery<ReportTask[]>({
    queryKey: ['/api/reports', reportId, 'tasks'],
    enabled: !!reportId,
  });

  const { data: deliveries = [], refetch: refetchDeliveries } = useQuery<Delivery[]>({
    queryKey: ['/api/reports', reportId, 'deliveries'],
    enabled: !!reportId,
  });

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

  const uncompletedTasks = projectTasks.filter(t => t.status !== 'completed');
  const availableTasksToAdd = uncompletedTasks.filter(
    t => !reportTasks.some(rt => rt.taskId === t.id)
  );

  async function fetchWeather() {
    try {
      const location = [project?.city, project?.state].filter(Boolean).join(', ') || 'New York';
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
      setLocation(`/projects/${projectId}/reports/${newReport.id}`);
      toast({ title: "Report created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create report", variant: "destructive" });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async (data: Partial<DailyReport>) => {
      return apiRequest('PUT', `/api/reports/${reportId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reports', reportId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'reports'] });
    },
  });

  const createReportTaskMutation = useMutation({
    mutationFn: async (data: { taskId: number; percentComplete: number }) => {
      return apiRequest('POST', `/api/reports/${reportId}/tasks`, data);
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
      queryClient.invalidateQueries({ queryKey: ['laborEntries'] });
    },
  });

  const deleteLaborEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/labor/${id}`);
    },
    onSuccess: () => {
      refetchReportTasks();
      queryClient.invalidateQueries({ queryKey: ['laborEntries'] });
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
      queryClient.invalidateQueries({ queryKey: ['equipmentEntries'] });
    },
  });

  const deleteEquipmentEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/equipment-entries/${id}`);
    },
    onSuccess: () => {
      refetchReportTasks();
      queryClient.invalidateQueries({ queryKey: ['equipmentEntries'] });
    },
  });

  const createDeliveryMutation = useMutation({
    mutationFn: async (data: Partial<Delivery>) => {
      return apiRequest('POST', `/api/reports/${reportId}/deliveries`, data);
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

  function handleSaveAndClose() {
    toast({ title: "Report saved" });
    setLocation(`/projects/${projectId}?tab=daily-reports`);
  }

  function handleBack() {
    setLocation(`/projects/${projectId}?tab=daily-reports`);
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

  function initCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let x, y;
    if ('touches' in e) {
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let x, y;
    if ('touches' in e) {
      e.preventDefault();
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }
    
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    initCanvas();
  }

  async function handleSignAndSave() {
    if (!signerName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }

    let signatureData = '';
    if (signatureType === 'freehand') {
      const canvas = canvasRef.current;
      if (canvas) {
        signatureData = canvas.toDataURL('image/png');
      }
    } else {
      signatureData = typedSignature;
    }

    if (!signatureData.trim()) {
      toast({ title: "Please provide a signature", variant: "destructive" });
      return;
    }

    await updateReportMutation.mutateAsync({
      isSigned: true,
      signatureType,
      signatureData,
      signedByName: signerName,
      signedAt: new Date(),
    } as Partial<DailyReport>);

    setShowSignatureDialog(false);
    toast({ title: "Report signed and saved" });
  }

  useEffect(() => {
    if (showSignatureDialog && signatureType === 'freehand') {
      setTimeout(initCanvas, 100);
    }
  }, [showSignatureDialog, signatureType]);

  if (!projectId) {
    return <div className="p-8 text-black">Invalid project ID</div>;
  }

  if (reportLoading && !isNewReport) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-black">Loading report...</div>
      </div>
    );
  }

  const isSigned = !!report?.isSigned;

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="text-black hover:bg-gray-100"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-black">
                {isNewReport ? 'New Daily Report' : 'Daily Report'}
              </h1>
              <p className="text-sm text-gray-600">{project?.name || 'Loading...'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isNewReport && !isSigned && (
              <>
                <Button
                  onClick={() => setShowSignatureDialog(true)}
                  variant="outline"
                  className="text-black border-gray-300"
                  data-testid="button-complete-sign"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Complete & Sign</span>
                  <span className="sm:hidden">Sign</span>
                </Button>
                <Button
                  onClick={handleSaveAndClose}
                  className="bg-primary text-primary-foreground"
                  data-testid="button-save"
                >
                  <Save className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Save & Close</span>
                  <span className="sm:hidden">Save</span>
                </Button>
              </>
            )}
            {isSigned && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Signed</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto space-y-6">
        {isNewReport ? (
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-black">Create New Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="report-date" className="text-black">
                  <span className="text-red-500">*</span> Report Date
                </Label>
                <Input
                  id="report-date"
                  type="date"
                  value={newReportDate}
                  onChange={(e) => setNewReportDate(e.target.value)}
                  className="bg-white text-black border-gray-300 mt-1"
                  data-testid="input-report-date"
                />
              </div>
              <p className="text-sm text-gray-600">
                Weather information will be automatically fetched for the project location.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="text-black border-gray-300 w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createReportMutation.mutate({ reportDate: newReportDate })}
                  disabled={createReportMutation.isPending}
                  className="w-full sm:w-auto"
                  data-testid="button-submit-create-report"
                >
                  {createReportMutation.isPending ? "Creating..." : "Create Report"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : report && (
          <>
            <Card className="bg-white border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-black">
                  <Calendar className="w-5 h-5 flex-shrink-0" />
                  {safeFormatDate(report.reportDate, 'EEEE, MMMM d, yyyy')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.weather && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-4 p-3 bg-blue-50 rounded-lg text-sm">
                    <div className="col-span-2 sm:col-span-3 md:col-span-6 flex items-center gap-2 mb-1">
                      <Cloud className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      <span className="font-medium text-blue-900">{report.weather}</span>
                    </div>
                    {report.temperature && (
                      <div className="text-blue-800">
                        <span className="text-xs text-blue-600 block">Current</span>
                        {report.temperature}
                      </div>
                    )}
                    {report.temperatureHigh && (
                      <div className="text-blue-800">
                        <span className="text-xs text-blue-600 block">High</span>
                        {report.temperatureHigh}
                      </div>
                    )}
                    {report.temperatureLow && (
                      <div className="text-blue-800">
                        <span className="text-xs text-blue-600 block">Low</span>
                        {report.temperatureLow}
                      </div>
                    )}
                    {report.humidity && (
                      <div className="text-blue-800">
                        <span className="text-xs text-blue-600 block">Humidity</span>
                        {report.humidity}
                      </div>
                    )}
                    {report.windSpeed && (
                      <div className="text-blue-800">
                        <span className="text-xs text-blue-600 block">Wind</span>
                        {report.windSpeed}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="grid gap-2">
                  <Label htmlFor="notes" className="text-black">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="General notes for this day..."
                    value={report.notes || ''}
                    onChange={(e) => updateReportMutation.mutate({ notes: e.target.value })}
                    disabled={isSigned}
                    className="bg-white text-black border-gray-300 min-h-[80px]"
                    data-testid="textarea-report-notes"
                  />
                </div>

                {isSigned && report.signedByName && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 text-green-700 mb-2">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Report Signed</span>
                    </div>
                    {report.signatureType === 'freehand' && report.signatureData && (
                      <div className="mb-2">
                        <img 
                          src={report.signatureData} 
                          alt="Signature" 
                          className="max-h-16 border border-gray-200 rounded bg-white"
                        />
                      </div>
                    )}
                    {report.signatureType === 'typed' && report.signatureData && (
                      <div className="mb-2 font-serif italic text-2xl text-black">
                        {report.signatureData}
                      </div>
                    )}
                    <p className="text-sm text-green-800">
                      Signed by: {report.signedByName}
                      {report.signedAt && ` on ${format(new Date(report.signedAt), 'MMM d, yyyy h:mm a')}`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-black">Daily Operations</CardTitle>
                  {!isSigned && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Select
                        onValueChange={(taskId) => {
                          if (taskId && taskId !== "none") {
                            const task = projectTasks.find(t => t.id === Number(taskId));
                            createReportTaskMutation.mutate({
                              taskId: Number(taskId),
                              percentComplete: task?.percentComplete || 0,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-48 bg-white text-black border-gray-300" data-testid="select-add-task">
                          <SelectValue placeholder="Add task..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white text-black border-gray-300">
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
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {reportTasks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No tasks added yet. Select a task from the dropdown to add it to this report.
                  </p>
                ) : (
                  reportTasks.map(reportTask => {
                    const task = projectTasks.find(t => t.id === reportTask.taskId);
                    const isExpanded = expandedTasks.has(reportTask.id);
                    const laborEntries = laborEntriesMap[reportTask.id] || [];
                    const equipmentEntries = equipmentEntriesMap[reportTask.id] || [];

                    return (
                      <Card key={reportTask.id} className="border border-gray-200" data-testid={`card-report-task-${reportTask.id}`}>
                        <CardContent className="pt-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleTaskExpanded(reportTask.id)}
                                  className="flex-shrink-0 text-black"
                                  data-testid={`button-toggle-task-${reportTask.id}`}
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </Button>
                                <h4 className="font-medium text-black truncate">{task?.title || 'Unknown Task'}</h4>
                              </div>
                            </div>
                            {!isSigned && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTaskId(reportTask.id)}
                                className="flex-shrink-0"
                                data-testid={`button-delete-report-task-${reportTask.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            )}
                          </div>

                          <div>
                            <Label className="text-sm text-black">Percent Complete: {reportTask.percentComplete}%</Label>
                            <Slider
                              value={[reportTask.percentComplete]}
                              min={0}
                              max={100}
                              step={5}
                              onValueChange={(value) => !isSigned && updateReportTaskMutation.mutate({ id: reportTask.id, data: { percentComplete: value[0] } })}
                              disabled={isSigned}
                              className="mt-2"
                              data-testid={`slider-task-percent-${reportTask.id}`}
                            />
                          </div>

                          {isExpanded && (
                            <div className="space-y-4 mt-4 pt-4 border-t border-gray-200">
                              <div>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                  <Label className="text-sm font-medium text-black">Labor</Label>
                                  {!isSigned && (
                                    <Select onValueChange={(type) => createLaborEntryMutation.mutate({
                                      reportTaskId: reportTask.id,
                                      laborType: type,
                                      quantity: 1,
                                      hours: 0,
                                    })}>
                                      <SelectTrigger className="w-full sm:w-40 bg-white text-black border-gray-300" data-testid={`select-add-labor-${reportTask.id}`}>
                                        <SelectValue placeholder="Add labor..." />
                                      </SelectTrigger>
                                      <SelectContent className="bg-white text-black border-gray-300">
                                        {LABOR_TYPES.map(type => (
                                          <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                                {laborEntries.map(entry => (
                                  <div key={entry.id} className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-gray-50 rounded">
                                    <span className="w-full sm:w-24 text-sm text-black font-medium">{entry.laborType}</span>
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <Input
                                        type="number"
                                        value={entry.quantity}
                                        disabled={isSigned}
                                        className="w-16 bg-white text-black border-gray-300"
                                        placeholder="Qty"
                                      />
                                      <span className="text-sm text-gray-600">x</span>
                                      <Input
                                        type="number"
                                        value={entry.hours}
                                        disabled={isSigned}
                                        className="w-16 bg-white text-black border-gray-300"
                                        placeholder="Hrs"
                                      />
                                      <span className="text-sm text-gray-600">hrs</span>
                                    </div>
                                    {!isSigned && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteLaborEntryMutation.mutate(entry.id)}
                                        className="flex-shrink-0"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                  <Label className="text-sm font-medium text-black">Equipment</Label>
                                  {!isSigned && (
                                    <Select onValueChange={(type) => createEquipmentEntryMutation.mutate({
                                      reportTaskId: reportTask.id,
                                      equipmentType: type,
                                      quantity: 1,
                                      hours: 0,
                                    })}>
                                      <SelectTrigger className="w-full sm:w-40 bg-white text-black border-gray-300" data-testid={`select-add-equipment-${reportTask.id}`}>
                                        <SelectValue placeholder="Add equipment..." />
                                      </SelectTrigger>
                                      <SelectContent className="bg-white text-black border-gray-300">
                                        {EQUIPMENT_TYPES.map(type => (
                                          <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                                {equipmentEntries.map(entry => (
                                  <div key={entry.id} className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-gray-50 rounded">
                                    <span className="w-full sm:w-24 text-sm text-black font-medium">{entry.equipmentType}</span>
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <Input
                                        type="number"
                                        value={entry.quantity}
                                        disabled={isSigned}
                                        className="w-16 bg-white text-black border-gray-300"
                                        placeholder="Qty"
                                      />
                                      <span className="text-sm text-gray-600">x</span>
                                      <Input
                                        type="number"
                                        value={entry.hours}
                                        disabled={isSigned}
                                        className="w-16 bg-white text-black border-gray-300"
                                        placeholder="Hrs"
                                      />
                                      <span className="text-sm text-gray-600">hrs</span>
                                    </div>
                                    {!isSigned && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteEquipmentEntryMutation.mutate(entry.id)}
                                        className="flex-shrink-0"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div>
                                <Label className="text-sm font-medium text-black">Comments</Label>
                                <Textarea
                                  value={reportTask.comments || ''}
                                  onChange={(e) => updateReportTaskMutation.mutate({ id: reportTask.id, data: { comments: e.target.value } })}
                                  disabled={isSigned}
                                  placeholder="Add comments about this task..."
                                  className="mt-1 bg-white text-black border-gray-300 min-h-[60px]"
                                  data-testid={`textarea-task-comments-${reportTask.id}`}
                                />
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

            <Card className="bg-white border-gray-200">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-black">
                    <Truck className="w-5 h-5 flex-shrink-0" />
                    Deliveries
                  </CardTitle>
                  {!isSigned && (
                    <Button
                      onClick={() => createDeliveryMutation.mutate({
                        vendor: '',
                        deliveryTime: '',
                        description: '',
                        allItemsDelivered: true,
                      })}
                      className="w-full sm:w-auto"
                      data-testid="button-add-delivery"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add Delivery
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {deliveries.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No deliveries recorded. Click "Add Delivery" to add one.
                  </p>
                ) : (
                  deliveries.map(delivery => (
                    <Card key={delivery.id} className="border border-gray-200" data-testid={`card-delivery-${delivery.id}`}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label className="text-sm text-black"><span className="text-red-500">*</span> Vendor</Label>
                              <Input
                                value={delivery.vendor || ''}
                                onChange={(e) => updateDeliveryMutation.mutate({ id: delivery.id, data: { vendor: e.target.value } })}
                                disabled={isSigned}
                                placeholder="Vendor name"
                                className="mt-1 bg-white text-black border-gray-300"
                                data-testid={`input-delivery-vendor-${delivery.id}`}
                              />
                            </div>
                            <div>
                              <Label className="text-sm text-black">Delivery Time</Label>
                              <Input
                                type="time"
                                value={delivery.deliveryTime || ''}
                                onChange={(e) => updateDeliveryMutation.mutate({ id: delivery.id, data: { deliveryTime: e.target.value } })}
                                disabled={isSigned}
                                className="mt-1 bg-white text-black border-gray-300"
                                data-testid={`input-delivery-time-${delivery.id}`}
                              />
                            </div>
                          </div>
                          {!isSigned && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteDeliveryId(delivery.id)}
                              className="flex-shrink-0"
                              data-testid={`button-delete-delivery-${delivery.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>

                        <div>
                          <Label className="text-sm text-black">Description</Label>
                          <Textarea
                            value={delivery.description || ''}
                            onChange={(e) => updateDeliveryMutation.mutate({ id: delivery.id, data: { description: e.target.value } })}
                            disabled={isSigned}
                            placeholder="What was delivered..."
                            className="mt-1 bg-white text-black border-gray-300 min-h-[60px]"
                            data-testid={`textarea-delivery-description-${delivery.id}`}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm text-black">All items on delivery slip delivered?</Label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`delivered-${delivery.id}`}
                                checked={delivery.allItemsDelivered === true}
                                onChange={() => !isSigned && updateDeliveryMutation.mutate({ id: delivery.id, data: { allItemsDelivered: true, missingItemsDetails: null } })}
                                disabled={isSigned}
                                className="accent-primary"
                                data-testid={`radio-delivered-yes-${delivery.id}`}
                              />
                              <span className="text-sm text-black">Yes</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`delivered-${delivery.id}`}
                                checked={delivery.allItemsDelivered === false}
                                onChange={() => !isSigned && updateDeliveryMutation.mutate({ id: delivery.id, data: { allItemsDelivered: false } })}
                                disabled={isSigned}
                                className="accent-primary"
                                data-testid={`radio-delivered-no-${delivery.id}`}
                              />
                              <span className="text-sm text-black">No</span>
                            </label>
                          </div>
                        </div>

                        {delivery.allItemsDelivered === false && (
                          <div>
                            <Label className="text-sm text-black">Missing Items Details</Label>
                            <Textarea
                              value={delivery.missingItemsDetails || ''}
                              onChange={(e) => updateDeliveryMutation.mutate({ id: delivery.id, data: { missingItemsDetails: e.target.value } })}
                              disabled={isSigned}
                              placeholder="Describe missing items..."
                              className="mt-1 bg-white text-black border-gray-300 min-h-[60px]"
                              data-testid={`textarea-missing-items-${delivery.id}`}
                            />
                          </div>
                        )}

                        {!isSigned && (
                          <div className="pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto text-black border-gray-300"
                              data-testid={`button-upload-delivery-photos-${delivery.id}`}
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              Upload Photos
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent className="bg-white mx-4 max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-black">Complete & Sign Report</DialogTitle>
            <DialogDescription className="text-gray-600">
              Once signed, this report can no longer be edited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-black"><span className="text-red-500">*</span> Your Name</Label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full name"
                className="mt-1 bg-white text-black border-gray-300"
                data-testid="input-signer-name"
              />
            </div>

            <div>
              <Label className="text-black">Signature Type</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="signature-type"
                    checked={signatureType === 'freehand'}
                    onChange={() => setSignatureType('freehand')}
                    className="accent-primary"
                  />
                  <span className="text-sm text-black">Draw Signature</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="signature-type"
                    checked={signatureType === 'typed'}
                    onChange={() => setSignatureType('typed')}
                    className="accent-primary"
                  />
                  <span className="text-sm text-black">Type Signature</span>
                </label>
              </div>
            </div>

            {signatureType === 'freehand' ? (
              <div className="space-y-2">
                <Label className="text-black"><span className="text-red-500">*</span> Draw Your Signature</Label>
                <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={150}
                    className="w-full touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    data-testid="canvas-signature"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearCanvas}
                  className="text-black border-gray-300"
                >
                  Clear
                </Button>
              </div>
            ) : (
              <div>
                <Label className="text-black"><span className="text-red-500">*</span> Type Your Signature</Label>
                <Input
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="Type your signature"
                  className="mt-1 bg-white text-black border-gray-300 font-serif italic text-xl"
                  data-testid="input-typed-signature"
                />
                {typedSignature && (
                  <p className="mt-2 text-2xl font-serif italic text-black border-b border-black pb-1">
                    {typedSignature}
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-gray-500 mt-2">
              {signerName && <span className="block">{signerName}</span>}
              <span className="border-t border-gray-300 block w-48 mt-1 pt-1">Signature Line</span>
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSignatureDialog(false)}
              className="w-full sm:w-auto text-black border-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSignAndSave}
              disabled={updateReportMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-sign-save"
            >
              <PenLine className="w-4 h-4 mr-2" />
              {updateReportMutation.isPending ? "Signing..." : "Sign & Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
        <AlertDialogContent className="bg-white mx-4 max-w-sm sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black">Remove Task from Report?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600">
              This will remove the task and its associated labor and equipment entries from this report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto text-black">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTaskId && deleteReportTaskMutation.mutate(deleteTaskId)}
              className="bg-destructive text-destructive-foreground w-full sm:w-auto"
              data-testid="button-confirm-delete-task"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteDeliveryId} onOpenChange={() => setDeleteDeliveryId(null)}>
        <AlertDialogContent className="bg-white mx-4 max-w-sm sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black">Remove Delivery?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600">
              This will remove the delivery record from this report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto text-black">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDeliveryId && deleteDeliveryMutation.mutate(deleteDeliveryId)}
              className="bg-destructive text-destructive-foreground w-full sm:w-auto"
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
