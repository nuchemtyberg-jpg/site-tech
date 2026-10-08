import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import type {
  Opportunity, OpportunityWithDetails, OpportunityContactWithDetails,
  InsertOpportunity, InsertOpportunityContact, OpportunityStatusChangeInput,
  OpportunityStatusHistory, ActivityLog, TodoWithDetails, Communication,
  FileWithUploader, FileMetadata,
} from "@shared/schema";
import { localToday } from "@/hooks/use-todos";
import { invalidateDocumentCategoryUsage } from "@/lib/document-category-cache";

export type OpportunityListFilters = {
  status?: string;
  customerId?: number;
  responsibleUserId?: string;
  my?: boolean;
  search?: string;
  source?: string;
  projectType?: string;
  bidDueFrom?: string;
  bidDueTo?: string;
  urgency?: "overdue" | "today" | "tomorrow" | "this_week" | "next_7_days" | "no_due_date";
  archive?: "active" | "archived" | "all";
  outcome?: string;
  sortBy?: "name" | "opportunityNumber" | "customer" | "status" | "responsible" | "bidDueDate" | "expectedValue" | "createdAt" | "updatedAt" | "lastActivity";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  today?: string;
};

export type OpportunitySummary = {
  total: number; active: number; archived: number; overdue: number; dueToday: number; dueTomorrow: number;
  dueNext7Days: number; unassigned: number; outcomes: number; expectedValueTotal: number | null; weightedValueTotal: number | null;
};

export type OpportunityListResponse = {
  items: OpportunityWithDetails[]; total: number; page: number; pageSize: number;
  pageCount: number; statusCounts: Record<string, number>; summary: OpportunitySummary;
  canViewValues: boolean;
};

function opportunityListUrl(filters: OpportunityListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.customerId !== undefined) params.set("customerId", String(filters.customerId));
  if (filters.responsibleUserId) params.set("responsibleUserId", filters.responsibleUserId);
  if (filters.my) params.set("my", "true");
  if (filters.search) params.set("search", filters.search);
  if (filters.source) params.set("source", filters.source);
  if (filters.projectType) params.set("projectType", filters.projectType);
  if (filters.bidDueFrom) params.set("bidDueFrom", filters.bidDueFrom);
  if (filters.bidDueTo) params.set("bidDueTo", filters.bidDueTo);
  if (filters.urgency) params.set("urgency", filters.urgency);
  if (filters.archive) params.set("archive", filters.archive);
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  params.set("today", filters.today || localToday());
  const qs = params.toString();
  return qs ? `${api.opportunities.dashboard.path}?${qs}` : api.opportunities.dashboard.path;
}

export function useOpportunities(filters: OpportunityListFilters = {}) {
  const url = opportunityListUrl(filters);
  return useQuery<OpportunityListResponse>({
    queryKey: [api.opportunities.dashboard.path, filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return (await res.json()) as OpportunityListResponse;
    },
  });
}

function useOpportunitySubresource<T>(id: number | undefined, resource: string) {
  return useQuery<T[]>({
    queryKey: ["/api/opportunities", id, resource],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}/${resource}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: id !== undefined,
  });
}

export function useOpportunityTodos(id: number | undefined) {
  return useOpportunitySubresource<TodoWithDetails>(id, "todos");
}

export function useOpportunityCommunications(id: number | undefined) {
  return useOpportunitySubresource<Communication>(id, "communications");
}

function useCreateOpportunitySubresource<TInput, TResult>(id: number, resource: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => {
      const res = await apiRequest("POST", `/api/opportunities/${id}/${resource}`, input);
      return (await res.json()) as TResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", id, resource] });
      queryClient.invalidateQueries({ queryKey: [api.opportunities.activity.path, id] });
    },
  });
}

export function useCreateOpportunityTodo(id: number) {
  return useCreateOpportunitySubresource<{
    title: string; description?: string | null; assignedToUserId: string;
    dueDate?: string | null; priority?: string;
  }, TodoWithDetails>(id, "todos");
}

export function useCreateOpportunityCommunication(id: number) {
  return useCreateOpportunitySubresource<{
    type: string; subject?: string | null; notes: string; contactId?: number | null;
    contactDate: string; followUpDate?: string | null;
  }, Communication>(id, "communications");
}

export function useOpportunity(id: number | undefined) {
  return useQuery<OpportunityWithDetails>({
    queryKey: [api.opportunities.get.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.opportunities.get.path, { id: id! }), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: id !== undefined,
  });
}

function useInvalidateOpportunities() {
  const queryClient = useQueryClient();
  return (id?: number) => {
    queryClient.invalidateQueries({ queryKey: [api.opportunities.list.path] });
    queryClient.invalidateQueries({ queryKey: [api.opportunities.dashboard.path] });
    // Opportunity edits and awards affect customer rollups, project bid lists,
    // document sources, and the reconciliation preview as well as bidding counts.
    queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/document-tools"] });
    queryClient.invalidateQueries({ queryKey: ["/api/opportunities/award-catch-up"] });
    if (id !== undefined) {
      queryClient.invalidateQueries({ queryKey: [api.opportunities.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.opportunities.statusHistory.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.opportunities.activity.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.opportunityContacts.list.path, id] });
    }
  };
}

export function useCreateOpportunity() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: async (input: InsertOpportunity) => {
      const res = await apiRequest("POST", api.opportunities.create.path, input);
      return (await res.json()) as Opportunity;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateOpportunity() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number } & Partial<InsertOpportunity> & { confirmRemoveContacts?: boolean }) => {
      const res = await apiRequest("PUT", buildUrl(api.opportunities.update.path, { id }), input);
      return (await res.json()) as Opportunity;
    },
    onSuccess: (opp) => invalidate(opp.id),
  });
}

export function useChangeOpportunityStatus() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number } & OpportunityStatusChangeInput) => {
      const url = `${buildUrl(api.opportunities.changeStatus.path, { id })}?clientDate=${localToday()}`;
      const res = await apiRequest("POST", url, input);
      return (await res.json()) as Opportunity;
    },
    onSuccess: (opp) => invalidate(opp.id),
  });
}

export function useArchiveOpportunity() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      const res = await apiRequest("POST", buildUrl(api.opportunities.archive.path, { id }), { archived });
      return (await res.json()) as Opportunity;
    },
    onSuccess: (opp) => invalidate(opp.id),
  });
}

export function useOpportunityStatusHistory(id: number | undefined) {
  return useQuery<OpportunityStatusHistory[]>({
    queryKey: [api.opportunities.statusHistory.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.opportunities.statusHistory.path, { id: id! }), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: id !== undefined,
  });
}

export function useOpportunityActivity(id: number | undefined) {
  return useQuery<ActivityLog[]>({
    queryKey: [api.opportunities.activity.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.opportunities.activity.path, { id: id! }), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: id !== undefined,
  });
}

export function useOpportunityContacts(id: number | undefined) {
  return useQuery<OpportunityContactWithDetails[]>({
    queryKey: [api.opportunityContacts.list.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.opportunityContacts.list.path, { id: id! }), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: id !== undefined,
  });
}

export function useAddOpportunityContact(opportunityId: number) {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: async (input: Omit<InsertOpportunityContact, "opportunityId">) => {
      const res = await apiRequest("POST", buildUrl(api.opportunityContacts.create.path, { id: opportunityId }), input);
      return (await res.json()) as OpportunityContactWithDetails;
    },
    onSuccess: () => invalidate(opportunityId),
  });
}

export function useUpdateOpportunityContact(opportunityId: number) {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number; role?: string | null; isPrimary?: boolean }) => {
      const res = await apiRequest("PUT", buildUrl(api.opportunityContacts.update.path, { id }), input);
      return (await res.json()) as OpportunityContactWithDetails;
    },
    onSuccess: () => invalidate(opportunityId),
  });
}

export function useRemoveOpportunityContact(opportunityId: number) {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.opportunityContacts.delete.path, { id }));
    },
    onSuccess: () => invalidate(opportunityId),
  });
}

export function useOpportunityDocuments(id: number | undefined) {
  return useQuery<FileWithUploader[]>({
    queryKey: [api.opportunityDocuments.list.path, id],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.opportunityDocuments.list.path, { id: id! }), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: id !== undefined,
  });
}

export function useCreateOpportunityDocument(opportunityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string; objectPath: string; contentType?: string; size?: number;
      category: string; description?: string | null; supersedesId?: number | null;
    }) => {
      const res = await apiRequest("POST", buildUrl(api.opportunityDocuments.create.path, { id: opportunityId }), input);
      return (await res.json()) as FileMetadata;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.opportunityDocuments.list.path, opportunityId] });
      queryClient.invalidateQueries({ queryKey: [api.opportunities.activity.path, opportunityId] });
      invalidateDocumentCategoryUsage(queryClient);
    },
  });
}

export function useDeleteOpportunityDocument(opportunityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: number) => {
      await apiRequest("DELETE", buildUrl(api.opportunityDocuments.delete.path, { id: opportunityId, fileId }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.opportunityDocuments.list.path, opportunityId] });
      queryClient.invalidateQueries({ queryKey: [api.opportunities.activity.path, opportunityId] });
      invalidateDocumentCategoryUsage(queryClient);
    },
  });
}
