import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IncludedScopeItems } from "./IncludedScopeItems";

const item = (id: number, name: string, status: string, notes: string | null = null) => ({
  id, name, status, notes, opportunityId: 1, categoryId: 1, categoryKey: "sitework",
  categoryName: "Sitework", templateId: id, description: null, isCustom: false,
  displayOrder: id, linkedTodoId: null, createdByUserId: null, createdAt: null,
  updatedAt: null, deletedAt: null,
} as any);

describe("IncludedScopeItems", () => {
  it("renders only Included items and their opportunity notes", () => {
    render(<IncludedScopeItems items={[
      item(1, "Clearing", "included", "North parcel"),
      item(2, "Paving", "excluded"),
      item(3, "Drainage", "needs_clarification"),
    ]} />);
    expect(screen.getByText(/Clearing/)).toHaveTextContent("North parcel");
    expect(screen.queryByText("Paving")).not.toBeInTheDocument();
    expect(screen.queryByText("Drainage")).not.toBeInTheDocument();
  });

  it("renders an empty state", () => {
    render(<IncludedScopeItems items={[item(1, "Paving", "excluded")]} />);
    expect(screen.getByText("No scope items marked Included yet.")).toBeInTheDocument();
  });
});