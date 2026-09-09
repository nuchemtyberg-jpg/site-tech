import type { QueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

export const documentCategoriesQueryKey = [api.documentCategories.list.path] as const;

export function invalidateDocumentCategoryUsage(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: documentCategoriesQueryKey });
}