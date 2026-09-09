import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { ActivityLog, DocumentCategoryRecord, DocumentCategoryWithUsage } from "@shared/schema";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import {
  documentCategoriesQueryKey,
  invalidateDocumentCategoryUsage,
} from "@/lib/document-category-cache";

export function useDocumentCategories() {
  return useQuery<DocumentCategoryWithUsage[]>({
    queryKey: documentCategoriesQueryKey,
    refetchOnMount: "always",
  });
}

export function useDocumentCategoryHistory() {
  return useQuery<ActivityLog[]>({
    queryKey: [api.documentCategories.history.path],
  });
}

function useInvalidateDocumentCategories() {
  const queryClient = useQueryClient();
  return () => {
    invalidateDocumentCategoryUsage(queryClient);
    queryClient.invalidateQueries({ queryKey: [api.documentCategories.history.path] });
  };
}

export function useCreateDocumentCategory() {
  const invalidate = useInvalidateDocumentCategories();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", api.documentCategories.create.path, { name });
      return parseJsonResponse<DocumentCategoryRecord>(res);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateDocumentCategory() {
  const invalidate = useInvalidateDocumentCategories();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number; name?: string; isActive?: boolean }) => {
      const res = await apiRequest("PATCH", buildUrl(api.documentCategories.update.path, { id }), input);
      return parseJsonResponse<DocumentCategoryRecord>(res);
    },
    onSuccess: invalidate,
  });
}

export function useReorderDocumentCategories() {
  const invalidate = useInvalidateDocumentCategories();
  return useMutation({
    mutationFn: async (orderedIds: number[]) => {
      await apiRequest("PUT", api.documentCategories.reorder.path, { orderedIds });
    },
    onSuccess: invalidate,
  });
}