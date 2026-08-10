import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Plus, AlertTriangle, CalendarClock, CalendarDays, ListTodo, ClipboardCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoItem } from "@/components/TodoItem";
import { TodoForm } from "@/components/TodoForm";
import { useTodos, useTodo, useMyWorkSummary, groupTodos, localToday } from "@/hooks/use-todos";
import { cn } from "@/lib/utils";
import type { TodoWithDetails } from "@shared/schema";

type QuickFilter = "all" | "overdue" | "today" | "this_week" | "next_7_days" | "upcoming";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All Open" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "next_7_days", label: "Next 7 Days" },
];

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function endOfWeekStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return addDaysStr(dateStr, 6 - d.getDay());
}

function SectionHeader({ label, count, className }: { label: string; count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-wide mt-5 mb-2 first:mt-0", className)}>
      {label} <span className="opacity-70">({count})</span>
    </p>
  );
}

export default function MyWork() {
  const today = localToday();
  const { data: summary, isLoading: summaryLoading } = useMyWorkSummary();
  const { data: activeTodos = [], isLoading } = useTodos({ assignedToUserId: "me", status: "active" });
  const [showCompleted, setShowCompleted] = useState(false);
  const { data: completedTodos = [] } = useTodos(
    { assignedToUserId: "me", status: "completed" },
    { enabled: showCompleted },
  );

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoWithDetails | null>(null);

  const filtered = useMemo(() => {
    if (quickFilter === "all") return activeTodos;
    return activeTodos.filter(t => {
      switch (quickFilter) {
        case "overdue": return !!t.dueDate && t.dueDate < today;
        case "today": return t.dueDate === today;
        case "this_week": return !!t.dueDate && t.dueDate >= today && t.dueDate <= endOfWeekStr(today);
        case "next_7_days": return !!t.dueDate && t.dueDate >= today && t.dueDate <= addDaysStr(today, 7);
        case "upcoming": return !!t.dueDate && t.dueDate > today;
        default: return true;
      }
    });
  }, [activeTodos, quickFilter, today]);

  const groups = useMemo(() => groupTodos(filtered, today), [filtered, today]);

  const openEdit = (todo: TodoWithDetails) => { setEditingTodo(todo); setFormOpen(true); };
  const openCreate = () => { setEditingTodo(null); setFormOpen(true); };

  // Deep-link: ?todo=<id> (from a notification) auto-opens that todo's dialog
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

  const summaryCards = [
    { key: "overdue", label: "Overdue", value: summary?.overdue ?? 0, icon: AlertTriangle, filter: "overdue" as QuickFilter, accent: "text-red-500", active: quickFilter === "overdue" },
    { key: "dueToday", label: "Due Today", value: summary?.dueToday ?? 0, icon: CalendarClock, filter: "today" as QuickFilter, accent: "text-orange-500", active: quickFilter === "today" },
    { key: "upcoming", label: "Upcoming", value: summary?.upcoming ?? 0, icon: CalendarDays, filter: "upcoming" as QuickFilter, accent: "text-blue-500", active: quickFilter === "upcoming" },
    { key: "open", label: "Open Total", value: summary?.open ?? 0, icon: ListTodo, filter: "all" as QuickFilter, accent: "text-primary", active: quickFilter === "all" },
  ];

  return (
    <div className="space-y-5 pt-14 md:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-my-work-title">
            <ClipboardCheck className="w-6 h-6 text-primary" />
            My Work
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Everything assigned to you, in one place.</p>
        </div>
        <Button onClick={openCreate} className="min-h-[44px]" data-testid="button-add-todo-global">
          <Plus className="w-4 h-4 mr-2" />Add Todo
        </Button>
      </div>

      {/* Summary cards — clickable, filter the list below */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map(card => (
          <Card
            key={card.key}
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50",
              card.active && "border-primary ring-1 ring-primary",
            )}
            onClick={() => setQuickFilter(card.filter)}
            data-testid={`card-summary-${card.key}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{card.label}</p>
                <card.icon className={cn("w-4 h-4", card.accent)} />
              </div>
              {summaryLoading ? (
                <Skeleton className="h-8 w-12 mt-1" />
              ) : (
                <p className={cn("text-2xl font-bold mt-1", card.key === "overdue" && card.value > 0 && "text-red-500")}>
                  {card.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map(f => (
          <button
            key={f.value}
            type="button"
            onClick={() => setQuickFilter(f.value)}
            className={cn(
              "px-3 py-2 rounded-full text-xs font-medium border transition-colors min-h-[36px]",
              quickFilter === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
            )}
            data-testid={`button-quick-filter-${f.value}`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCompleted(s => !s)}
          className={cn(
            "px-3 py-2 rounded-full text-xs font-medium border transition-colors min-h-[36px] flex items-center gap-1.5 ml-auto",
            showCompleted ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/50" : "border-border text-muted-foreground hover:text-foreground",
          )}
          data-testid="button-toggle-completed"
        >
          {showCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          Completed
        </button>
      </div>

      {/* Todo list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 && !showCompleted ? (
        <div className="text-center py-14 border border-dashed border-border rounded-lg">
          <ClipboardCheck className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">
            {activeTodos.length === 0 ? "You're all caught up!" : "Nothing matches this filter."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {activeTodos.length === 0 ? "No open todos assigned to you." : "Try a different quick filter."}
          </p>
        </div>
      ) : (
        <div>
          <SectionHeader label="Overdue" count={groups.overdue.length} className="text-red-500" />
          <div className="space-y-2">{groups.overdue.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} showProject />)}</div>

          <SectionHeader label="Due Today" count={groups.dueToday.length} className="text-orange-500" />
          <div className="space-y-2">{groups.dueToday.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} showProject />)}</div>

          <SectionHeader label="Upcoming" count={groups.upcoming.length} className="text-muted-foreground" />
          <div className="space-y-2">{groups.upcoming.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} showProject />)}</div>

          <SectionHeader label="No Due Date" count={groups.noDueDate.length} className="text-muted-foreground" />
          <div className="space-y-2">{groups.noDueDate.map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} showProject />)}</div>

          {showCompleted && (
            <>
              <SectionHeader label="Recently Completed" count={completedTodos.length} className="text-green-600" />
              <div className="space-y-2">{completedTodos.slice(0, 50).map(t => <TodoItem key={t.id} todo={t} onEdit={openEdit} showProject />)}</div>
              {completedTodos.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">No completed todos yet.</p>
              )}
            </>
          )}
        </div>
      )}

      <TodoForm open={formOpen} onOpenChange={setFormOpen} todo={editingTodo} />
    </div>
  );
}
