import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import type { ScopeCategory, ScopeItemTemplate } from "@shared/schema";

export type ScopeCatalog = { categories: ScopeCategory[]; items: ScopeItemTemplate[] };
const catalogKey = [api.scopeCatalog.list.path];

export function useScopeCatalog() {
  return useQuery<ScopeCatalog>({ queryKey: catalogKey });
}

function useInvalidateCatalog() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: catalogKey });
    // Category activation and ordering affect which catalog is available to
    // Opportunity scope views. Their keys are [listPath, opportunityId], so
    // invalidating this prefix refreshes every open/cached Opportunity.
    client.invalidateQueries({ queryKey: [api.opportunityScope.list.path] });
  };
}

export function useCreateScopeCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (name: string) => parseJsonResponse<ScopeCategory>(
      await apiRequest("POST", api.scopeCatalog.createCategory.path, { name }),
    ),
    onSuccess: invalidate,
  });
}

export function useUpdateScopeCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number; name?: string; isActive?: boolean }) =>
      parseJsonResponse<ScopeCategory>(await apiRequest("PATCH", buildUrl(api.scopeCatalog.updateCategory.path, { id }), input)),
    onSuccess: invalidate,
  });
}

export function useReorderScopeCategories() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (orderedIds: number[]) => apiRequest("PUT", api.scopeCatalog.reorderCategories.path, { orderedIds }),
    onSuccess: invalidate,
  });
}

export function useCreateScopeCatalogItem() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { categoryId: number; name: string; description?: string | null }) =>
      parseJsonResponse<ScopeItemTemplate>(await apiRequest("POST", api.scopeCatalog.createItem.path, input)),
    onSuccess: invalidate,
  });
}

export function useUpdateScopeCatalogItem() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number; name?: string; description?: string | null; isActive?: boolean; categoryId?: number }) =>
      parseJsonResponse<ScopeItemTemplate>(await apiRequest("PATCH", buildUrl(api.scopeCatalog.updateItem.path, { id }), input)),
    onSuccess: invalidate,
  });
}

export function useReorderScopeCatalogItems() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ categoryId, orderedIds }: { categoryId: number; orderedIds: number[] }) =>
      apiRequest("PUT", buildUrl(api.scopeCatalog.reorderItems.path, { categoryId }), { orderedIds }),
    onSuccess: invalidate,
  });
}