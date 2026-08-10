import { format } from "date-fns";
import { Activity as ActivityIcon, AlertTriangle, ArrowRightLeft, CheckCircle2, ClipboardList, Bell, Bot, Trash2, User as UserIcon, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectActivity } from "@/hooks/use-todos";
import { cn } from "@/lib/utils";
import type { ActivityLog } from "@shared/schema";

function activityIcon(action: string) {
  if (action === "project_status_changed") return ArrowRightLeft;
  if (action === "todo_completed") return CheckCircle2;
  if (action === "todo_deleted") return Trash2;
  if (action === "workflow_todo_created") return Zap;
  if (action === "workflow_notification_sent") return Bell;
  if (action === "workflow_skipped") return AlertTriangle;
  if (action.startsWith("todo_")) return ClipboardList;
  return ActivityIcon;
}

function iconColor(action: string): string {
  if (action === "project_status_changed") return "text-blue-500 bg-blue-500/10";
  if (action === "todo_completed") return "text-green-500 bg-green-500/10";
  if (action === "todo_deleted") return "text-red-500 bg-red-500/10";
  if (action.startsWith("workflow_")) return "text-amber-500 bg-amber-500/10";
  return "text-muted-foreground bg-muted";
}

export function ProjectActivityTab({ projectId }: { projectId: number }) {
  const { data: activity = [], isLoading } = useProjectActivity(projectId);

  // Group entries by calendar day for scannability
  const byDay: { day: string; entries: ActivityLog[] }[] = [];
  for (const entry of activity) {
    const day = entry.createdAt ? format(new Date(entry.createdAt as unknown as string), "EEEE, MMM d, yyyy") : "Unknown date";
    const last = byDay[byDay.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else byDay.push({ day, entries: [entry] });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <ActivityIcon className="w-5 h-5 text-primary" />
        Activity
      </h2>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : activity.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <ActivityIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No activity yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Status changes, todos, and workflow actions will show up here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {byDay.map(group => (
            <div key={group.day}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.day}</p>
              <div className="space-y-1.5">
                {group.entries.map(entry => {
                  const Icon = activityIcon(entry.action);
                  const isSystem = !entry.actorUserId;
                  return (
                    <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card" data-testid={`activity-entry-${entry.id}`}>
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", iconColor(entry.action))}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug break-words">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            {isSystem ? <Bot className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                            {entry.actorName}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {entry.createdAt ? format(new Date(entry.createdAt as unknown as string), "h:mm a") : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
