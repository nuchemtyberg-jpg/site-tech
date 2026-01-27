import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Trash2, Calendar, Cloud, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { DailyReport } from "@shared/schema";

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

interface DailyReportsTabProps {
  projectId: number;
  projectAddress?: string;
  projectCity?: string;
  projectState?: string;
}

export function DailyReportsTab({ projectId }: DailyReportsTabProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);

  const { data: reports = [], isLoading: reportsLoading } = useQuery<DailyReport[]>({
    queryKey: ['/api/projects', projectId, 'reports'],
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'reports'] });
      setDeleteReportId(null);
      toast({ title: "Report deleted" });
    },
  });

  function handleNewReport() {
    setLocation(`/projects/${projectId}/reports/new`);
  }

  function handleOpenReport(reportId: number) {
    setLocation(`/projects/${projectId}/reports/${reportId}`);
  }

  if (reportsLoading) {
    return <div className="text-black">Loading reports...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-semibold text-black">Daily Reports</h3>
        <Button onClick={handleNewReport} data-testid="button-new-report" className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" /> New Report
        </Button>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h4 className="text-lg font-medium text-black mb-2">No Reports Yet</h4>
          <p className="text-sm text-gray-600 mb-4">Create your first daily report to start tracking work progress.</p>
          <Button onClick={handleNewReport} data-testid="button-new-report-empty">
            <Plus className="w-4 h-4 mr-2" /> Create First Report
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(report => (
            <Card 
              key={report.id}
              className="cursor-pointer hover-elevate bg-white border-gray-200"
              onClick={() => handleOpenReport(report.id)}
              data-testid={`card-report-${report.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span className="font-medium text-black">
                        {safeFormatDate(report.reportDate, 'MMM d, yyyy')}
                      </span>
                      {report.isSigned && (
                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      )}
                    </div>
                    {report.weather && (
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Cloud className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{report.weather} - {report.temperature}</span>
                      </div>
                    )}
                    {report.isSigned && report.signedByName && (
                      <p className="text-xs text-green-600 mt-1">
                        Signed by {report.signedByName}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteReportId(report.id);
                    }}
                    data-testid={`button-delete-report-${report.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteReportId} onOpenChange={() => setDeleteReportId(null)}>
        <AlertDialogContent className="bg-white mx-4 max-w-sm sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black">Delete Report?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600">
              This action cannot be undone. All tasks and deliveries associated with this report will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto text-black">Cancel</AlertDialogCancel>
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
