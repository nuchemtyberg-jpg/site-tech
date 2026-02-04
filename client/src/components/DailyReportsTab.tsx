import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Trash2, Calendar as CalendarIcon, Cloud, CloudRain, Sun, Download, FileText, Image, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { DailyReport, Project } from "@shared/schema";

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

interface DailyReportsTabProps {
  project: Project;
  onFormVisibilityChange?: (isFormOpen: boolean) => void;
}

export function DailyReportsTab({ project, onFormVisibilityChange }: DailyReportsTabProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [showNewReportDialog, setShowNewReportDialog] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateReportId, setDuplicateReportId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { data: reports = [], isLoading: reportsLoading } = useQuery<DailyReport[]>({
    queryKey: ['/api/projects', project.id, 'reports'],
  });

  // Notify parent when form dialogs open/close
  useEffect(() => {
    const isAnyFormOpen = showNewReportDialog || showDuplicateModal || deleteReportId !== null;
    onFormVisibilityChange?.(isAnyFormOpen);
  }, [showNewReportDialog, showDuplicateModal, deleteReportId, onFormVisibilityChange]);

  const createReportMutation = useMutation({
    mutationFn: async (reportDate: string) => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/reports`, { reportDate });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id, 'reports'] });
      setShowNewReportDialog(false);
      setLocation(`/projects/${project.id}/reports/${data.id}`);
    },
    onError: async (error: any) => {
      if (error.message?.includes("409")) {
        try {
          const errorText = error.message.replace("409: ", "");
          const errorData = JSON.parse(errorText);
          if (errorData.error === "REPORT_EXISTS_FOR_DATE") {
            setDuplicateReportId(errorData.existingReportId);
            setShowNewReportDialog(false);
            setShowDuplicateModal(true);
            return;
          }
        } catch (e) {
          // Fall through
        }
      }
      toast({ title: "Failed to create report", variant: "destructive" });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id, 'reports'] });
      setDeleteReportId(null);
      toast({ title: "Report deleted" });
    },
    onError: (error: any) => {
      if (error.message?.includes("403")) {
        toast({ title: "Cannot delete a completed report", variant: "destructive" });
      } else {
        toast({ title: "Failed to delete report", variant: "destructive" });
      }
    },
  });

  const handleCreateReport = () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    createReportMutation.mutate(dateStr);
  };

  const handleEditExistingReport = () => {
    if (duplicateReportId) {
      setShowDuplicateModal(false);
      setLocation(`/projects/${project.id}/reports/${duplicateReportId}`);
    }
  };

  const handleCreateForAnotherDate = () => {
    setShowDuplicateModal(false);
    setShowNewReportDialog(true);
  };

  function handleOpenReport(reportId: number) {
    setLocation(`/projects/${project.id}/reports/${reportId}`);
  }

  const getWeatherIcon = (summary: string | null) => {
    if (!summary) return <Cloud className="h-4 w-4 text-muted-foreground" />;
    const lower = summary.toLowerCase();
    if (lower.includes("rain") || lower.includes("shower")) return <CloudRain className="h-4 w-4 text-blue-500" />;
    if (lower.includes("sun") || lower.includes("clear")) return <Sun className="h-4 w-4 text-yellow-500" />;
    return <Cloud className="h-4 w-4 text-gray-500" />;
  };

  if (reportsLoading) {
    return <div className="text-foreground">Loading reports...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header */}
      <div className="bg-background pb-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-lg font-semibold text-foreground">Daily Reports</h3>
          <Button onClick={() => setShowNewReportDialog(true)} data-testid="button-new-report" className="h-11 w-full sm:h-9 sm:w-auto">
            <Plus className="w-4 h-4 mr-2" /> Create New Report
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4">

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium text-foreground mb-2">No Reports Yet</h4>
            <p className="text-sm text-muted-foreground mb-4">Create your first daily report to start tracking work progress.</p>
            <Button onClick={() => setShowNewReportDialog(true)} data-testid="button-new-report-empty">
              <Plus className="w-4 h-4 mr-2" /> Create First Report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Report Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Weather</TableHead>
                  <TableHead className="hidden md:table-cell">Date Created</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Updated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map(report => (
                  <TableRow 
                    key={report.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => handleOpenReport(report.id)}
                    data-testid={`row-report-${report.id}`}
                  >
                    <TableCell className="font-medium">
                      {safeFormatDate(report.reportDate, 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        {getWeatherIcon(report.weatherSummary)}
                        <span className="text-sm text-muted-foreground">
                          {report.weatherSummary || "No weather data"}
                        </span>
                        {report.temperature && (
                          <span className="text-sm font-medium">{report.temperature}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {report.createdAt ? format(new Date(report.createdAt), "MMM d, h:mm a") : "N/A"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">
                      {report.updatedAt ? format(new Date(report.updatedAt), "MMM d, h:mm a") : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={report.status === "completed" ? "default" : "secondary"}>
                        {report.status === "completed" ? "Completed" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-download-pdf-${report.id}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => window.open(`/api/reports/${report.id}/pdf`, "_blank")}
                              data-testid={`menu-download-without-photos-${report.id}`}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Without Photos
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => window.open(`/api/reports/${report.id}/pdf?includePhotos=true`, "_blank")}
                              data-testid={`menu-download-with-photos-${report.id}`}
                            >
                              <Image className="h-4 w-4 mr-2" />
                              With Photos
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {report.status !== "completed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteReportId(report.id)}
                            data-testid={`button-delete-report-${report.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      </div>

      {/* New Report Dialog */}
      <Dialog open={showNewReportDialog} onOpenChange={setShowNewReportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Daily Report</DialogTitle>
            <DialogDescription>
              Select a date for the new report. Default is today.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            <Label className="self-start mb-2">
              <span className="text-destructive">*</span> Report Date
            </Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md border"
              data-testid="calendar-report-date"
            />
            <p className="text-sm text-muted-foreground mt-2">
              Selected: {format(selectedDate, "MMMM d, yyyy")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewReportDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateReport}
              disabled={createReportMutation.isPending}
              data-testid="button-create-report"
            >
              {createReportMutation.isPending ? "Creating..." : "Create Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Date Modal */}
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Already Exists</DialogTitle>
            <DialogDescription>
              A report for {format(selectedDate, 'MMM d, yyyy')} already exists.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleCreateForAnotherDate}
              className="w-full sm:w-auto"
            >
              Create Report for Another Date
            </Button>
            <Button
              onClick={handleEditExistingReport}
              className="w-full sm:w-auto"
              data-testid="button-edit-existing-report"
            >
              Edit Existing Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteReportId} onOpenChange={() => setDeleteReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All tasks and deliveries associated with this report will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteReportId && deleteReportMutation.mutate(deleteReportId)}
              className="bg-destructive text-destructive-foreground w-full sm:w-auto"
              data-testid="button-confirm-delete-report"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
