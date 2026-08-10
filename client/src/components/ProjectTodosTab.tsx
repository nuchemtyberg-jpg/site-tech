import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Plus, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoItem } from "@/components/TodoItem";
import { TodoForm } from "@/components/TodoForm";
import { useTodos, useTodo, useAppUsers, groupTodos, localToday, userDisplayName } from "@/hooks/use-todos";
import { cn } from "@/lib/utils";
import type { TodoWithDetails } from "@shared/schema";

const VIEWS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
] as const;

function SectionHeader({ label, count, className }: { label: string; count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-wide mt-4 mb-2 first:mt-0", className)}>
      {label} <span className="opacity-70">({count})</span>
    </p>
  );
}

export function ProjectTodosTab({ projectId }: { projectId: number }) {
  const today = localToday();
  const { data: todos = [], isLoading } = useTodos({ projectId, status: "all" });
  const { data: users = [] } = useAppUsers();

  const [view, setView] = useState<string>("open");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoWithDetails | null>(null);

  const filtered = useMemo(() => {
    return todos.filter(t => {
      if (view === "open" && t.status !== "open") return false;
      if (view === "in_progress" && t.status !== "in_progress") return false;
      if (view === "completed" && t.status !== "completed") return false;
      if (assigneeFilter !== "all" && t.assignedToUserId !== assigneeFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (dueFilter !== "all") {
        const active = t.status === "open" || t.status === "in_progress";
        if (dueFilter === "overdue" && !(active && t.dueDate && t.dueDate < today)) return false;
        if (dueFilter === "today" && t.dueDate !== today) return false;
        if (dueFilter === "this_week") {
          if (!t.dueDate || t.dueDate < today) return false;
          const end = new Date(`${today}T00:00:00`);
          end.setDate(end.getDate() + (6 - end.getDay()));
          const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
          if (t.dueDate > endStr) return false;
        }
        if (dueFilter === "no_due_date" && t.dueDate) return false;
      }
      return true;
    });
  }, [todos, view, assigneeFilter, priorityFilter, dueFilter, today]);

  const groups = useMemo(() => groupTodos(filtered, today), [filtered, today]);
  const hasFilters = assigneeFilter !== "all" || priorityFilter !== "all" || dueFilter !== "all";

  const openEdit = (todo: TodoWithDetails) => { setEditingTodo(todo); setFormOpen(true); };
  const openCreate = () => { setEditingTodo(null); setFormOpen(true); };

  // Deep-link: ?tab=todos&todo=<id> (from a notification) auto-opens that todo's dialog
  const search = useSearch();
  const urlTodoId = useMemo(() => {
    const raw = new URLSearchParams(search).get("todo");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [search]);
  const handledUrlTodoRef = useRef<number | null>(null);
  const { data: urlTodo } = useTodo(urlTodoId);
  useEffect(() => {
    if (!urlTodoId) { handledUrlTodoRef.current = null; return; }
    if (!urlTodo || handledUrlTodoRef.current === urlTodoId) return;
    handledUrlTodoRef.current = urlTodoId;
    setEditingTodo(urlTodo);
    setFormOpen(true);
    // Strip the param so refresh / back doesn't reopen the dialog
    const url = new URL(window.location.href);
    url.searchParams.delete("todo");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [urlTodo, urlTodoId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-primary" />
          Todos
        </h2>
        <Button onClick={openCreate} className="min-h-[44px]" data-testid="button-add-todo-project">
          <Plus className="w-4 h-4 mr-2" />Add Todo
        </Button>
      </div>

      {/* Status view segmented control */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit max-w-full overflow-x-auto">
        {VIEWS.map(v => (
          <button
            key={v.value}
            type="button"
            onClick={() => setView(v.value)}
            className={cn(
              "px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors min-h-[40px]",
              view === v.value ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`button-todo-view-${v.value}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-auto min-w-[130px] h-10" data-testid="select-filter-assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{userDisplayName(u)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-auto min-w-[120px] h-10" data-testid="select-filter-priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dueFilter} onValueChange={setDueFilter}>
          <SelectTrigger className="w-auto min-w-[120px] h-10" data-testid="select-filter-due">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any due date</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="this_week">This week</SelectItem>
            <SelectItem value="no_due_date">No due date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lists */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <ListTodo className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {todos.length === 0
              ? "No todos for this project yet."
              : hasFilters ? "No todos match these filters." : `No ${view === "all" ? "" : VIEWS.find(v => v.value === view)?.label.toLowerCase() + " "}todos.`}
          </p>
          {todos.length === 0 && (
            <Button variant="outline" onClick={openCreate} className="mt-3 min-h-[44px]" data-testid="button-add-first-todo">
              <Plus className="w-4 h-4 mr-2" />Add the first todo
            </Button>
          )}
        </div>
      ) : (
        <div>
          <SectionHeader label="Overdue" count={groups.overdue.length} className="text-red-500" />
          <div className="space-y-2">{groups.overdue.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} />)}</div>

          <SectionHeader label="Due Today" count={groups.dueToday.length} className="text-orange-500" />
          <div className="space-y-2">{groups.dueToday.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} />)}</div>

          <SectionHeader label="Upcoming" count={groups.upcoming.length} className="text-muted-foreground" />
          <div className="space-y-2">{groups.upcoming.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} />)}</div>

          <SectionHeader label="No Due Date" count={groups.noDueDate.length} className="text-muted-foreground" />
          <div className="space-y-2">{groups.noDueDate.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} />)}</div>

          <SectionHeader label="Completed" count={groups.done.length} className="text-green-600" />
          <div className="space-y-2">{groups.done.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} />)}</div>
        </div>
      )}

      <TodoForm open={formOpen} onOpenChange={setFormOpen} todo={editingTodo} defaultProjectId={projectId} />
    </div>
  );
}
