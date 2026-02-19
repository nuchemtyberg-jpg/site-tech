import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus,
  FileText,
  Trash2,
  Edit,
  Eye,
  Download,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Calculator,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import type { Project, Task, PayApplication, PayApplicationItem } from "@shared/schema";

type PayAppWithDetails = PayApplication & { projectName: string; items: PayApplicationItem[] };

export default function ProgressBilling() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<PayAppWithDetails | null>(null);
  const [lineItemsDialogOpen, setLineItemsDialogOpen] = useState(false);

  const [newProjectId, setNewProjectId] = useState<string>("");
  const [newPeriodTo, setNewPeriodTo] = useState("");
  const [newContractDate, setNewContractDate] = useState("");
  const [newOriginalContractSum, setNewOriginalContractSum] = useState("");
  const [newNetChange, setNewNetChange] = useState("0");
  const [newRetainagePercent, setNewRetainagePercent] = useState("10");
  const [newNotes, setNewNotes] = useState("");

  const [lineItems, setLineItems] = useState<Array<{
    taskId: number;
    itemNumber: number;
    description: string;
    scheduledValue: number;
    previouslyCompleted: number;
    thisPeriodsWork: number;
    materialsStored: number;
  }>>([]);

  const [expandedApps, setExpandedApps] = useState<Set<number>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: payApps = [], isLoading } = useQuery<PayAppWithDetails[]>({
    queryKey: ["/api/admin/pay-applications"],
  });

  const activeProjects = useMemo(() => {
    return projects.filter(p => !p.deletedAt && (p.status === "active" || p.status === "completed"));
  }, [projects]);

  const filteredApps = useMemo(() => {
    if (selectedProjectId === "all") return payApps;
    return payApps.filter(a => a.projectId === Number(selectedProjectId));
  }, [payApps, selectedProjectId]);

  const groupedByProject = useMemo(() => {
    const groups: Record<string, PayAppWithDetails[]> = {};
    filteredApps.forEach(app => {
      if (!groups[app.projectName]) groups[app.projectName] = [];
      groups[app.projectName].push(app);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredApps]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/pay-applications", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pay-applications"] });
      setCreateDialogOpen(false);
      resetForm();
      toast({ title: "Pay Application Created", description: "The pay application has been created." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create pay application.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      return apiRequest("PATCH", `/api/pay-application/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pay-applications"] });
      setEditDialogOpen(false);
      toast({ title: "Pay Application Updated", description: "Changes saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update pay application.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/pay-application/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pay-applications"] });
      setDeleteDialogOpen(false);
      setSelectedApp(null);
      toast({ title: "Pay Application Deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete pay application.", variant: "destructive" });
    },
  });

  const saveItemsMutation = useMutation({
    mutationFn: async ({ appId, items }: { appId: number; items: any[] }) => {
      return apiRequest("POST", `/api/pay-application/${appId}/items`, items);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pay-applications"] });
      setLineItemsDialogOpen(false);
      toast({ title: "Line Items Saved", description: "Pay application line items have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save line items.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNewProjectId("");
    setNewPeriodTo("");
    setNewContractDate("");
    setNewOriginalContractSum("");
    setNewNetChange("0");
    setNewRetainagePercent("10");
    setNewNotes("");
  };

  const handleCreate = () => {
    if (!newProjectId || !newPeriodTo) {
      toast({ title: "Missing Fields", description: "Please select a project and period to date.", variant: "destructive" });
      return;
    }

    const projectApps = payApps.filter(a => a.projectId === Number(newProjectId));
    const nextNumber = projectApps.length > 0 ? Math.max(...projectApps.map(a => a.applicationNumber)) + 1 : 1;

    createMutation.mutate({
      projectId: Number(newProjectId),
      applicationNumber: nextNumber,
      periodTo: newPeriodTo,
      contractDate: newContractDate || null,
      originalContractSum: newOriginalContractSum ? parseInt(newOriginalContractSum) : null,
      netChangeByChangeOrders: newNetChange ? parseInt(newNetChange) : 0,
      retainagePercent: newRetainagePercent ? parseFloat(newRetainagePercent) : 0,
      notes: newNotes || null,
      status: "draft",
    });
  };

  const handleOpenEdit = (app: PayAppWithDetails) => {
    setSelectedApp(app);
    setNewPeriodTo(app.periodTo);
    setNewContractDate(app.contractDate || "");
    setNewOriginalContractSum(app.originalContractSum != null ? String(app.originalContractSum) : "");
    setNewNetChange(app.netChangeByChangeOrders != null ? String(app.netChangeByChangeOrders) : "0");
    setNewRetainagePercent(app.retainagePercent != null ? String(app.retainagePercent) : "10");
    setNewNotes(app.notes || "");
    setEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedApp) return;
    updateMutation.mutate({
      id: selectedApp.id,
      periodTo: newPeriodTo,
      contractDate: newContractDate || null,
      originalContractSum: newOriginalContractSum ? parseInt(newOriginalContractSum) : null,
      netChangeByChangeOrders: newNetChange ? parseInt(newNetChange) : 0,
      retainagePercent: newRetainagePercent ? parseFloat(newRetainagePercent) : 0,
      notes: newNotes || null,
    });
  };

  const handleOpenLineItems = async (app: PayAppWithDetails) => {
    setSelectedApp(app);
    try {
      const res = await fetch(`/api/projects/${app.projectId}/tasks-with-values`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const projectTasks: Task[] = await res.json();

      const existingItems = app.items || [];
      const mappedItems = projectTasks
        .filter(t => !t.deletedAt)
        .map((task, idx) => {
          const existing = existingItems.find(i => i.taskId === task.id);
          return {
            taskId: task.id,
            itemNumber: existing?.itemNumber || idx + 1,
            description: existing?.description || task.title,
            scheduledValue: existing?.scheduledValue ?? task.scheduledValue ?? 0,
            previouslyCompleted: existing?.previouslyCompleted ?? 0,
            thisPeriodsWork: existing?.thisPeriodsWork ?? 0,
            materialsStored: existing?.materialsStored ?? 0,
          };
        });

      setLineItems(mappedItems);
      setLineItemsDialogOpen(true);
    } catch {
      toast({ title: "Error", description: "Failed to load project tasks.", variant: "destructive" });
    }
  };

  const handleSaveLineItems = () => {
    if (!selectedApp) return;
    saveItemsMutation.mutate({ appId: selectedApp.id, items: lineItems });
  };

  const updateLineItem = (idx: number, field: string, value: number) => {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const calculateG702Summary = (app: PayAppWithDetails) => {
    const items = app.items || [];
    const originalContractSum = app.originalContractSum || 0;
    const netChange = app.netChangeByChangeOrders || 0;
    const contractSumToDate = originalContractSum + netChange;
    const retainagePercent = app.retainagePercent || 0;

    const totalCompleted = items.reduce((sum, item) => {
      return sum + (item.previouslyCompleted || 0) + (item.thisPeriodsWork || 0) + (item.materialsStored || 0);
    }, 0);

    const totalScheduledValue = items.reduce((sum, item) => sum + (item.scheduledValue || 0), 0);
    const percentComplete = totalScheduledValue > 0 ? (totalCompleted / totalScheduledValue) * 100 : 0;
    const retainageAmount = Math.round(totalCompleted * (retainagePercent / 100));
    const totalEarnedLessRetainage = totalCompleted - retainageAmount;

    const previousItems = items.reduce((sum, item) => sum + (item.previouslyCompleted || 0), 0);
    const previousRetainage = Math.round(previousItems * (retainagePercent / 100));
    const previousCertificates = previousItems - previousRetainage;
    const currentPaymentDue = totalEarnedLessRetainage - previousCertificates;
    const balanceToFinish = contractSumToDate - totalCompleted;

    return {
      originalContractSum,
      netChange,
      contractSumToDate,
      totalCompleted,
      totalScheduledValue,
      percentComplete,
      retainagePercent,
      retainageAmount,
      totalEarnedLessRetainage,
      previousCertificates,
      currentPaymentDue,
      balanceToFinish,
    };
  };

  const toggleExpand = (id: number) => {
    setExpandedApps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const stats = useMemo(() => {
    const total = payApps.length;
    const drafts = payApps.filter(a => a.status === "draft").length;
    const submitted = payApps.filter(a => a.status === "submitted").length;
    const approved = payApps.filter(a => a.status === "approved").length;
    const totalBilled = payApps.reduce((sum, app) => {
      const s = calculateG702Summary(app);
      return sum + s.currentPaymentDue;
    }, 0);
    return { total, drafts, submitted, approved, totalBilled };
  }, [payApps]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Applications</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold" data-testid="text-total-pay-apps">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Drafts</CardTitle>
            <Edit className="w-4 h-4 text-amber-500 hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-amber-500" data-testid="text-draft-count">{stats.drafts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <DollarSign className="w-4 h-4 text-green-500 hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-green-500" data-testid="text-approved-count">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-1 sm:pb-2 p-3 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Billed</CardTitle>
            <Calculator className="w-4 h-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold" data-testid="text-total-billed">{formatCurrency(stats.totalBilled)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-3 sm:p-6 pb-3 sm:pb-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-progress-project-filter">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {activeProjects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-pay-app">
              <Plus className="w-4 h-4 mr-2" />
              New Pay Application
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">No pay applications yet</p>
              <p className="text-xs mt-1">Create a new pay application to get started with G702 progress billing</p>
            </div>
          ) : (
            <div className="divide-y">
              {groupedByProject.map(([projectName, apps]) => (
                <div key={projectName}>
                  <div className="bg-muted/50 px-4 py-2">
                    <span className="font-semibold text-sm">{projectName}</span>
                    <Badge variant="secondary" className="ml-2 text-xs">{apps.length} applications</Badge>
                  </div>
                  {apps.map(app => {
                    const summary = calculateG702Summary(app);
                    const isExpanded = expandedApps.has(app.id);
                    return (
                      <div key={app.id} className="border-b last:border-b-0" data-testid={`pay-app-${app.id}`}>
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                          onClick={() => toggleExpand(app.id)}
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm" data-testid={`text-app-number-${app.id}`}>
                                Application #{app.applicationNumber}
                              </span>
                              <Badge
                                variant={app.status === "approved" ? "default" : app.status === "submitted" ? "secondary" : "outline"}
                                className={app.status === "approved" ? "bg-green-600 text-white text-xs" : "text-xs"}
                                data-testid={`badge-app-status-${app.id}`}
                              >
                                {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Period to: {format(new Date(app.periodTo + "T00:00:00"), "MM/dd/yyyy")}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-semibold text-sm" data-testid={`text-payment-due-${app.id}`}>
                              {formatCurrency(summary.currentPaymentDue)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {summary.percentComplete.toFixed(1)}% complete
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                              <div className="text-center p-2 bg-muted/30 rounded-md">
                                <p className="text-[10px] sm:text-xs text-muted-foreground">Original Contract</p>
                                <p className="font-semibold text-xs sm:text-sm">{formatCurrency(summary.originalContractSum)}</p>
                              </div>
                              <div className="text-center p-2 bg-muted/30 rounded-md">
                                <p className="text-[10px] sm:text-xs text-muted-foreground">Change Orders</p>
                                <p className="font-semibold text-xs sm:text-sm">{formatCurrency(summary.netChange)}</p>
                              </div>
                              <div className="text-center p-2 bg-muted/30 rounded-md">
                                <p className="text-[10px] sm:text-xs text-muted-foreground">Contract to Date</p>
                                <p className="font-semibold text-xs sm:text-sm">{formatCurrency(summary.contractSumToDate)}</p>
                              </div>
                              <div className="text-center p-2 bg-muted/30 rounded-md">
                                <p className="text-[10px] sm:text-xs text-muted-foreground">Total Completed</p>
                                <p className="font-semibold text-xs sm:text-sm">{formatCurrency(summary.totalCompleted)}</p>
                              </div>
                              <div className="text-center p-2 bg-muted/30 rounded-md">
                                <p className="text-[10px] sm:text-xs text-muted-foreground">Retainage ({summary.retainagePercent}%)</p>
                                <p className="font-semibold text-xs sm:text-sm">{formatCurrency(summary.retainageAmount)}</p>
                              </div>
                              <div className="text-center p-2 bg-muted/30 rounded-md">
                                <p className="text-[10px] sm:text-xs text-muted-foreground">Balance to Finish</p>
                                <p className="font-semibold text-xs sm:text-sm">{formatCurrency(summary.balanceToFinish)}</p>
                              </div>
                            </div>

                            {app.items && app.items.length > 0 && (
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-xs">#</TableHead>
                                      <TableHead className="text-xs">Description</TableHead>
                                      <TableHead className="text-xs text-right">Scheduled Value</TableHead>
                                      <TableHead className="text-xs text-right">Previously Completed</TableHead>
                                      <TableHead className="text-xs text-right">This Period</TableHead>
                                      <TableHead className="text-xs text-right">Materials Stored</TableHead>
                                      <TableHead className="text-xs text-right">Total Completed</TableHead>
                                      <TableHead className="text-xs text-right">% Complete</TableHead>
                                      <TableHead className="text-xs text-right">Balance</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {app.items.map(item => {
                                      const totalCompleted = (item.previouslyCompleted || 0) + (item.thisPeriodsWork || 0) + (item.materialsStored || 0);
                                      const pctComplete = item.scheduledValue > 0 ? (totalCompleted / item.scheduledValue) * 100 : 0;
                                      const balance = item.scheduledValue - totalCompleted;
                                      return (
                                        <TableRow key={item.id}>
                                          <TableCell className="text-xs">{item.itemNumber}</TableCell>
                                          <TableCell className="text-xs">{item.description}</TableCell>
                                          <TableCell className="text-xs text-right">{formatCurrency(item.scheduledValue)}</TableCell>
                                          <TableCell className="text-xs text-right">{formatCurrency(item.previouslyCompleted)}</TableCell>
                                          <TableCell className="text-xs text-right">{formatCurrency(item.thisPeriodsWork)}</TableCell>
                                          <TableCell className="text-xs text-right">{formatCurrency(item.materialsStored)}</TableCell>
                                          <TableCell className="text-xs text-right font-medium">{formatCurrency(totalCompleted)}</TableCell>
                                          <TableCell className="text-xs text-right">{pctComplete.toFixed(1)}%</TableCell>
                                          <TableCell className="text-xs text-right">{formatCurrency(balance)}</TableCell>
                                        </TableRow>
                                      );
                                    })}
                                    <TableRow className="bg-muted/30 font-semibold">
                                      <TableCell className="text-xs" colSpan={2}>Totals</TableCell>
                                      <TableCell className="text-xs text-right">{formatCurrency(summary.totalScheduledValue)}</TableCell>
                                      <TableCell className="text-xs text-right">{formatCurrency(app.items.reduce((s, i) => s + (i.previouslyCompleted || 0), 0))}</TableCell>
                                      <TableCell className="text-xs text-right">{formatCurrency(app.items.reduce((s, i) => s + (i.thisPeriodsWork || 0), 0))}</TableCell>
                                      <TableCell className="text-xs text-right">{formatCurrency(app.items.reduce((s, i) => s + (i.materialsStored || 0), 0))}</TableCell>
                                      <TableCell className="text-xs text-right">{formatCurrency(summary.totalCompleted)}</TableCell>
                                      <TableCell className="text-xs text-right">{summary.percentComplete.toFixed(1)}%</TableCell>
                                      <TableCell className="text-xs text-right">{formatCurrency(summary.balanceToFinish)}</TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleOpenLineItems(app)} data-testid={`button-edit-items-${app.id}`}>
                                <Edit className="w-3 h-3 mr-1" />
                                Edit Line Items
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleOpenEdit(app)} data-testid={`button-edit-app-${app.id}`}>
                                <Edit className="w-3 h-3 mr-1" />
                                Edit Details
                              </Button>
                              {app.status === "draft" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    updateMutation.mutate({ id: app.id, status: "submitted" });
                                  }}
                                  data-testid={`button-submit-app-${app.id}`}
                                >
                                  Submit
                                </Button>
                              )}
                              {app.status === "submitted" && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-green-600"
                                  onClick={() => {
                                    updateMutation.mutate({ id: app.id, status: "approved" });
                                  }}
                                  data-testid={`button-approve-app-${app.id}`}
                                >
                                  Approve
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  window.open(`/api/pay-application/${app.id}/pdf`, "_blank");
                                }}
                                data-testid={`button-pdf-app-${app.id}`}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                PDF
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                                onClick={() => {
                                  setSelectedApp(app);
                                  setDeleteDialogOpen(true);
                                }}
                                data-testid={`button-delete-app-${app.id}`}
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Pay Application Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Pay Application (G702)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid gap-2">
              <Label><span className="text-red-500">*</span> Project</Label>
              <Select value={newProjectId} onValueChange={setNewProjectId}>
                <SelectTrigger data-testid="select-new-app-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {activeProjects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label><span className="text-red-500">*</span> Period To</Label>
                <Input type="date" value={newPeriodTo} onChange={e => setNewPeriodTo(e.target.value)} data-testid="input-new-app-period" />
              </div>
              <div className="grid gap-2">
                <Label>Contract Date</Label>
                <Input type="date" value={newContractDate} onChange={e => setNewContractDate(e.target.value)} data-testid="input-new-app-contract-date" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Original Contract Sum ($)</Label>
                <Input type="number" min="0" value={newOriginalContractSum} onChange={e => setNewOriginalContractSum(e.target.value)} data-testid="input-new-app-contract-sum" />
              </div>
              <div className="grid gap-2">
                <Label>Net Change Orders ($)</Label>
                <Input type="number" value={newNetChange} onChange={e => setNewNetChange(e.target.value)} data-testid="input-new-app-net-change" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Retainage (%)</Label>
              <Input type="number" min="0" max="100" step="0.5" value={newRetainagePercent} onChange={e => setNewRetainagePercent(e.target.value)} data-testid="input-new-app-retainage" />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Optional notes..." data-testid="input-new-app-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-submit-new-app">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pay Application Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Pay Application #{selectedApp?.applicationNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label><span className="text-red-500">*</span> Period To</Label>
                <Input type="date" value={newPeriodTo} onChange={e => setNewPeriodTo(e.target.value)} data-testid="input-edit-app-period" />
              </div>
              <div className="grid gap-2">
                <Label>Contract Date</Label>
                <Input type="date" value={newContractDate} onChange={e => setNewContractDate(e.target.value)} data-testid="input-edit-app-contract-date" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Original Contract Sum ($)</Label>
                <Input type="number" min="0" value={newOriginalContractSum} onChange={e => setNewOriginalContractSum(e.target.value)} data-testid="input-edit-app-contract-sum" />
              </div>
              <div className="grid gap-2">
                <Label>Net Change Orders ($)</Label>
                <Input type="number" value={newNetChange} onChange={e => setNewNetChange(e.target.value)} data-testid="input-edit-app-net-change" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Retainage (%)</Label>
              <Input type="number" min="0" max="100" step="0.5" value={newRetainagePercent} onChange={e => setNewRetainagePercent(e.target.value)} data-testid="input-edit-app-retainage" />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Optional notes..." data-testid="input-edit-app-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-save-edit-app">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Line Items Dialog (G703 Continuation Sheet) */}
      <Dialog open={lineItemsDialogOpen} onOpenChange={setLineItemsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              G703 Continuation Sheet - Application #{selectedApp?.applicationNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {lineItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tasks found for this project. Add tasks with scheduled values first.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-12">#</TableHead>
                      <TableHead className="text-xs min-w-[150px]">Description of Work</TableHead>
                      <TableHead className="text-xs text-right w-[120px]">Scheduled Value ($)</TableHead>
                      <TableHead className="text-xs text-right w-[120px]">Previously Completed ($)</TableHead>
                      <TableHead className="text-xs text-right w-[120px]">This Period ($)</TableHead>
                      <TableHead className="text-xs text-right w-[120px]">Materials Stored ($)</TableHead>
                      <TableHead className="text-xs text-right w-[100px]">Total</TableHead>
                      <TableHead className="text-xs text-right w-[60px]">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item, idx) => {
                      const total = item.previouslyCompleted + item.thisPeriodsWork + item.materialsStored;
                      const pct = item.scheduledValue > 0 ? (total / item.scheduledValue) * 100 : 0;
                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{item.itemNumber}</TableCell>
                          <TableCell className="text-xs">{item.description}</TableCell>
                          <TableCell className="text-right p-1">
                            <Input
                              type="number"
                              min="0"
                              className="text-xs text-right h-8 w-full"
                              value={item.scheduledValue}
                              onChange={e => updateLineItem(idx, "scheduledValue", parseInt(e.target.value) || 0)}
                              data-testid={`input-item-scheduled-value-${idx}`}
                            />
                          </TableCell>
                          <TableCell className="text-right p-1">
                            <Input
                              type="number"
                              min="0"
                              className="text-xs text-right h-8 w-full"
                              value={item.previouslyCompleted}
                              onChange={e => updateLineItem(idx, "previouslyCompleted", parseInt(e.target.value) || 0)}
                              data-testid={`input-item-prev-completed-${idx}`}
                            />
                          </TableCell>
                          <TableCell className="text-right p-1">
                            <Input
                              type="number"
                              min="0"
                              className="text-xs text-right h-8 w-full"
                              value={item.thisPeriodsWork}
                              onChange={e => updateLineItem(idx, "thisPeriodsWork", parseInt(e.target.value) || 0)}
                              data-testid={`input-item-this-period-${idx}`}
                            />
                          </TableCell>
                          <TableCell className="text-right p-1">
                            <Input
                              type="number"
                              min="0"
                              className="text-xs text-right h-8 w-full"
                              value={item.materialsStored}
                              onChange={e => updateLineItem(idx, "materialsStored", parseInt(e.target.value) || 0)}
                              data-testid={`input-item-materials-${idx}`}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium">{formatCurrency(total)}</TableCell>
                          <TableCell className="text-xs text-right">{pct.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell className="text-xs" colSpan={2}>Totals</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(lineItems.reduce((s, i) => s + i.scheduledValue, 0))}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(lineItems.reduce((s, i) => s + i.previouslyCompleted, 0))}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(lineItems.reduce((s, i) => s + i.thisPeriodsWork, 0))}</TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(lineItems.reduce((s, i) => s + i.materialsStored, 0))}</TableCell>
                      <TableCell className="text-xs text-right">
                        {formatCurrency(lineItems.reduce((s, i) => s + i.previouslyCompleted + i.thisPeriodsWork + i.materialsStored, 0))}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {(() => {
                          const totalSched = lineItems.reduce((s, i) => s + i.scheduledValue, 0);
                          const totalComp = lineItems.reduce((s, i) => s + i.previouslyCompleted + i.thisPeriodsWork + i.materialsStored, 0);
                          return totalSched > 0 ? ((totalComp / totalSched) * 100).toFixed(1) + "%" : "0.0%";
                        })()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineItemsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveLineItems} disabled={saveItemsMutation.isPending || lineItems.length === 0} data-testid="button-save-line-items">
              {saveItemsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Line Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pay Application</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Application #{selectedApp?.applicationNumber}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-app">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedApp && deleteMutation.mutate(selectedApp.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-app"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
