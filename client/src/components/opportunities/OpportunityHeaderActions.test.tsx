import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpportunityHeaderActions } from "./OpportunityHeaderActions";

describe("OpportunityHeaderActions", () => {
  it("keeps awarded bids editable while locking status changes", () => {
    render(
      <OpportunityHeaderActions
        opportunity={{ id: 81, status: "awarded", convertedProjectId: 14 }}
        onEdit={vi.fn()}
        onChangeStatus={vi.fn()}
        onToggleArchive={vi.fn()}
      />,
    );

    expect(screen.getByTestId("button-edit-opportunity")).toBeEnabled();
    expect(screen.getByTestId("button-change-opportunity-status")).toBeDisabled();
    expect(screen.getByTestId("button-toggle-opportunity-archive")).toBeDisabled();
  });

  it("opens the bid editor when Edit is activated", () => {
    const onEdit = vi.fn();
    render(
      <OpportunityHeaderActions
        opportunity={{ id: 81, status: "awarded" }}
        onEdit={onEdit}
        onChangeStatus={vi.fn()}
        onToggleArchive={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("button-edit-opportunity"));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
