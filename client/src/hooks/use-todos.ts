import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import type {
  InsertTodo, TodoWithDetails, MyWorkSummary, Notification,
  WorkflowRuleWithDetails, InsertWorkflowRule, ActivityLog, ProjectStatusHistory,
  TodoUpdateWithAuthor, TodoUpdatesPage,
} from "@shared/schema";

// Client-local date (YYYY-MM-DD) — sent to the server so due-date bucketing
// (overdue / due today) matches the user's timezone, not the server's.
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Pulls the human-readable message out of apiRequest errors ("403: {json}")
export function extractApiError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const match = err.message.match(/^\d{3}: ([\s\S]*)$/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed?.message) return parsed.message;
      } catch {
        return match[1] || fallback;
      }
    }
    return err.message || fallback;
  }
  return fallback;
}

export type TodoQueryFilters = {
  assignedToUserId?: string; // 'me' for the signed-in user
  projectId?: number;
  status?: string; // 'active' | 'open' | 'in_progress' | 'completed' | 'cancelled' | 'all'
  priority?: string;
  due?: string;
};

function todoQueryUrl(filters: TodoQueryFilters): string {
  const params = new URLSearchParams();
  if (filters.assignedToUserId) params.set("assignedToUserId", filters.assignedToUserId);
  if (filters.projectId !== undefined) params.set("projectId", String(filters.projectId));
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.due) params.set("due", filters.due);
  params.set("today", localToday());
  return `${api.todos.list.path}?${params.toString()}`;
}

function invalidateTodoData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: [api.todos.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.todos.myWorkSummary.path] });
  queryClient.invalidateQueries({ queryKey: [api.activity.listForProject.path] });
  queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
  queryClient.invalidateQueries({ queryKey: [api.notifications.unreadCount.path] });
}

// ---------- Todos ----------

export function useTodos(filters: TodoQueryFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [api.todos.list.path, filters],
    queryFn: async () => {
      const res = await fetch(todoQueryUrl(filters), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch todos");
      return (await res.json()) as TodoWithDetails[];
    },
    enabled: options?.enabled ?? true,
  });
}

export function useMyWorkSummary() {
  return useQuery({
    queryKey: [api.todos.myWorkSummary.path],
    queryFn: async () => {
      const res = await fetch(`${api.todos.myWorkSummary.path}?today=${localToday()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return (await res.json()) as MyWorkSummary;
    },
  });
}

export type CreateTodoInput = {
  title: string;
  description?: string | null;
  assignedToUserId: string;
  projectId?: number | null;
  dueDate?: string | null;
  priority?: string;
  status?: string;
};

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTodoInput) => {
      const res = await apiRequest("POST", api.todos.create.path, data);
      return (await res.json()) as TodoWithDetails;
    },
    onSuccess: () => invalidateTodoData(queryClient),
  });
}

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<CreateTodoInput>) => {
      const res = await apiRequest("PUT", buildUrl(api.todos.update.path, { id }), updates);
      return (await res.json()) as TodoWithDetails;
    },
    onSuccess: () => invalidateTodoData(queryClient),
  });
}

export function useCompleteTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", buildUrl(api.todos.complete.path, { id }));
      return (await res.json()) as TodoWithDetails;
    },
    onSuccess: (todo) => {
      invalidateTodoData(queryClient);
      if (todo.relatedEntityType === "opportunity" && todo.relatedEntityId) {
        queryClient.invalidateQueries({ queryKey: ["/api/opportunities", todo.relatedEntityId, "todos"] });
        queryClient.invalidateQueries({ queryKey: [api.opportunities.activity.path, todo.relatedEntityId] });
        queryClient.invalidateQueries({ queryKey: [api.opportunities.dashboard.path] });
      }
    },
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.todos.delete.path, { id }));
    },
    onSuccess: () => invalidateTodoData(queryClient),
  });
}

export function useTodo(id: number | undefined) {
  return useQuery({
    queryKey: [api.todos.get.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.todos.get.path, { id: id! }), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch todo");
      return (await res.json()) as TodoWithDetails;
    },
    enabled: !!id,
  });
}

// ---------- Todo Updates (notes / progress timeline) ----------

export function useTodoUpdates(todoId: number | undefined, limit: number) {
  return useQuery({
    queryKey: [api.todoUpdates.list.path, todoId, limit],
    queryFn: async () => {
      const url = `${buildUrl(api.todoUpdates.list.path, { id: todoId! })}?limit=${limit}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch updates");
      return (await res.json()) as TodoUpdatesPage;
    },
    enabled: !!todoId,
  });
}

function invalidateTodoUpdates(queryClient: QueryClient, todoId: number) {
  queryClient.invalidateQueries({ queryKey: [api.todoUpdates.list.path, todoId] });
  queryClient.invalidateQueries({ queryKey: [api.todos.list.path] }); // 💬 counts on cards
  queryClient.invalidateQueries({ queryKey: [api.todos.get.path, todoId] });
  queryClient.invalidateQueries({ queryKey: [api.activity.listForProject.path] }); // project activity feed
}

export function useAddTodoUpdate(todoId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", buildUrl(api.todoUpdates.create.path, { id: todoId }), { body });
      return (await res.json()) as TodoUpdateWithAuthor;
    },
    onSuccess: () => invalidateTodoUpdates(queryClient, todoId),
  });
}

export function useEditTodoUpdate(todoId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) => {
      const res = await apiRequest("PUT", buildUrl(api.todoUpdates.update.path, { id }), { body });
      return (await res.json()) as TodoUpdateWithAuthor;
    },
    onSuccess: () => invalidateTodoUpdates(queryClient, todoId),
  });
}

export function useDeleteTodoUpdate(todoId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.todoUpdates.delete.path, { id }));
    },
    onSuccess: () => invalidateTodoUpdates(queryClient, todoId),
  });
}

// ---------- Grouping helper (My Work + Project Todos tab) ----------

export type TodoGroups = {
  overdue: TodoWithDetails[];
  dueToday: TodoWithDetails[];
  upcoming: TodoWithDetails[];
  noDueDate: TodoWithDetails[];
  done: TodoWithDetails[]; // completed + cancelled
};

export function groupTodos(todos: TodoWithDetails[], today: string): TodoGroups {
  const groups: TodoGroups = { overdue: [], dueToday: [], upcoming: [], noDueDate: [], done: [] };
  for (const todo of todos) {
    if (todo.status === "completed" || todo.status === "cancelled") {
      groups.done.push(todo);
    } else if (!todo.dueDate) {
      groups.noDueDate.push(todo);
    } else if (todo.dueDate < today) {
      groups.overdue.push(todo);
    } else if (todo.dueDate === today) {
      groups.dueToday.push(todo);
    } else {
      groups.upcoming.push(todo);
    }
  }
  return groups;
}

// ---------- Notifications ----------

export function useNotifications(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [api.notifications.list.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return (await res.json()) as Notification[];
    },
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: [api.notifications.unreadCount.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.unreadCount.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch unread count");
      return (await res.json()) as { count: number };
    },
    refetchInterval: 30_000, // header bell polls for new notifications
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", buildUrl(api.notifications.markRead.path, { id }));
      return (await res.json()) as Notification;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.notifications.unreadCount.path] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", api.notifications.markAllRead.path);
      return (await res.json()) as { updated: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.notifications.unreadCount.path] });
    },
  });
}

// ---------- Workflow Rules (admin) ----------

export function useWorkflowRules() {
  return useQuery({
    queryKey: [api.workflowRules.list.path],
    queryFn: async () => {
      const res = await fetch(api.workflowRules.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch workflow rules");
      return (await res.json()) as WorkflowRuleWithDetails[];
    },
  });
}

export function useCreateWorkflowRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertWorkflowRule) => {
      const res = await apiRequest("POST", api.workflowRules.create.path, data);
      return await res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.workflowRules.list.path] }),
  });
}

export function useUpdateWorkflowRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertWorkflowRule>) => {
      const res = await apiRequest("PUT", buildUrl(api.workflowRules.update.path, { id }), updates);
      return await res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.workflowRules.list.path] }),
  });
}

export function useDeleteWorkflowRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.workflowRules.delete.path, { id }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.workflowRules.list.path] }),
  });
}

// ---------- Project Activity & Status History ----------

export function useProjectActivity(projectId: number) {
  return useQuery({
    queryKey: [api.activity.listForProject.path, projectId],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.activity.listForProject.path, { projectId }), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return (await res.json()) as ActivityLog[];
    },
    enabled: !!projectId,
  });
}

export function useProjectStatusHistory(projectId: number) {
  return useQuery({
    queryKey: [api.projectStatusHistory.list.path, projectId],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.projectStatusHistory.list.path, { projectId }), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch status history");
      return (await res.json()) as ProjectStatusHistory[];
    },
    enabled: !!projectId,
  });
}

// ---------- Users (assignee dropdowns) ----------

export type AppUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  isAuthorized: string;
};

export function useAppUsers() {
  return useQuery({
    queryKey: [api.users.list.path],
    queryFn: async () => {
      const res = await fetch(api.users.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return (await res.json()) as AppUser[];
    },
  });
}

export function userDisplayName(u: { firstName?: string | null; lastName?: string | null; email?: string | null } | undefined | null): string {
  if (!u) return "Unknown";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || "Unknown";
}
