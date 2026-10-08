import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { useChangeOpportunityStatus } from "@/hooks/use-opportunities";

export type ContractRecord = {
  id: number; projectId: number; opportunityId: number; awardDate: string;
  amount: number | null; snapshot: Record<string, any>; createdAt: string | null;
};
export type ProjectBid = Record<string, any> & { contract: ContractRecord | null };
export type ProjectBidsResult = {
  project: Record<string, any>; bids: ProjectBid[]; awardedTotal: number; pendingTotal: number;
};
export type DocumentSource = { entityType: "project" | "opportunity"; entityId: number; label: string };

export function useProjectBids(projectId: number) {
  return useQuery<ProjectBidsResult>({
    queryKey: ["/api/projects", projectId, "bids"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/bids`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: Number.isFinite(projectId) && projectId > 0,
  });
}

export function useProjectDocumentSources(projectId: number) {
  return useQuery<DocumentSource[]>({
    queryKey: ["/api/projects", projectId, "document-sources"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/document-sources`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: Number.isFinite(projectId) && projectId > 0,
  });
}

export type OpportunityMigrationHistory = {
  project?: Record<string, any> | null;
  contacts?: { link: Record<string, any>; contact: Record<string, any> | null }[];
  todos?: Record<string, any>[];
  statusHistory?: Record<string, any>[];
  activity?: Record<string, any>[];
  tasks?: Record<string, any>[];
  communications?: Record<string, any>[];
  files?: Record<string, any>[];
  folders?: Record<string, any>[];
  retainedWork?: Record<string, Record<string, any>[]>;
  issue?: string;
  sourceId?: number;
} | null;
export function useOpportunityMigrationHistory(opportunityId: number | undefined) {
  return useQuery<OpportunityMigrationHistory>({
    queryKey: ["/api/opportunities", opportunityId, "migration-history"],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${opportunityId}/migration-history`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: opportunityId !== undefined,
  });
}

export type AwardCatchUpRow = {
  id: number; opportunityNumber: string; name: string; targetProjectId: number | null;
  convertedProjectId: number | null; migratedFromProjectId: number | null;
  issue: string | null; action: "linked" | "create" | "add_contract" | "conflict";
};
export type AwardCatchUpResult = {
  opportunityId: number;
  projectId: number | null;
  success: boolean;
  message?: string | null;
};
export type AwardCatchUpResponse = { results: AwardCatchUpResult[] };
export function useAwardCatchUp() {
  return useQuery<AwardCatchUpRow[]>({
    queryKey: ["/api/opportunities/award-catch-up"],
    queryFn: async () => {
      const res = await fetch("/api/opportunities/award-catch-up", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
}
export function useRunAwardCatchUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opportunityIds: number[]) => {
      const res = await apiRequest("POST", "/api/opportunities/award-catch-up", { opportunityIds, confirm: true });
      return res.json() as Promise<AwardCatchUpResponse>;
    },
    onSuccess: (response, opportunityIds) => {
      qc.invalidateQueries({ queryKey: ["/api/opportunities/award-catch-up"] });
      qc.invalidateQueries({ queryKey: [api.opportunities.list.path] });
      qc.invalidateQueries({ queryKey: [api.opportunities.dashboard.path] });
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/document-tools"] });
      opportunityIds.forEach(opportunityId => {
        qc.invalidateQueries({ queryKey: [api.opportunities.get.path, opportunityId] });
        qc.invalidateQueries({ queryKey: [api.opportunities.statusHistory.path, opportunityId] });
        qc.invalidateQueries({ queryKey: [api.opportunities.activity.path, opportunityId] });
        qc.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "migration-history"] });
      });
      response.results?.forEach(result => {
        if (!result.projectId) return;
        qc.invalidateQueries({ queryKey: ["/api/projects", result.projectId, "bids"] });
        qc.invalidateQueries({ queryKey: ["/api/projects", result.projectId, "document-sources"] });
      });
    },
  });
}

export function invalidateAwardQueries(projectId?: number, opportunityId?: number) {
  queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
  queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
  queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
  queryClient.invalidateQueries({ queryKey: ["/api/document-tools"] });
  queryClient.invalidateQueries({ queryKey: ["/api/opportunities/award-catch-up"] });
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "bids"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "document-sources"] });
  }
  if (opportunityId) queryClient.invalidateQueries({ queryKey: ["/api/opportunities/get", opportunityId] });
}

// Keep the award mutation shared with the established status workflow.
export { useChangeOpportunityStatus };
