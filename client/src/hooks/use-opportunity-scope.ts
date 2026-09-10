import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import type { OpportunityScopeItemWithDetails, ScopeCategory, Todo } from "@shared/schema";
import type { ScopeReadiness } from "@shared/scopeChecklist";

export type ScopeListResponse = { items: OpportunityScopeItemWithDetails[]; categories: ScopeCategory[]; readiness: ScopeReadiness };

function scopeQueryKey(opportunityId: number | undefined) {
  return [api.opportunityScope.list.path, opportunityId];
}

export function useOpportunityScope(opportunityId: number | undefined) {
  return useQuery<ScopeListResponse>({
    queryKey: scopeQueryKey(opportunityId),
    queryFn: async () => {
      const res = await fetch(buildUrl(api.opportunityScope.list.path, { id: opportunityId! }), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: opportunityId !== undefined,
  });
}

function useInvalidateScope(opportunityId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: scopeQueryKey(opportunityId) });
    queryClient.invalidateQueries({ queryKey: [api.opportunities.activity.path, opportunityId] });
  };
}

export function useAddScopeItem(opportunityId: number) {
  const invalidate = useInvalidateScope(opportunityId);
  return useMutation({
    mutationFn: async (input: { categoryKey: string; name: string; description?: string | null }) => {
      const res = await apiRequest("POST", buildUrl(api.opportunityScope.createItem.path, { id: opportunityId }), input);
      return (await res.json()) as OpportunityScopeItemWithDetails;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateScopeItem(opportunityId: number) {
  const invalidate = useInvalidateScope(opportunityId);
  return useMutation({
    mutationFn: async ({ itemId, ...input }: { itemId: number; status?: string; notes?: string | null; name?: string; description?: string | null }) => {
      const res = await apiRequest("PUT", buildUrl(api.opportunityScope.updateItem.path, { id: opportunityId, itemId }), input);
      return (await res.json()) as OpportunityScopeItemWithDetails;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteScopeItem(opportunityId: number) {
  const invalidate = useInvalidateScope(opportunityId);
  return useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest("DELETE", buildUrl(api.opportunityScope.deleteItem.path, { id: opportunityId, itemId }));
    },
    onSuccess: invalidate,
  });
}

export function useReorderScopeItems(opportunityId: number) {
  const invalidate = useInvalidateScope(opportunityId);
  return useMutation({
    mutationFn: async (orderedIds: number[]) => {
      const res = await apiRequest("POST", buildUrl(api.opportunityScope.reorder.path, { id: opportunityId }), { orderedIds });
      return (await res.json()) as { items: OpportunityScopeItemWithDetails[] };
    },
    onSuccess: invalidate,
  });
}

export function useCreateScopeClarificationTodo(opportunityId: number) {
  const invalidate = useInvalidateScope(opportunityId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, ...input }: { itemId: number; assignedToUserId: string; dueDate?: string | null }) => {
      const res = await apiRequest("POST", buildUrl(api.opportunityScope.createClarificationTodo.path, { id: opportunityId, itemId }), input);
      return (await res.json()) as Todo;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities", opportunityId, "todos"] });
    },
  });
}
