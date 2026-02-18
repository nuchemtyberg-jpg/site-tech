import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfWeek, addDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isToday, differenceInCalendarDays, isBefore, isAfter, max, min } from "date-fns";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, Users, Wrench, Trash2, Edit, X, CalendarDays, CalendarRange, GanttChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Task, Project, ScheduleEntry, Allocation, Equipment, FingercheckEmployee } from "@shared/schema";

function getWorkingDays(startDate: string, duration: number, includeSunday: boolean): string[] {
  const days: string[] = [];
  let current = parseISO(startDate);
  let count = 0;
  while (count < duration) {
    const dayOfWeek = getDay(current);
    if (dayOfWeek !== 6 && (dayOfWeek !== 0 || includeSunday)) {
      days.push(format(current, "yyyy-MM-dd"));
      count++;
    }
    if (count < duration) {
      current = addDays(current, 1);
    }
  }
  return days;
}

function ScheduleEntryCard({
  entry,
  task,
  project,
  allocations,
  onEdit,
  onDelete,
  onManageResources,
  compact = false,
}: {
  entry: ScheduleEntry;
  task: Task | undefined;
  project: Project | undefined;
  allocations: Allocation[];
  onEdit: () => void;
  onDelete: () => void;
  onManageResources: () => void;
  compact?: boolean;
}) {
  const entryAllocations = allocations.filter(a => a.scheduleEntryId === entry.id);
  const crewCount = entryAllocations.filter(a => a.allocationType === "crew").length;
  const equipCount = entryAllocations.filter(a => a.allocationType === "equipment").length;

  return (
    <div
      className={cn(
        "group relative text-xs cursor-pointer transition-colors",
        compact ? "p-1.5" : "p-2",
        task?.status === "completed"
          ? "bg-muted/50 text-muted-foreground"
          : "bg-card hover-elevate"
      )}
      data-testid={`schedule-entry-${entry.id}`}
    >
      {project?.color && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ backgroundColor: project.color }} />
      )}
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0 pl-1.5">
          <div className="font-semibold truncate" data-testid={`entry-title-${entry.id}`}>
            {task?.title || "Unknown Task"}
          </div>
          {project && (
            <div className="text-[10px] text-muted-foreground truncate">{project.name}</div>
          )}
        </div>
        <div className="invisible group-hover:visible flex items-center gap-0.5 flex-shrink-0">
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onManageResources(); }} data-testid={`button-resources-${entry.id}`}>
            <Users className="w-3 h-3" />
          </Button>
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onEdit(); }} data-testid={`button-edit-entry-${entry.id}`}>
            <Edit className="w-3 h-3" />
          </Button>
          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }} data-testid={`button-delete-entry-${entry.id}`}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {!compact && (
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
          {entry.duration > 1 && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />{entry.duration}d
            </span>
          )}
          {crewCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Users className="w-3 h-3" />{crewCount}
            </span>
          )}
          {equipCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Wrench className="w-3 h-3" />{equipCount}
            </span>
          )}
          {entry.includeSunday && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Sun</Badge>
          )}
        </div>
      )}
    </div>
  );
}

function AddScheduleEntryDialog({
  open,
  onOpenChange,
  defaultDate,
  editEntry,
  tasks,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  editEntry?: ScheduleEntry | null;
  tasks: Task[];
  projects: Project[];
}) {
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [startDate, setStartDate] = useState(defaultDate);
  const [duration, setDuration] = useState<number | string>(1);
  const [includeSunday, setIncludeSunday] = useState(false);
  const [notes, setNotes] = useState("");

  const isEdit = !!editEntry;

  const resetForm = useCallback(() => {
    setSelectedProjectId("");
    setSelectedTaskId("");
    setStartDate(defaultDate);
    setDuration(1);
    setIncludeSunday(false);
    setNotes("");
  }, [defaultDate]);

  const populateEdit = useCallback(() => {
    if (editEntry) {
      setSelectedProjectId(String(editEntry.projectId));
      setSelectedTaskId(String(editEntry.taskId));
      setStartDate(editEntry.startDate);
      setDuration(editEntry.duration);
      setIncludeSunday(editEntry.includeSunday);
      setNotes(editEntry.notes || "");
    }
  }, [editEntry]);

  useEffect(() => {
    if (open) {
      if (editEntry) populateEdit();
      else resetForm();
    }
  }, [open, editEntry, populateEdit, resetForm]);

  const unfinishedTasks = useMemo(() => {
    return tasks.filter(t => t.status !== "completed" && !t.deletedAt);
  }, [tasks]);

  const projectsWithTasks = useMemo(() => {
    const projectIds = new Set(unfinishedTasks.map(t => t.projectId));
    return projects.filter(p => projectIds.has(p.id) && !p.deletedAt);
  }, [projects, unfinishedTasks]);

  const filteredTasks = useMemo(() => {
    if (!selectedProjectId || selectedProjectId === "all") return unfinishedTasks;
    return unfinishedTasks.filter(t => t.projectId === Number(selectedProjectId));
  }, [selectedProjectId, unfinishedTasks]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/schedule-entries", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-entries"] });
      toast({ title: "Task scheduled successfully" });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to schedule task", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/schedule-entries/${editEntry!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-entries"] });
      toast({ title: "Schedule entry updated" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedTaskId) {
      toast({ title: "Please select a task", variant: "destructive" });
      return;
    }
    const numDuration = typeof duration === "string" ? 1 : duration;
    const task = tasks.find(t => t.id === Number(selectedTaskId));
    const data = {
      taskId: Number(selectedTaskId),
      projectId: task?.projectId || Number(selectedProjectId),
      startDate,
      duration: numDuration,
      includeSunday,
      notes: notes || null,
    };
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Schedule Entry" : "Schedule a Task"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the schedule details for this task." : "Pick an unfinished task and assign it to a date with a duration."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!isEdit && (
            <>
              <div className="space-y-2">
                <Label><span className="text-destructive">*</span> Project</Label>
                <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); setSelectedTaskId(""); }}>
                  <SelectTrigger data-testid="select-project">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {projectsWithTasks.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label><span className="text-destructive">*</span> Task</Label>
                <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                  <SelectTrigger data-testid="select-task">
                    <SelectValue placeholder="Select a task" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTasks.map(t => {
                      const proj = projects.find(p => p.id === t.projectId);
                      return (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.title}{proj ? ` (${proj.name})` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label><span className="text-destructive">*</span> Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-start-date" />
          </div>
          <div className="space-y-2">
            <Label><span className="text-destructive">*</span> Duration (working days)</Label>
            <Input type="number" min={1} max={365} value={duration} onChange={e => { const v = e.target.value; setDuration(v === "" ? "" : Math.max(1, parseInt(v) || 1)); }} data-testid="input-duration" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="include-sunday">Include Sundays</Label>
            <Switch id="include-sunday" checked={includeSunday} onCheckedChange={setIncludeSunday} data-testid="switch-include-sunday" />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." className="resize-none" data-testid="input-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} data-testid="button-cancel-schedule">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || (!isEdit && !selectedTaskId)} data-testid="button-save-schedule">
            {isPending ? "Saving..." : isEdit ? "Update" : "Schedule Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResourceAllocationDialog({
  open,
  onOpenChange,
  entry,
  task,
  allocations,
  employees,
  equipmentList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ScheduleEntry | null;
  task: Task | undefined;
  allocations: Allocation[];
  employees: FingercheckEmployee[];
  equipmentList: Equipment[];
}) {
  const { toast } = useToast();
  const [allocationType, setAllocationType] = useState<"crew" | "equipment">("crew");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");

  const createAllocationMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/allocations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allocations"] });
      toast({ title: "Resource allocated" });
      setSelectedEmployeeId("");
      setSelectedEquipmentId("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to allocate", description: err.message, variant: "destructive" });
    },
  });

  const deleteAllocationMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/allocations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allocations"] });
      toast({ title: "Resource removed" });
    },
  });

  if (!entry) return null;

  const entryAllocations = allocations.filter(a => a.scheduleEntryId === entry.id);
  const workingDays = getWorkingDays(entry.startDate, entry.duration, entry.includeSunday);
  const endDate = workingDays[workingDays.length - 1] || entry.startDate;

  const handleAddAllocation = () => {
    if (allocationType === "crew" && selectedEmployeeId) {
      const emp = employees.find(e => e.id === Number(selectedEmployeeId));
      createAllocationMutation.mutate({
        scheduleEntryId: entry.id,
        taskId: entry.taskId,
        projectId: entry.projectId,
        allocationType: "crew",
        employeeId: emp?.employeeId || null,
        crewMember: emp ? `${emp.firstName} ${emp.lastName}` : "",
        startDate: entry.startDate,
        endDate,
      });
    } else if (allocationType === "equipment" && selectedEquipmentId) {
      const eq = equipmentList.find(e => e.id === Number(selectedEquipmentId));
      createAllocationMutation.mutate({
        scheduleEntryId: entry.id,
        taskId: entry.taskId,
        projectId: entry.projectId,
        allocationType: "equipment",
        equipmentId: Number(selectedEquipmentId),
        crewMember: eq?.name || "",
        startDate: entry.startDate,
        endDate,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Resources</DialogTitle>
          <DialogDescription>
            Assign employees and equipment to "{task?.title}"
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {entryAllocations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No resources assigned yet</p>
            ) : (
              <div className="space-y-2">
                {entryAllocations.map(alloc => (
                  <div key={alloc.id} className="flex items-center justify-between p-2 rounded-md border border-border" data-testid={`allocation-row-${alloc.id}`}>
                    <div className="flex items-center gap-2">
                      {alloc.allocationType === "crew" ? (
                        <Users className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Wrench className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">{alloc.crewMember || "Unknown"}</span>
                      <Badge variant="secondary" className="text-[10px]">{alloc.allocationType}</Badge>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteAllocationMutation.mutate(alloc.id)}
                      disabled={deleteAllocationMutation.isPending}
                      data-testid={`button-remove-allocation-${alloc.id}`}
                    >
                      <X className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <Label className="font-semibold">Add Resource</Label>
            <div className="flex items-center gap-2">
              <Select value={allocationType} onValueChange={(v: "crew" | "equipment") => setAllocationType(v)}>
                <SelectTrigger className="w-[140px]" data-testid="select-allocation-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crew">Employee</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                </SelectContent>
              </Select>
              {allocationType === "crew" ? (
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger className="flex-1" data-testid="select-employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees
                      .filter(e => e.status === "active")
                      .map(e => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.firstName} {e.lastName}{e.jobTitle ? ` - ${e.jobTitle}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={selectedEquipmentId} onValueChange={setSelectedEquipmentId}>
                  <SelectTrigger className="flex-1" data-testid="select-equipment">
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentList
                      .filter(e => !e.deletedAt)
                      .map(e => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.name}{e.type ? ` (${e.type})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="icon"
                onClick={handleAddAllocation}
                disabled={createAllocationMutation.isPending || (allocationType === "crew" ? !selectedEmployeeId : !selectedEquipmentId)}
                data-testid="button-add-allocation"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-resources">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Schedule() {
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: scheduleEntries = [], isLoading: entriesLoading } = useQuery<ScheduleEntry[]>({
    queryKey: ["/api/schedule-entries"],
  });

  const { data: allocations = [] } = useQuery<Allocation[]>({
    queryKey: ["/api/allocations"],
  });

  const { data: employees = [] } = useQuery<FingercheckEmployee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: equipmentList = [] } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogDate, setAddDialogDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [editEntry, setEditEntry] = useState<ScheduleEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<ScheduleEntry | null>(null);
  const [resourceEntry, setResourceEntry] = useState<ScheduleEntry | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/schedule-entries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-entries"] });
      toast({ title: "Schedule entry removed" });
      setDeleteEntry(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const entriesByDay = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of scheduleEntries) {
      const days = getWorkingDays(entry.startDate, entry.duration, entry.includeSunday);
      for (const day of days) {
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(entry);
      }
    }
    return map;
  }, [scheduleEntries]);

  const getTaskById = useCallback((id: number) => tasks.find(t => t.id === id), [tasks]);
  const getProjectById = useCallback((id: number) => projects.find(p => p.id === id), [projects]);

  const handleAddToDate = (dateStr: string) => {
    setEditEntry(null);
    setAddDialogDate(dateStr);
    setAddDialogOpen(true);
  };

  const handleEditEntry = (entry: ScheduleEntry) => {
    setEditEntry(entry);
    setAddDialogDate(entry.startDate);
    setAddDialogOpen(true);
  };

  const isLoading = tasksLoading || entriesLoading;

  const activeView = isMobile ? "week" : viewMode;

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextWeek = () => setCurrentDate(addDays(currentDate, 7));
  const prevWeek = () => setCurrentDate(addDays(currentDate, -7));
  const goToday = () => setCurrentDate(new Date());

  const onPrev = activeView === "month" ? prevMonth : activeView === "gantt" ? prevMonth : prevWeek;
  const onNext = activeView === "month" ? nextMonth : activeView === "gantt" ? nextMonth : nextWeek;

  const commonProps: CalendarViewProps = {
    currentDate,
    entriesByDay,
    scheduleEntries,
    getTaskById,
    getProjectById,
    allocations,
    isLoading,
    onPrev,
    onNext,
    onToday: goToday,
    onAddToDate: handleAddToDate,
    onEditEntry: handleEditEntry,
    onDeleteEntry: setDeleteEntry,
    onManageResources: setResourceEntry,
    addDialogOpen,
    setAddDialogOpen,
    addDialogDate,
    editEntry,
    tasks,
    projects,
    deleteEntry,
    setDeleteEntry,
    deleteMutation,
    resourceEntry,
    setResourceEntry,
    employees,
    equipmentList,
    viewMode,
    onViewModeChange: setViewMode,
    isMobile,
  };

  if (activeView === "gantt") return <GanttView {...commonProps} />;
  if (activeView === "week") return <WeekView {...commonProps} />;
  return <MonthView {...commonProps} />;
}

interface CalendarViewProps {
  currentDate: Date;
  entriesByDay: Map<string, ScheduleEntry[]>;
  scheduleEntries: ScheduleEntry[];
  getTaskById: (id: number) => Task | undefined;
  getProjectById: (id: number) => Project | undefined;
  allocations: Allocation[];
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAddToDate: (dateStr: string) => void;
  onEditEntry: (entry: ScheduleEntry) => void;
  onDeleteEntry: (entry: ScheduleEntry) => void;
  onManageResources: (entry: ScheduleEntry) => void;
  addDialogOpen: boolean;
  setAddDialogOpen: (open: boolean) => void;
  addDialogDate: string;
  editEntry: ScheduleEntry | null;
  tasks: Task[];
  projects: Project[];
  deleteEntry: ScheduleEntry | null;
  setDeleteEntry: (entry: ScheduleEntry | null) => void;
  deleteMutation: any;
  resourceEntry: ScheduleEntry | null;
  setResourceEntry: (entry: ScheduleEntry | null) => void;
  employees: FingercheckEmployee[];
  equipmentList: Equipment[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isMobile: boolean;
}

type ViewMode = "month" | "week" | "gantt";

function CalendarHeader({ title, onPrev, onNext, onToday, onAdd, viewMode, onViewModeChange, isMobile }: {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAdd: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  isMobile?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-schedule-title">Schedule</h1>
        <p className="text-muted-foreground mt-1">Plan tasks, allocate resources, and manage your project timeline</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {viewMode && onViewModeChange && !isMobile && (
          <div className="flex items-center gap-0.5 bg-card border border-border p-1 rounded-md" data-testid="view-mode-toggle">
            <Button variant={viewMode === "month" ? "default" : "ghost"} size="icon" onClick={() => onViewModeChange("month")} data-testid="button-view-month" title="Month view">
              <CalendarDays className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === "week" ? "default" : "ghost"} size="icon" onClick={() => onViewModeChange("week")} data-testid="button-view-week" title="Week view">
              <CalendarRange className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === "gantt" ? "default" : "ghost"} size="icon" onClick={() => onViewModeChange("gantt")} data-testid="button-view-gantt" title="Gantt chart">
              <GanttChart className="w-4 h-4" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-1 bg-card border border-border p-1 rounded-md">
          <Button variant="ghost" size="icon" onClick={onPrev} data-testid="button-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday} data-testid="button-today">
            Today
          </Button>
          <div className="px-3 font-medium min-w-[160px] text-center text-sm" data-testid="text-current-period">
            {title}
          </div>
          <Button variant="ghost" size="icon" onClick={onNext} data-testid="button-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={onAdd} data-testid="button-add-schedule">
          <Plus className="w-4 h-4 mr-1" /> Schedule Task
        </Button>
      </div>
    </div>
  );
}

function SharedDialogs(props: CalendarViewProps) {
  return (
    <>
      <AddScheduleEntryDialog
        open={props.addDialogOpen}
        onOpenChange={props.setAddDialogOpen}
        defaultDate={props.addDialogDate}
        editEntry={props.editEntry}
        tasks={props.tasks}
        projects={props.projects}
      />
      <AlertDialog open={!!props.deleteEntry} onOpenChange={(v) => { if (!v) props.setDeleteEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this task from the schedule? This will also remove any allocated resources. The task itself will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => props.deleteEntry && props.deleteMutation.mutate(props.deleteEntry.id)}
              disabled={props.deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {props.deleteMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ResourceAllocationDialog
        open={!!props.resourceEntry}
        onOpenChange={(v) => { if (!v) props.setResourceEntry(null); }}
        entry={props.resourceEntry}
        task={props.resourceEntry ? props.getTaskById(props.resourceEntry.taskId) : undefined}
        allocations={props.allocations}
        employees={props.employees}
        equipmentList={props.equipmentList}
      />
    </>
  );
}

function MonthView(props: CalendarViewProps) {
  const monthStart = startOfMonth(props.currentDate);
  const monthEnd = endOfMonth(props.currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = addDays(startOfWeek(addDays(monthEnd, 6), { weekStartsOn: 1 }), -1);
  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const title = format(props.currentDate, "MMMM yyyy");

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <CalendarHeader
        title={title}
        onPrev={props.onPrev}
        onNext={props.onNext}
        onToday={props.onToday}
        onAdd={() => props.onAddToDate(format(new Date(), "yyyy-MM-dd"))}
        viewMode={props.viewMode}
        onViewModeChange={props.onViewModeChange}
        isMobile={props.isMobile}
      />

      <div className="flex-1 bg-card border border-border rounded-md overflow-hidden flex flex-col min-h-0">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
            <div key={day} className="p-2 text-center text-xs uppercase text-muted-foreground font-semibold border-r border-border last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {props.isLoading ? (
            <div className="grid grid-cols-7 gap-0 p-0">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="p-2 border-r border-b border-border min-h-[100px]">
                  <Skeleton className="h-4 w-6 mb-2" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
          ) : (
            weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
                {week.map(day => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const dayEntries = props.entriesByDay.get(dateStr) || [];
                  const inMonth = isSameMonth(day, props.currentDate);
                  const isSaturday = getDay(day) === 6;

                  return (
                    <div
                      key={dateStr}
                      className={cn(
                        "border-r border-border last:border-r-0 p-1.5 min-h-[100px] relative group transition-colors",
                        !inMonth && "bg-muted/20",
                        isSaturday && "bg-muted/10",
                        isToday(day) && "bg-primary/5"
                      )}
                      data-testid={`calendar-day-${dateStr}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                          isToday(day) ? "bg-primary text-primary-foreground" : !inMonth ? "text-muted-foreground/50" : "text-foreground"
                        )}>
                          {format(day, "d")}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 invisible group-hover:visible"
                          onClick={() => props.onAddToDate(dateStr)}
                          data-testid={`button-add-day-${dateStr}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {dayEntries.map(entry => (
                          <ScheduleEntryCard
                            key={entry.id}
                            entry={entry}
                            task={props.getTaskById(entry.taskId)}
                            project={props.getProjectById(entry.projectId)}
                            allocations={props.allocations}
                            onEdit={() => props.onEditEntry(entry)}
                            onDelete={() => props.onDeleteEntry(entry)}
                            onManageResources={() => props.onManageResources(entry)}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <SharedDialogs {...props} />
    </div>
  );
}

function GanttView(props: CalendarViewProps) {
  const monthStart = startOfMonth(props.currentDate);
  const monthEnd = endOfMonth(props.currentDate);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const title = format(props.currentDate, "MMMM yyyy");

  const projectEntries = useMemo(() => {
    const grouped = new Map<number, { project: Project | undefined; entries: ScheduleEntry[] }>();
    for (const entry of props.scheduleEntries) {
      if (!grouped.has(entry.projectId)) {
        grouped.set(entry.projectId, { project: props.getProjectById(entry.projectId), entries: [] });
      }
      grouped.get(entry.projectId)!.entries.push(entry);
    }
    grouped.forEach(g => g.entries.sort((a, b) => a.startDate.localeCompare(b.startDate)));
    return Array.from(grouped.values()).sort((a, b) => (a.project?.name || "").localeCompare(b.project?.name || ""));
  }, [props.scheduleEntries, props.getProjectById]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const COL_WIDTH = 40;

  useEffect(() => {
    if (bodyScrollRef.current) {
      const todayIndex = allDays.findIndex(d => isToday(d));
      if (todayIndex >= 0) {
        bodyScrollRef.current.scrollLeft = Math.max(0, todayIndex * COL_WIDTH - 200);
      }
    }
  }, [props.currentDate]);

  const getBarPosition = (entry: ScheduleEntry) => {
    const workingDays = getWorkingDays(entry.startDate, entry.duration, entry.includeSunday);
    if (workingDays.length === 0) return null;
    const firstDay = parseISO(workingDays[0]);
    const lastDay = parseISO(workingDays[workingDays.length - 1]);
    const startOffset = differenceInCalendarDays(firstDay, monthStart);
    const endOffset = differenceInCalendarDays(lastDay, monthStart);
    const clampedStart = Math.max(0, startOffset);
    const clampedEnd = Math.min(allDays.length - 1, endOffset);
    if (clampedStart > allDays.length - 1 || clampedEnd < 0) return null;
    return {
      left: clampedStart * COL_WIDTH,
      width: (clampedEnd - clampedStart + 1) * COL_WIDTH - 2,
      startsBeforeMonth: startOffset < 0,
      endsAfterMonth: endOffset > allDays.length - 1,
    };
  };

  const ROW_HEIGHT = 36;

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <CalendarHeader
        title={title}
        onPrev={props.onPrev}
        onNext={props.onNext}
        onToday={props.onToday}
        onAdd={() => props.onAddToDate(format(new Date(), "yyyy-MM-dd"))}
        viewMode={props.viewMode}
        onViewModeChange={props.onViewModeChange}
        isMobile={props.isMobile}
      />

      <div className="flex-1 flex flex-col min-h-0 bg-card border border-border rounded-md overflow-hidden">
        <div className="flex border-b border-border">
          <div className="w-[200px] flex-shrink-0 border-r border-border bg-muted/20">
            <div className="h-[52px] flex items-center px-3">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Task / Project</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden" ref={scrollContainerRef}>
            <div className="flex" style={{ minWidth: allDays.length * COL_WIDTH }}>
              {allDays.map(day => {
                const isSat = getDay(day) === 6;
                const isSun = getDay(day) === 0;
                const isWeekend = isSat || isSun;
                return (
                  <div
                    key={format(day, "yyyy-MM-dd")}
                    className={cn(
                      "flex-shrink-0 flex flex-col items-center justify-center border-r border-border text-[10px]",
                      isWeekend && "bg-muted/50",
                      isToday(day) && "bg-primary/10"
                    )}
                    style={{ width: COL_WIDTH, height: 52 }}
                  >
                    <span className="text-muted-foreground">{format(day, "EEE")}</span>
                    <span className={cn(
                      "font-bold w-5 h-5 flex items-center justify-center rounded-full text-[11px]",
                      isToday(day) && "bg-primary text-primary-foreground"
                    )}>
                      {format(day, "d")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 flex min-h-0 overflow-y-auto" data-testid="gantt-body">
          <div className="w-[200px] flex-shrink-0 border-r border-border bg-muted/20" data-testid="gantt-sidebar">
            {props.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : projectEntries.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No scheduled tasks</div>
            ) : (
              projectEntries.map(({ project, entries }) => (
                <div key={project?.id || 0}>
                  <div
                    className="px-3 text-xs font-bold uppercase text-muted-foreground bg-muted/30 border-b border-border truncate flex items-center"
                    style={{ height: ROW_HEIGHT, ...(project?.color ? { borderLeftColor: project.color, borderLeftWidth: 3 } : {}) }}
                    data-testid={`gantt-project-header-${project?.id}`}
                  >
                    {project?.name || "Unknown Project"}
                  </div>
                  {entries.map(entry => {
                    const task = props.getTaskById(entry.taskId);
                    const entryAllocations = props.allocations.filter(a => a.scheduleEntryId === entry.id);
                    const crewCount = entryAllocations.filter(a => a.allocationType === "crew").length;
                    return (
                      <div
                        key={entry.id}
                        className="group flex items-center gap-1 px-3 border-b border-border cursor-pointer hover-elevate"
                        style={{ height: ROW_HEIGHT }}
                        onClick={() => props.onEditEntry(entry)}
                        data-testid={`gantt-task-label-${entry.id}`}
                      >
                        <span className="flex-1 text-xs truncate">{task?.title || "Unknown"}</span>
                        {crewCount > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Users className="w-3 h-3" />{crewCount}
                          </span>
                        )}
                        <div className="invisible group-hover:visible flex items-center gap-0.5 flex-shrink-0">
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); props.onManageResources(entry); }} data-testid={`gantt-button-resources-${entry.id}`}>
                            <Users className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); props.onDeleteEntry(entry); }} data-testid={`gantt-button-delete-${entry.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex-1 min-w-0 overflow-x-auto" ref={bodyScrollRef} onScroll={(e) => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollLeft = (e.target as HTMLElement).scrollLeft;
            }
          }}>
            {(() => {
              const totalRows = projectEntries.reduce((sum, g) => sum + g.entries.length + 1, 0);
              const bodyHeight = Math.max(totalRows * ROW_HEIGHT, 100);
              return (
                <div className="relative" style={{ minWidth: allDays.length * COL_WIDTH, height: bodyHeight }}>
                  {allDays.map(day => {
                    const isSat = getDay(day) === 6;
                    const isSun = getDay(day) === 0;
                    const isWeekend = isSat || isSun;
                    return (
                      <div
                        key={format(day, "yyyy-MM-dd")}
                        className={cn(
                          "absolute top-0 border-r border-border",
                          isWeekend && "bg-muted/20",
                          isToday(day) && "bg-primary/5"
                        )}
                        style={{
                          left: differenceInCalendarDays(day, monthStart) * COL_WIDTH,
                          width: COL_WIDTH,
                          height: bodyHeight,
                        }}
                      />
                    );
                  })}

                  {monthStart <= new Date() && new Date() <= monthEnd && (
                    <div
                      className="absolute top-0 w-0.5 bg-destructive z-20"
                      style={{
                        left: differenceInCalendarDays(new Date(), monthStart) * COL_WIDTH + COL_WIDTH / 2,
                        height: bodyHeight,
                      }}
                      data-testid="gantt-today-marker"
                    />
                  )}

                  {projectEntries.map(({ project, entries }) => {
                    let rowOffset = 0;
                    for (const pg of projectEntries) {
                      if (pg.project?.id === project?.id) break;
                      rowOffset += pg.entries.length + 1;
                    }
                    return (
                      <div key={project?.id || 0}>
                        <div className="border-b border-border bg-muted/10" style={{ height: ROW_HEIGHT }} />
                        {entries.map((entry, idx) => {
                          const barPos = getBarPosition(entry);
                          const task = props.getTaskById(entry.taskId);
                          if (!barPos) return <div key={entry.id} className="border-b border-border" style={{ height: ROW_HEIGHT }} />;
                          return (
                            <div key={entry.id} className="relative border-b border-border" style={{ height: ROW_HEIGHT }}>
                              <div
                                className="absolute top-1 cursor-pointer text-[10px] font-medium flex items-center px-1.5 truncate transition-opacity hover:opacity-90 z-10"
                                style={{
                                  left: barPos.left,
                                  width: Math.max(barPos.width, 20),
                                  height: ROW_HEIGHT - 8,
                                  backgroundColor: project?.color || "hsl(var(--primary))",
                                  color: "white",
                                  borderRadius: barPos.startsBeforeMonth ? "0 4px 4px 0" : barPos.endsAfterMonth ? "4px 0 0 4px" : "4px",
                                }}
                                onClick={() => props.onEditEntry(entry)}
                                title={`${task?.title || "Unknown"} (${entry.duration}d)`}
                                data-testid={`gantt-bar-${entry.id}`}
                              >
                                <span className="truncate">{barPos.width > 60 ? (task?.title || "Unknown") : ""}</span>
                                {barPos.width > 40 && entry.duration > 1 && <span className="ml-1 opacity-75 flex-shrink-0">{entry.duration}d</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <SharedDialogs {...props} />
    </div>
  );
}

function WeekView(props: CalendarViewProps) {
  const startDate = startOfWeek(props.currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const title = `${format(startDate, "MMM d")} - ${format(addDays(startDate, 6), "MMM d, yyyy")}`;

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <CalendarHeader
        title={title}
        onPrev={props.onPrev}
        onNext={props.onNext}
        onToday={props.onToday}
        onAdd={() => props.onAddToDate(format(new Date(), "yyyy-MM-dd"))}
        viewMode={props.viewMode}
        onViewModeChange={props.onViewModeChange}
        isMobile={props.isMobile}
      />

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {props.isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <Card key={i} className="p-3">
              <Skeleton className="h-5 w-24 mb-2" />
              <Skeleton className="h-12 w-full" />
            </Card>
          ))
        ) : (
          weekDays.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayEntries = props.entriesByDay.get(dateStr) || [];
            const isSaturday = getDay(day) === 6;

            return (
              <Card
                key={dateStr}
                className={cn(
                  "p-3",
                  isToday(day) && "border-primary/50",
                  isSaturday && "opacity-60"
                )}
                data-testid={`week-day-${dateStr}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
                      isToday(day) ? "bg-primary text-primary-foreground" : ""
                    )}>
                      {format(day, "d")}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">
                      {format(day, "EEEE, MMM d")}
                    </span>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => props.onAddToDate(dateStr)} data-testid={`button-add-week-${dateStr}`}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {dayEntries.length > 0 ? (
                  <div className="space-y-2">
                    {dayEntries.map(entry => (
                      <ScheduleEntryCard
                        key={entry.id}
                        entry={entry}
                        task={props.getTaskById(entry.taskId)}
                        project={props.getProjectById(entry.projectId)}
                        allocations={props.allocations}
                        onEdit={() => props.onEditEntry(entry)}
                        onDelete={() => props.onDeleteEntry(entry)}
                        onManageResources={() => props.onManageResources(entry)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">No tasks scheduled</p>
                )}
              </Card>
            );
          })
        )}
      </div>

      <SharedDialogs {...props} />
    </div>
  );
}
