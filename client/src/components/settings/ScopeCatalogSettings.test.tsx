import { fireEvent, render, screen } from "@testing-library/react";
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
  toast: vi.fn(),
}));
vi.mock("@/hooks/use-scope-catalog", () => ({
  useScopeCatalog: () => ({ data: {
    categories: [{ id: 1, key: "sitework", name: "Sitework", displayOrder: 10, isActive: true }],
    items: [{ id: 10, categoryId: 1, key: "clearing", name: "Clearing", description: "  Preserve this exact historical value  ", displayOrder: 10, isActive: true }],
  }, isLoading: false, isError: false }),
  useCreateScopeCategory: () => mocks.createCategory,
  useUpdateScopeCategory: () => mocks.updateCategory,
  useReorderScopeCategories: () => mocks.reorderCategories,
  useCreateScopeCatalogItem: () => mocks.createItem,
  useUpdateScopeCatalogItem: () => mocks.updateItem,
  useReorderScopeCatalogItems: () => mocks.reorderItems,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

describe("ScopeCatalogSettings", () => {
  beforeEach(() => {
    Object.values(mocks).forEach(value => "mutate" in value && value.mutate.mockReset());
    mocks.toast.mockReset();
  });

  it("groups items under their category and adds a trimmed item", async () => {
    const user = userEvent.setup();
    render(<ScopeCatalogSettings />);
    expect(screen.getByText("Sitework")).toBeInTheDocument();
    expect(screen.getByText("Clearing")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("New scope item"), "  Surveying  ");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(mocks.createItem.mutate).toHaveBeenCalledWith({ categoryId: 1, name: "Surveying" }, expect.any(Object));
  });

  it("creates an item with an optional Master description and preserves its draft on failure", async () => {
    const user = userEvent.setup();
    render(<ScopeCatalogSettings />);
    await user.type(screen.getByLabelText("New scope item in Sitework"), "Surveying");
    await user.type(screen.getByLabelText("Master description for new item in Sitework (optional)"), "Stake the corners");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(mocks.createItem.mutate).toHaveBeenCalledWith(
      { categoryId: 1, name: "Surveying", description: "Stake the corners" },
      expect.any(Object),
    );
    const options = mocks.createItem.mutate.mock.calls[0][1];
    options.onError(new Error("Request failed"));
    expect(screen.getByLabelText("New scope item in Sitework")).toHaveValue("Surveying");
    expect(screen.getByLabelText("Master description for new item in Sitework (optional)")).toHaveValue("Stake the corners");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "Request failed" }));
  });

  it("shows and edits the Master description without rewriting it on a name-only edit", async () => {
    const user = userEvent.setup();
    render(<ScopeCatalogSettings />);
    expect(screen.getByText(/Preserve this exact historical value/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Clearing" }));
    await user.clear(screen.getByLabelText("Scope item name for Clearing"));
    await user.type(screen.getByLabelText("Scope item name for Clearing"), "Clearing and grubbing");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.updateItem.mutate).toHaveBeenCalledWith(
      { id: 10, name: "Clearing and grubbing" },
      expect.any(Object),
    );
  });

  it("can explicitly clear a Master description and cancel without saving", async () => {
    const user = userEvent.setup();
    render(<ScopeCatalogSettings />);
    await user.click(screen.getByRole("button", { name: "Edit Clearing" }));
    await user.click(screen.getByRole("button", { name: "Clear Master description" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mocks.updateItem.mutate).toHaveBeenCalledWith(
      { id: 10, name: "Clearing", description: null },
      expect.any(Object),
    );

    mocks.updateItem.mutate.mockReset();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.updateItem.mutate).not.toHaveBeenCalled();
  });

  it("enforces the API's 2000-character Master description limit", async () => {
    const user = userEvent.setup();
    render(<ScopeCatalogSettings />);
    await user.click(screen.getByRole("button", { name: "Edit Clearing" }));
    const description = screen.getByLabelText("Master description for Clearing (optional)");
    fireEvent.change(description, { target: { value: "a".repeat(2001) } });
    expect(screen.getByText(/must be 2000 characters or fewer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
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