import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import {
  RefreshCw, Search, Users, Phone, Mail, MapPin, Briefcase,
  ChevronRight, Clock, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { FingercheckEmployee } from "@shared/schema";

interface DailyTimeSummary {
  date: string;
  employeeId: number;
  employeeName: string;
  shifts: Array<{
    punchIn: string;
    punchOut: string | null;
    hours: number | null;
    jobCode: string | null;
    jobDescription: string | null;
  }>;
  totalHours: number;
  jobCode: string | null;
  jobDescription: string | null;
}

interface FingercheckJob {
  code: string;
  description: string;
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 14);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

function formatTime(isoString: string | null) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatHours(hours: number | null) {
  if (hours === null) return "—";
  return `${hours.toFixed(2)}h`;
}

// ---- ROSTER TAB ----
function RosterTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedEmployee, setSelectedEmployee] = useState<FingercheckEmployee | null>(null);
  const { toast } = useToast();

  const { data: employees = [], isLoading } = useQuery<FingercheckEmployee[]>({
    queryKey: ["/api/employees"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/employees/sync"),
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: `Synced ${data.count} employees from Fingercheck` });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Could not connect to Fingercheck.",
        variant: "destructive",
      });
    },
  });

  const filteredEmployees = employees.filter((e) => {
    const matchesSearch =
      !search ||
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeNumber?.toLowerCase().includes(search.toLowerCase()) ||
      e.email?.toLowerCase().includes(search.toLowerCase()) ||
      e.jobTitle?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = employees.filter((e) => e.status === "active").length;
  const terminatedCount = employees.filter((e) => e.status === "terminated").length;
  const lastSynced = employees.length > 0
    ? employees.reduce((latest, e) => {
        const syncDate = e.lastSyncedAt ? new Date(e.lastSyncedAt) : new Date(0);
        return syncDate > latest ? syncDate : latest;
      }, new Date(0))
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            {employees.length > 0
              ? `${activeCount} active, ${terminatedCount} terminated`
              : "Sync employees from Fingercheck to get started"}
            {lastSynced && lastSynced.getTime() > 0 && (
              <span className="ml-2">
                · Last synced {lastSynced.toLocaleDateString()} {lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-employees"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync from Fingercheck"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-employees"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("active")}
            data-testid="button-filter-active"
          >
            Active ({activeCount})
          </Button>
          <Button
            variant={statusFilter === "terminated" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("terminated")}
            data-testid="button-filter-terminated"
          >
            Terminated ({terminatedCount})
          </Button>
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            data-testid="button-filter-all"
          >
            All ({employees.length})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No employees yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Click "Sync from Fingercheck" to pull your employee data from Fingercheck into SiteTech.
            </p>
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-sync-employees-empty">
              <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Syncing..." : "Sync from Fingercheck"}
            </Button>
          </CardContent>
        </Card>
      ) : filteredEmployees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="w-10 h-10 text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold mb-1">No matching employees</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filter.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp) => (
                  <TableRow key={emp.id} className="cursor-pointer" onClick={() => setSelectedEmployee(emp)} data-testid={`row-employee-${emp.id}`}>
                    <TableCell className="font-medium">
                      <div>
                        <span data-testid={`text-employee-name-${emp.id}`}>{emp.firstName} {emp.lastName}</span>
                        {emp.employeeNumber && <span className="text-xs text-muted-foreground ml-2">#{emp.employeeNumber}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{emp.jobTitle || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.department || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.phone || emp.mobilePhone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={emp.status === "active" ? "default" : "secondary"}>{emp.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="md:hidden space-y-3">
            {filteredEmployees.map((emp) => (
              <Card key={emp.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedEmployee(emp)} data-testid={`card-employee-${emp.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                        <Badge variant={emp.status === "active" ? "default" : "secondary"} className="text-xs">{emp.status}</Badge>
                      </div>
                      {emp.jobTitle && <p className="text-sm text-muted-foreground mt-1">{emp.jobTitle}</p>}
                      {emp.email && <p className="text-xs text-muted-foreground mt-1 truncate">{emp.email}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-employee-detail-name">
              {selectedEmployee?.firstName} {selectedEmployee?.lastName}
            </DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={selectedEmployee.status === "active" ? "default" : "secondary"}>{selectedEmployee.status}</Badge>
                {selectedEmployee.employeeNumber && <span className="text-sm text-muted-foreground">Employee #{selectedEmployee.employeeNumber}</span>}
                {selectedEmployee.isSupervisor && <Badge variant="outline">Supervisor</Badge>}
              </div>
              <div className="grid gap-3">
                {selectedEmployee.jobTitle && (
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{selectedEmployee.jobTitle}</p>
                      {selectedEmployee.department && <p className="text-xs text-muted-foreground">{selectedEmployee.department}</p>}
                    </div>
                  </div>
                )}
                {selectedEmployee.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <a href={`mailto:${selectedEmployee.email}`} className="text-sm text-primary hover:underline">{selectedEmployee.email}</a>
                  </div>
                )}
                {(selectedEmployee.phone || selectedEmployee.mobilePhone) && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      {selectedEmployee.phone && <p className="text-sm">{selectedEmployee.phone}</p>}
                      {selectedEmployee.mobilePhone && selectedEmployee.mobilePhone !== selectedEmployee.phone && (
                        <p className="text-sm text-muted-foreground">{selectedEmployee.mobilePhone} (mobile)</p>
                      )}
                    </div>
                  </div>
                )}
                {(selectedEmployee.address1 || selectedEmployee.city) && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      {selectedEmployee.address1 && <p className="text-sm">{selectedEmployee.address1}</p>}
                      {selectedEmployee.address2 && <p className="text-sm">{selectedEmployee.address2}</p>}
                      {(selectedEmployee.city || selectedEmployee.state || selectedEmployee.zipCode) && (
                        <p className="text-sm">
                          {[selectedEmployee.city, selectedEmployee.state].filter(Boolean).join(", ")}
                          {selectedEmployee.zipCode && ` ${selectedEmployee.zipCode}`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedEmployee.hireDate && (
                    <div>
                      <p className="text-muted-foreground text-xs">Hire Date</p>
                      <p>{new Date(selectedEmployee.hireDate).toLocaleDateString()}</p>
                    </div>
                  )}
                  {selectedEmployee.terminationDate && (
                    <div>
                      <p className="text-muted-foreground text-xs">Termination Date</p>
                      <p>{new Date(selectedEmployee.terminationDate).toLocaleDateString()}</p>
                    </div>
                  )}
                  {selectedEmployee.payType && (
                    <div>
                      <p className="text-muted-foreground text-xs">Pay Type</p>
                      <p>{selectedEmployee.payType}</p>
                    </div>
                  )}
                  {selectedEmployee.location && (
                    <div>
                      <p className="text-muted-foreground text-xs">Location</p>
                      <p>{selectedEmployee.location}</p>
                    </div>
                  )}
                  {selectedEmployee.position && (
                    <div>
                      <p className="text-muted-foreground text-xs">Position</p>
                      <p>{selectedEmployee.position}</p>
                    </div>
                  )}
                </div>
              </div>
              {selectedEmployee.lastSyncedAt && (
                <p className="text-xs text-muted-foreground text-right">
                  Last synced: {new Date(selectedEmployee.lastSyncedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- TIME TRACKING TAB ----
function TimeTrackingTab() {
  const { toast } = useToast();
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [jobFilter, setJobFilter] = useState<string>("all");

  const { data: employees = [] } = useQuery<FingercheckEmployee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: summaries = [], isLoading: summaryLoading } = useQuery<DailyTimeSummary[]>({
    queryKey: ["/api/time-punches/summary", startDate, endDate, employeeFilter, jobFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (employeeFilter !== "all") params.set("employeeId", employeeFilter);
      if (jobFilter !== "all") params.set("jobCode", jobFilter);
      const res = await fetch(`/api/time-punches/summary?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load time data");
      return res.json();
    },
    enabled: !!startDate && !!endDate,
  });

  const { data: jobs = [] } = useQuery<FingercheckJob[]>({
    queryKey: ["/api/fingercheck-jobs"],
  });

  const syncMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/time-punches/sync", { startDate, endDate }),
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/time-punches/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fingercheck-jobs"] });
      toast({ title: `Synced ${data.synced} time punches from Fingercheck` });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const activeEmployees = employees.filter(e => e.status === "active");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between flex-wrap">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="input-time-start-date"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              data-testid="input-time-end-date"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Employee</label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-employee-filter">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {activeEmployees.map((emp) => (
                  <SelectItem key={emp.employeeId} value={String(emp.employeeId)}>
                    {emp.firstName} {emp.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Job</label>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-job-filter">
                <SelectValue placeholder="All Jobs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobs.map((job) => (
                  <SelectItem key={job.code} value={job.code}>{job.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-sync-time-punches">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync Time Data"}
        </Button>
      </div>

      {summaryLoading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : summaries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No time data found</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Click "Sync Time Data" to pull time punch records from Fingercheck for the selected date range.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Shifts</TableHead>
                <TableHead className="text-right">Total Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((summary) => (
                <TableRow key={`${summary.employeeId}-${summary.date}`} data-testid={`row-time-${summary.employeeId}-${summary.date}`}>
                  <TableCell className="font-medium whitespace-nowrap">{formatDate(summary.date)}</TableCell>
                  <TableCell data-testid={`text-time-employee-${summary.employeeId}`}>{summary.employeeName}</TableCell>
                  <TableCell className="text-muted-foreground">{summary.jobDescription || summary.jobCode || "—"}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {summary.shifts.map((shift, idx) => (
                        <div key={idx} className="text-sm flex items-center gap-2">
                          <span className="text-green-600 dark:text-green-400">{formatTime(shift.punchIn)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className={shift.punchOut ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                            {shift.punchOut ? formatTime(shift.punchOut) : "Missing"}
                          </span>
                          {shift.hours !== null && (
                            <span className="text-xs text-muted-foreground">({formatHours(shift.hours)})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium" data-testid={`text-total-hours-${summary.employeeId}-${summary.date}`}>
                    {formatHours(summary.totalHours)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ---- HOURS DASHBOARD TAB ----
function HoursDashboardTab() {
  const { toast } = useToast();
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const { data: mappings = [] } = useQuery<Array<{ id: number; projectId: number; fingercheckJobCode: string; fingercheckJobDescription: string | null }>>({
    queryKey: ["/api/project-mappings"],
  });

  const { data: projects = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/projects"],
  });

  const { data: jobs = [] } = useQuery<FingercheckJob[]>({
    queryKey: ["/api/fingercheck-jobs"],
  });

  const projectJobCodes = useMemo(() => {
    if (projectFilter === "all") return null;
    return mappings
      .filter(m => m.projectId === Number(projectFilter))
      .map(m => m.fingercheckJobCode);
  }, [projectFilter, mappings]);

  const effectiveJobFilter = useMemo(() => {
    if (jobFilter !== "all") return jobFilter;
    if (projectJobCodes && projectJobCodes.length > 0) return projectJobCodes[0];
    return "all";
  }, [jobFilter, projectJobCodes]);

  const { data: summaries = [], isLoading } = useQuery<DailyTimeSummary[]>({
    queryKey: ["/api/time-punches/summary", "dashboard", startDate, endDate, effectiveJobFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (effectiveJobFilter !== "all") params.set("jobCode", effectiveJobFilter);
      const res = await fetch(`/api/time-punches/summary?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load hours data");
      return res.json();
    },
    enabled: !!startDate && !!endDate,
  });

  const filteredSummaries = useMemo(() => {
    if (!projectJobCodes || projectJobCodes.length <= 1) return summaries;
    return summaries.filter(s => projectJobCodes.includes(s.jobCode || ""));
  }, [summaries, projectJobCodes]);

  const syncMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/time-punches/sync", { startDate, endDate }),
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/time-punches/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fingercheck-jobs"] });
      toast({ title: `Synced ${data.synced} time punches from Fingercheck` });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const mapping of mappings) {
      const project = projects.find(p => p.id === mapping.projectId);
      if (project) m.set(mapping.fingercheckJobCode, project.name);
    }
    return m;
  }, [mappings, projects]);

  const mappedProjects = useMemo(() => {
    const projectIds = new Set(mappings.map(m => m.projectId));
    return projects.filter(p => projectIds.has(p.id));
  }, [mappings, projects]);

  const employeeStats = useMemo(() => {
    const map = new Map<number, { name: string; totalHours: number; daysWorked: number; jobs: Set<string> }>();
    for (const s of filteredSummaries) {
      if (!map.has(s.employeeId)) {
        map.set(s.employeeId, { name: s.employeeName, totalHours: 0, daysWorked: 0, jobs: new Set() });
      }
      const entry = map.get(s.employeeId)!;
      entry.totalHours += s.totalHours;
      entry.daysWorked++;
      if (s.jobDescription) entry.jobs.add(s.jobDescription);
    }
    return Array.from(map.entries())
      .map(([id, stats]) => ({ employeeId: id, ...stats, jobs: Array.from(stats.jobs) }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [filteredSummaries]);

  const jobStats = useMemo(() => {
    const map = new Map<string, { description: string; totalHours: number; employees: Set<number>; projectName: string | null }>();
    for (const s of filteredSummaries) {
      const code = s.jobCode || "unassigned";
      const desc = s.jobDescription || "Unassigned";
      if (!map.has(code)) {
        map.set(code, { description: desc, totalHours: 0, employees: new Set(), projectName: projectMap.get(code) || null });
      }
      const entry = map.get(code)!;
      entry.totalHours += s.totalHours;
      entry.employees.add(s.employeeId);
    }
    return Array.from(map.entries())
      .map(([code, stats]) => ({ jobCode: code, ...stats, employeeCount: stats.employees.size }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [filteredSummaries, projectMap]);

  const totalAllHours = employeeStats.reduce((s, e) => s + e.totalHours, 0);
  const totalEmployees = employeeStats.length;
  const totalDays = new Set(filteredSummaries.map(s => s.date)).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between flex-wrap">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-dash-start-date" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-dash-end-date" />
          </div>
          {mappedProjects.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Project</label>
              <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); if (v !== "all") setJobFilter("all"); }}>
                <SelectTrigger className="w-[200px]" data-testid="select-dash-project-filter">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {mappedProjects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Job</label>
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-dash-job-filter">
                <SelectValue placeholder="All Jobs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobs.map((job) => (
                  <SelectItem key={job.code} value={job.code}>
                    {job.description}
                    {projectMap.get(job.code) ? ` → ${projectMap.get(job.code)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-sync-dashboard">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync Time Data"}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      ) : filteredSummaries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hours data found</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {projectFilter !== "all"
                ? "No time data matches the selected project. Try a different date range or project."
                : "Click \"Sync Time Data\" to pull time punch records from Fingercheck for the selected date range."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                <Clock className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-hours">{totalAllHours.toFixed(1)}h</div>
                <p className="text-xs text-muted-foreground">{totalDays} working days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Employees</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-employees">{totalEmployees}</div>
                <p className="text-xs text-muted-foreground">with time records</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Hours/Employee</CardTitle>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-hours">
                  {totalEmployees > 0 ? (totalAllHours / totalEmployees).toFixed(1) : "0"}h
                </div>
                <p className="text-xs text-muted-foreground">for selected period</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours by Employee</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {employeeStats.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No data for this period</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Days</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeStats.map((emp) => (
                        <TableRow key={emp.employeeId} data-testid={`row-dash-employee-${emp.employeeId}`}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{emp.name}</span>
                              {emp.jobs.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-0.5">{emp.jobs.join(", ")}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{emp.daysWorked}</TableCell>
                          <TableCell className="text-right font-medium">{emp.totalHours.toFixed(1)}h</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hours by Job</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {jobStats.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No data for this period</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead className="text-right">Workers</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobStats.map((job) => (
                        <TableRow key={job.jobCode} data-testid={`row-dash-job-${job.jobCode}`}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{job.description}</span>
                              {job.projectName && (
                                <p className="text-xs text-muted-foreground mt-0.5">Project: {job.projectName}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{job.employeeCount}</TableCell>
                          <TableCell className="text-right font-medium">{job.totalHours.toFixed(1)}h</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ---- MAIN PAGE ----
export default function EmployeesPage() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(searchString);
  const activeTab = params.get("tab") || "roster";

  const handleTabChange = (tab: string) => {
    navigate(`/employees?tab=${tab}`, { replace: true });
  };

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Employees</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage employee roster, time tracking, and hours from Fingercheck</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="roster" data-testid="tab-roster">
            <Users className="w-4 h-4 mr-2" />
            Roster
          </TabsTrigger>
          <TabsTrigger value="time-tracking" data-testid="tab-time-tracking">
            <Clock className="w-4 h-4 mr-2" />
            Time Tracking
          </TabsTrigger>
          <TabsTrigger value="hours-dashboard" data-testid="tab-hours-dashboard">
            <BarChart3 className="w-4 h-4 mr-2" />
            Hours Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster">
          <RosterTab />
        </TabsContent>
        <TabsContent value="time-tracking">
          <TimeTrackingTab />
        </TabsContent>
        <TabsContent value="hours-dashboard">
          <HoursDashboardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
