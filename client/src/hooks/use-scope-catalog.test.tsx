import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@shared/routes";
import { useCreateScopeCatalogItem, useUpdateScopeCatalogItem, useUpdateScopeCategory } from "./use-scope-catalog";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queryClient", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/queryClient")>();
  return { ...actual, apiRequest: request };
});

describe("scope catalog cache invalidation", () => {
  beforeEach(() => request.mockReset());

  it("invalidates the catalog and every Opportunity scope query by prefix", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ id: 1, name: "Sitework", isActive: false }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useUpdateScopeCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 1, isActive: false });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: [api.scopeCatalog.list.path] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [api.opportunityScope.list.path] });
  });

  it("sends an optional Master description when creating a catalog item", async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ id: 10, categoryId: 1, name: "Clearing", description: "Remove brush" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useCreateScopeCatalogItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ categoryId: 1, name: "Clearing", description: "Remove brush" });
    });

    expect(request).toHaveBeenCalledWith("POST", api.scopeCatalog.createItem.path, {
      categoryId: 1,
      name: "Clearing",
      description: "Remove brush",
    });
  });

  it("passes description omission and explicit clearing through unchanged on update", async () => {
    request.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: 10, categoryId: 1, name: "Clearing", description: null }), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useUpdateScopeCatalogItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 10, name: "Renamed only" });
      await result.current.mutateAsync({ id: 10, description: null });
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "PATCH",
      expect.stringContaining("10"),
      { name: "Renamed only" },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "PATCH",
      expect.stringContaining("10"),
      { description: null },
    );
  });
});