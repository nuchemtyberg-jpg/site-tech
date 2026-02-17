import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  DollarSign,
  CheckCircle2,
  Clock,
  Download,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Receipt,
} from "lucide-react";
import { format } from "date-fns";
import type { Task } from "@shared/schema";

type BillingTask = Task & { projectName: string };

export default function Billing() {
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unbilled" | "billed">("all");
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: billingTasks = [], isLoading } = useQuery<BillingTask[]>({
    queryKey: ["/api/admin/billing"],
  });

  const toggleBilledMutation = useMutation({
    mutationFn: async ({ taskId, billed }: { taskId: number; billed: boolean }) => {
      return apiRequest("PATCH", `/api/admin/billing/${taskId}`, { billed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update billing status.", variant: "destructive" });
    },
  });

  const bulkBillMutation = useMutation({
    mutationFn: async (taskIds: number[]) => {
      return apiRequest("POST", "/api/admin/billing/bulk", { taskIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/billing"] });
      setSelectedTasks(new Set());
      toast({ title: "Tasks billed", description: `${selectedTasks.size} tasks marked as billed.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to bulk update billing status.", variant: "destructive" });
    },
  });

  const filteredTasks = useMemo(() => {
    return billingTasks.filter((task) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (
          !task.title.toLowerCase().includes(search) &&
          !task.projectName.toLowerCase().includes(search) &&
          !(task.assignedTo || "").toLowerCase().includes(search)
        ) {
          return false;
        }
      }
      if (projectFilter !== "all" && task.projectName !== projectFilter) return false;
      if (statusFilter === "unbilled" && task.billedAt) return false;
      if (statusFilter === "billed" && !task.billedAt) return false;
      return true;
    });
  }, [billingTasks, searchTerm, projectFilter, statusFilter]);

  const projectNames = useMemo(() => {
    const names = new Set(billingTasks.map((t) => t.projectName));
    return Array.from(names).sort();
  }, [billingTasks]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, BillingTask[]> = {};
    filteredTasks.forEach((task) => {
      if (!groups[task.projectName]) groups[task.projectName] = [];
      groups[task.projectName].push(task);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTasks]);

  const stats = useMemo(() => {
    const unbilled = billingTasks.filter((t) => !t.billedAt);
    const billed = billingTasks.filter((t) => t.billedAt);
    const unbilledHours = unbilled.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const billedHours = billed.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    return {
      total: billingTasks.length,
      unbilledCount: unbilled.length,
      billedCount: billed.length,
      unbilledHours,
      billedHours,
    };
  }, [billingTasks]);

  const unbilledSelected = useMemo(() => {
    return Array.from(selectedTasks).filter((id) => {
      const task = billingTasks.find((t) => t.id === id);
      return task && !task.billedAt;
    });
  }, [selectedTasks, billingTasks]);

  const toggleProjectCollapse = (projectName: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectName)) next.delete(projectName);
      else next.add(projectName);
      return next;
    });
  };

  const toggleTaskSelection = (taskId: number) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleAllInProject = (projectTasks: BillingTask[]) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      const allSelected = projectTasks.every((t) => next.has(t.id));
      if (allSelected) {
        projectTasks.forEach((t) => next.delete(t.id));
      } else {
        projectTasks.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredTasks.map((t) => t.id)));
    }
  };

  const exportCSV = () => {
    const headers = ["Project", "Task", "Assigned To", "Est. Hours", "Completed Date", "Billed", "Billed Date", "Billed By"];
    const rows = filteredTasks.map((task) => [
      task.projectName,
      task.title,
      task.assignedTo || "",
      task.estimatedHours?.toString() || "",
      task.completedAt ? format(new Date(task.completedAt), "MM/dd/yyyy") : "",
      task.billedAt ? "Yes" : "No",
      task.billedAt ? format(new Date(task.billedAt), "MM/dd/yyyy") : "",
      task.billedBy || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-billing-title">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage billing for completed tasks across all projects</p>
        </div>
        <Button variant="outline" onClick={exportCSV} data-testid="button-export-csv">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Completed</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-completed">{stats.total}</div>
            <p className="text-xs text-muted-foreground">tasks at 100%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unbilled</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500" data-testid="text-unbilled-count">{stats.unbilledCount}</div>
            <p className="text-xs text-muted-foreground">{stats.unbilledHours} est. hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Billed</CardTitle>
            <DollarSign className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500" data-testid="text-billed-count">{stats.billedCount}</div>
            <p className="text-xs text-muted-foreground">{stats.billedHours} est. hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Projects</CardTitle>
            <Receipt className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-project-count">{projectNames.length}</div>
            <p className="text-xs text-muted-foreground">with completed tasks</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks or projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-[220px]"
                  data-testid="input-search-billing"
                />
              </div>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-project-filter">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projectNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "unbilled" | "billed")}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unbilled">Unbilled</SelectItem>
                  <SelectItem value="billed">Billed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {unbilledSelected.length > 0 && (
              <Button
                size="sm"
                onClick={() => bulkBillMutation.mutate(unbilledSelected)}
                disabled={bulkBillMutation.isPending}
                data-testid="button-bulk-bill"
              >
                {bulkBillMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <DollarSign className="w-4 h-4 mr-2" />
                )}
                Mark {unbilledSelected.length} as Billed
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">No completed tasks found</p>
              <p className="text-xs mt-1">Tasks will appear here when they reach 100% completion</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedTasks.size === filteredTasks.length && filteredTasks.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead className="hidden md:table-cell">Assigned To</TableHead>
                    <TableHead className="hidden lg:table-cell">Est. Hours</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedTasks.map(([projectName, projectTasks]) => {
                    const isCollapsed = collapsedProjects.has(projectName);
                    const projectUnbilled = projectTasks.filter((t) => !t.billedAt).length;
                    const projectBilled = projectTasks.filter((t) => t.billedAt).length;
                    const allProjectSelected = projectTasks.every((t) => selectedTasks.has(t.id));

                    return (
                      <Fragment key={`project-${projectName}`}>
                        <TableRow
                          key={`group-${projectName}`}
                          className="bg-muted/50 cursor-pointer"
                          onClick={() => toggleProjectCollapse(projectName)}
                          data-testid={`row-project-group-${projectName}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={allProjectSelected}
                              onCheckedChange={(e) => {
                                e && e !== "indeterminate" ? null : null;
                                toggleAllInProject(projectTasks);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`checkbox-project-${projectName}`}
                            />
                          </TableCell>
                          <TableCell colSpan={4}>
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                              <span className="font-semibold">{projectName}</span>
                              <Badge variant="secondary" className="text-xs">{projectTasks.length} tasks</Badge>
                              {projectUnbilled > 0 && (
                                <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">
                                  {projectUnbilled} unbilled
                                </Badge>
                              )}
                              {projectBilled > 0 && (
                                <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                                  {projectBilled} billed
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                        {!isCollapsed && projectTasks.map((task) => (
                          <TableRow key={task.id} data-testid={`row-task-${task.id}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedTasks.has(task.id)}
                                onCheckedChange={() => toggleTaskSelection(task.id)}
                                data-testid={`checkbox-task-${task.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium" data-testid={`text-task-title-${task.id}`}>{task.title}</div>
                              {task.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-sm text-muted-foreground">{task.assignedTo || "—"}</span>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <span className="text-sm">{task.estimatedHours || "—"}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm" data-testid={`text-completed-date-${task.id}`}>
                                {task.completedAt ? format(new Date(task.completedAt), "MM/dd/yyyy") : "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {task.billedAt ? (
                                <div>
                                  <Badge variant="default" className="bg-green-600 text-white text-xs" data-testid={`badge-billed-${task.id}`}>
                                    Billed
                                  </Badge>
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    {format(new Date(task.billedAt), "MM/dd/yyyy")}
                                    {task.billedBy && ` by ${task.billedBy}`}
                                  </p>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs" data-testid={`badge-unbilled-${task.id}`}>
                                  Unbilled
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant={task.billedAt ? "outline" : "default"}
                                onClick={() => toggleBilledMutation.mutate({ taskId: task.id, billed: !task.billedAt })}
                                disabled={toggleBilledMutation.isPending}
                                data-testid={`button-toggle-billed-${task.id}`}
                              >
                                {task.billedAt ? "Unbill" : "Bill"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
