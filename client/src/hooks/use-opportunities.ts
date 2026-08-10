import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import type {
  Opportunity, OpportunityWithDetails, OpportunityContactWithDetails,
  InsertOpportunity, InsertOpportunityContact, OpportunityStatusChangeInput,
  OpportunityStatusHistory, ActivityLog,
} from "@shared/schema";
import { localToday } from "@/hooks/use-todos";

export type OpportunityListFilters = {
  status?: string;
  customerId?: number;
  responsibleUserId?: string;
  includeArchived?: boolean;
  search?: string;
};

function opportunityListUrl(filters: OpportunityListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.customerId !== undefined) params.set("customerId", String(filters.customerId));
  if (filters.responsibleUserId) params.set("responsibleUserId", filters.responsibleUserId);
  if (filters.includeArchived) params.set("includeArchived", "true");
  if (filters.search) params.set("search", filters.search);
  const qs = params.toString();
  return qs ? `${api.opportunities.list.path}?${qs}` : api.opportunities.list.path;
}

export function useOpportunities(filters: OpportunityListFilters = {}) {
  const url = opportunityListUrl(filters);
  return useQuery<OpportunityWithDetails[]>({
    queryKey: [api.opportunities.list.path, filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
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
