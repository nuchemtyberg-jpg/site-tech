import { QueryClient } from "@tanstack/react-query";
import {
  documentCategoriesQueryKey,
  invalidateDocumentCategoryUsage,
} from "../client/src/lib/document-category-cache";

async function main() {
  let documentUsageCount = 0;
  let requests = 0;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        retry: false,
      },
    },
  });

  const fetchCategories = async () => {
    requests++;
    return [{ id: 1, documentUsageCount }];
  };

  const initial = await queryClient.fetchQuery({
    queryKey: documentCategoriesQueryKey,
    queryFn: fetchCategories,
  });
  if (initial[0].documentUsageCount !== 0 || requests !== 1) {
    throw new Error("Expected the initial category usage count to be cached at zero");
  }

  documentUsageCount = 1;
  const stillCached = await queryClient.fetchQuery({
    queryKey: documentCategoriesQueryKey,
    queryFn: fetchCategories,
  });
  if (stillCached[0].documentUsageCount !== 0 || requests !== 1) {
    throw new Error("Expected an infinitely fresh category query to remain cached before invalidation");
  }

  await invalidateDocumentCategoryUsage(queryClient);
  const afterUpload = await queryClient.fetchQuery({
    queryKey: documentCategoriesQueryKey,
    queryFn: fetchCategories,
  });
  if (afterUpload[0].documentUsageCount !== 1 || requests !== 2) {
    throw new Error("Expected document mutation invalidation to refresh category usage");
  }

  console.log("PASS document mutations invalidate cached category usage");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});