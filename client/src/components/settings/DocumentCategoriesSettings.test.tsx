import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentCategoriesSettings } from "./DocumentCategoriesSettings";

const mocks = vi.hoisted(() => ({
  create: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
  reorder: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/hooks/use-document-categories", () => ({
  useDocumentCategories: () => ({
    data: [
      { id: 1, key: "plans", name: "Plans", isActive: true, displayOrder: 0, documentUsageCount: 0 },
      { id: 2, key: "permits", name: "Permits", isActive: true, displayOrder: 1, documentUsageCount: 3 },
    ],
    isLoading: false,
  }),
  useDocumentCategoryHistory: () => ({ data: [], isLoading: false }),
  useCreateDocumentCategory: () => mocks.create,
  useUpdateDocumentCategory: () => mocks.update,
  useReorderDocumentCategories: () => mocks.reorder,
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe("DocumentCategoriesSettings", () => {
  beforeEach(() => {
    mocks.create.mutate.mockReset();
    mocks.update.mutate.mockReset();
    mocks.reorder.mutate.mockReset();
  });

  it("submits a trimmed new category name", async () => {
    const user = userEvent.setup();
    render(<DocumentCategoriesSettings />);

    await user.type(screen.getByPlaceholderText("New category name"), "  Contracts  ");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(mocks.create.mutate).toHaveBeenCalledWith("Contracts", expect.any(Object));
  });

  it("renames a category", async () => {
    const user = userEvent.setup();
    render(<DocumentCategoriesSettings />);

    await user.click(screen.getByRole("button", { name: "Rename Plans" }));
    const input = screen.getByDisplayValue("Plans");
    await user.clear(input);
    await user.type(input, "Drawings");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.update.mutate).toHaveBeenCalledWith(
      { id: 1, name: "Drawings" },
      expect.any(Object),
    );
  });

  it("confirms deactivation when documents use the category", async () => {
    const user = userEvent.setup();
    render(<DocumentCategoriesSettings />);

    await user.click(screen.getByRole("switch", { name: "Deactivate Permits" }));
    expect(screen.getByText(/used by 3 historical or current document versions/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deactivate category" }));

    expect(mocks.update.mutate).toHaveBeenCalledWith(
      { id: 2, isActive: false },
      expect.any(Object),
    );
  });

  it("sends the new order when a category is moved", async () => {
    const user = userEvent.setup();
    render(<DocumentCategoriesSettings />);

    await user.click(screen.getByRole("button", { name: "Move Plans down" }));

    expect(mocks.reorder.mutate).toHaveBeenCalledWith([2, 1], expect.any(Object));
  });
});