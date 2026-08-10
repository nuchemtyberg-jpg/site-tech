import { useRef } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Circle, CheckCircle2, MessageSquare, MoreVertical, Pencil, Play, RotateCcw, Trash2, FolderKanban, User as UserIcon, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCompleteTodo, useUpdateTodo, useDeleteTodo, extractApiError, localToday } from "@/hooks/use-todos";
import { cn } from "@/lib/utils";
import type { TodoWithDetails } from "@shared/schema";

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  normal: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  urgent: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low", normal: "Normal", high: "High", urgent: "Urgent",
};

function formatDueDate(dateStr: string): string {
  return format(new Date(`${dateStr}T00:00:00`), "MMM d");
}

export function TodoItem({ todo, onEdit, showProject = false }: {
  todo: TodoWithDetails;
  onEdit: (todo: TodoWithDetails) => void;
  showProject?: boolean;
}) {
  const { user, isManager } = useAuth();
  const { toast } = useToast();
  const completeTodo = useCompleteTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const completingRef = useRef(false); // synchronous double-tap guard

  const today = localToday();
  const isDone = todo.status === "completed" || todo.status === "cancelled";
  const isCompleted = todo.status === "completed";
  const isOverdue = !isDone && !!todo.dueDate && todo.dueDate < today;
  const isDueToday = !isDone && todo.dueDate === today;

  const canManage = isManager || todo.createdByUserId === user?.id;
  const canComplete = canManage || todo.assignedToUserId === user?.id;
  const canDelete = (user?.role === "admin" || todo.createdByUserId === user?.id) && !isCompleted;

  const handleQuickComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDone || !canComplete || completingRef.current) return;
    completingRef.current = true;
    completeTodo.mutate(todo.id, {
      onSuccess: () => toast({ title: "Todo completed", description: todo.title }),
      onError: (err) => toast({ title: "Couldn't complete todo", description: extractApiError(err, "Please try again."), variant: "destructive" }),
      onSettled: () => { completingRef.current = false; },
    });
  };

  const handleStatusChange = (status: string) => {
    updateTodo.mutate({ id: todo.id, status }, {
      onError: (err) => toast({ title: "Couldn't update todo", description: extractApiError(err, "Please try again."), variant: "destructive" }),
    });
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors cursor-pointer",
        isDone && "opacity-60",
      )}
      onClick={() => onEdit(todo)}
      data-testid={`todo-item-${todo.id}`}
    >
      <button
        type="button"
        onClick={handleQuickComplete}
        disabled={isDone || !canComplete}
        className={cn(
          "flex-shrink-0 mt-0.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full transition-colors",
          !isDone && canComplete && "hover:bg-green-500/10",
        )}
        title={isCompleted ? "Completed" : canComplete ? "Mark complete" : undefined}
        data-testid={`button-complete-todo-${todo.id}`}
      >
        {isCompleted ? (
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        ) : (
          <Circle className={cn("w-6 h-6", canComplete ? "text-muted-foreground hover:text-green-500" : "text-muted-foreground/40")} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className={cn("text-sm font-medium leading-snug break-words", isDone && "line-through text-muted-foreground")}>
            {todo.title}
          </p>
          {todo.source === "workflow" && (
            <span title="Created automatically by a workflow rule"><Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" /></span>
          )}
        </div>
        {todo.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{todo.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {todo.status === "in_progress" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/50 text-blue-600 dark:text-blue-400">In Progress</Badge>
          )}
          {todo.status === "cancelled" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Cancelled</Badge>
          )}
          {isCompleted && todo.completedAt && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/50 text-green-600 dark:text-green-400">
              Done {format(new Date(todo.completedAt as unknown as string), "MMM d")}
            </Badge>
          )}
          {!isDone && todo.dueDate && (
            <Badge
              variant={isOverdue ? "destructive" : "outline"}
              className={cn(
                "text-[10px] px-1.5 py-0",
                isDueToday && "border-orange-500 text-orange-600 dark:text-orange-400",
              )}
            >
              {isOverdue ? `Overdue · ${formatDueDate(todo.dueDate)}` : isDueToday ? "Due Today" : `Due ${formatDueDate(todo.dueDate)}`}
            </Badge>
          )}
          {todo.priority !== "normal" && (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", PRIORITY_STYLES[todo.priority] || PRIORITY_STYLES.normal)}>
              {PRIORITY_LABELS[todo.priority] || todo.priority}
            </span>
          )}
          {todo.assignedToName && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <UserIcon className="w-3 h-3" />{todo.assignedToName}
            </span>
          )}
          {(todo.updateCount ?? 0) > 0 && (
            <span
              className="text-[10px] text-muted-foreground flex items-center gap-0.5"
              title={`${todo.updateCount} update${todo.updateCount === 1 ? "" : "s"}`}
              data-testid={`badge-update-count-${todo.id}`}
            >
              <MessageSquare className="w-3 h-3" />{todo.updateCount}
            </span>
          )}
          {showProject && todo.projectId && todo.projectName && (
            <Link
              href={`/projects/${todo.projectId}?tab=todos`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              data-testid={`link-todo-project-${todo.id}`}
            >
              <FolderKanban className="w-3 h-3" />{todo.projectName}
            </Link>
          )}
          {showProject && todo.relatedEntityType === "opportunity" && todo.relatedEntityId && todo.opportunityName && (
            <Link
              href={`/opportunities/${todo.relatedEntityId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              data-testid={`link-todo-opportunity-${todo.id}`}
            >
              <FolderKanban className="w-3 h-3" />{todo.opportunityNumber} {todo.opportunityName}
            </Link>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" data-testid={`button-todo-menu-${todo.id}`}>
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => onEdit(todo)} className="min-h-[40px]">
            <Pencil className="w-4 h-4 mr-2" />{canManage ? "Edit" : "View / Update Status"}
          </DropdownMenuItem>
          {todo.status === "open" && canComplete && (
            <DropdownMenuItem onClick={() => handleStatusChange("in_progress")} className="min-h-[40px]">
              <Play className="w-4 h-4 mr-2" />Start (In Progress)
            </DropdownMenuItem>
          )}
          {isDone && canComplete && (
            <DropdownMenuItem onClick={() => handleStatusChange("open")} className="min-h-[40px]">
              <RotateCcw className="w-4 h-4 mr-2" />Reopen
            </DropdownMenuItem>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="min-h-[40px] text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />Delete
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this todo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{todo.title}" will be removed from all lists. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteTodo.mutate(todo.id, {
                      onSuccess: () => toast({ title: "Todo deleted" }),
                      onError: (err) => toast({ title: "Couldn't delete todo", description: extractApiError(err, "Please try again."), variant: "destructive" }),
                    })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
