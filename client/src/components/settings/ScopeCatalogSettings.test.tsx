import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopeCatalogSettings } from "./ScopeCatalogSettings";

const mocks = vi.hoisted(() => ({
  createCategory: { mutate: vi.fn(), isPending: false },
  updateCategory: { mutate: vi.fn(), isPending: false },
  reorderCategories: { mutate: vi.fn(), isPending: false },
  createItem: { mutate: vi.fn(), isPending: false },
  updateItem: { mutate: vi.fn(), isPending: false },
  reorderItems: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/hooks/use-scope-catalog", () => ({
  useScopeCatalog: () => ({ data: {
    categories: [{ id: 1, key: "sitework", name: "Sitework", displayOrder: 10, isActive: true }],
    items: [{ id: 10, categoryId: 1, key: "clearing", name: "Clearing", description: null, displayOrder: 10, isActive: true }],
  }, isLoading: false, isError: false }),
  useCreateScopeCategory: () => mocks.createCategory,
  useUpdateScopeCategory: () => mocks.updateCategory,
  useReorderScopeCategories: () => mocks.reorderCategories,
  useCreateScopeCatalogItem: () => mocks.createItem,
  useUpdateScopeCatalogItem: () => mocks.updateItem,
  useReorderScopeCatalogItems: () => mocks.reorderItems,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe("ScopeCatalogSettings", () => {
  beforeEach(() => Object.values(mocks).forEach(value => value.mutate.mockReset()));

  it("groups items under their category and adds a trimmed item", async () => {
    const user = userEvent.setup();
    render(<ScopeCatalogSettings />);
    expect(screen.getByText("Sitework")).toBeInTheDocument();
    expect(screen.getByText("Clearing")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("New scope item"), "  Surveying  ");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(mocks.createItem.mutate).toHaveBeenCalledWith({ categoryId: 1, name: "Surveying" }, expect.any(Object));
  });

  it("requires confirmation before deactivating an item", async () => {
    const user = userEvent.setup();
    render(<ScopeCatalogSettings />);
    await user.click(screen.getByRole("button", { name: "Deactivate Clearing" }));
    expect(screen.getByText(/Existing Opportunity scope items are preserved/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(mocks.updateItem.mutate).toHaveBeenCalledWith({ id: 10, isActive: false }, expect.any(Object));
  });
});