import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { DocumentCategoryRecord } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function useDocumentCategories() {
  return useQuery<DocumentCategoryRecord[]>({
    queryKey: [api.documentCategories.list.path],
  });
}

function useInvalidateDocumentCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [api.documentCategories.list.path] });
}

export function useCreateDocumentCategory() {
  const invalidate = useInvalidateDocumentCategories();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", api.documentCategories.create.path, { name });
      return (await res.json()) as DocumentCategoryRecord;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateDocumentCategory() {
  const invalidate = useInvalidateDocumentCategories();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number; name?: string; isActive?: boolean }) => {
      const res = await apiRequest("PATCH", buildUrl(api.documentCategories.update.path, { id }), input);
      return (await res.json()) as DocumentCategoryRecord;
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