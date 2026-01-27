import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, Calendar, Cloud, CloudRain, Sun, Download, FileText } from "lucide-react";
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
}

export function DailyReportsTab({ project }: DailyReportsTabProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [showNewReportDialog, setShowNewReportDialog] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateReportId, setDuplicateReportId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: reports = [], isLoading: reportsLoading } = useQuery<DailyReport[]>({
    queryKey: ['/api/projects', project.id, 'reports'],
  });

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
    createReportMutation.mutate(selectedDate);
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">Daily Reports</h3>
        <Button onClick={() => setShowNewReportDialog(true)} data-testid="button-new-report" className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" /> Create New Report
        </Button>
      </div>

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
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report Date</TableHead>
                  <TableHead>Weather</TableHead>
                  <TableHead>Last Updated</TableHead>
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
                    <TableCell>
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
                    <TableCell className="text-muted-foreground">
                      {report.updatedAt ? format(new Date(report.updatedAt), "MMM d, h:mm a") : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={report.status === "completed" ? "default" : "secondary"}>
                        {report.status === "completed" ? "Completed" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`/api/reports/${report.id}/pdf`, "_blank")}
                          data-testid={`button-download-pdf-${report.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
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

      {/* New Report Dialog */}
      <Dialog open={showNewReportDialog} onOpenChange={setShowNewReportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Daily Report</DialogTitle>
            <DialogDescription>
              Select a date for the new report. Default is today.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-date">
                <span className="text-destructive">*</span> Report Date
              </Label>
              <Input
                id="report-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                data-testid="input-report-date"
              />
            </div>
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
              A report for {safeFormatDate(selectedDate, 'MMM d, yyyy')} already exists.
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
