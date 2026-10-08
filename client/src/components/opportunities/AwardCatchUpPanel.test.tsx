import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AwardCatchUpPanel } from "./AwardCatchUpPanel";

const mocks = vi.hoisted(() => ({
  useAwardCatchUp: vi.fn(),
  useRunAwardCatchUp: vi.fn(),
  mutate: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/hooks/use-project-bids", () => ({
  useAwardCatchUp: mocks.useAwardCatchUp,
  useRunAwardCatchUp: mocks.useRunAwardCatchUp,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

describe("AwardCatchUpPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAwardCatchUp.mockReturnValue({
      data: [
        { id: 31, opportunityNumber: "B-031", name: "Pier access", action: "create", targetProjectId: null, convertedProjectId: null, migratedFromProjectId: null, issue: null },
        { id: 32, opportunityNumber: "B-032", name: "Pump station", action: "add_contract", targetProjectId: 72, convertedProjectId: null, migratedFromProjectId: null, issue: null },
      ],
      isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
    });
    mocks.mutate.mockImplementation((_ids: number[], options: { onSuccess: (response: unknown) => void }) => {
      options.onSuccess({
        results: [
          { opportunityId: 31, projectId: 101, success: true, message: "Project and contract created." },
          { opportunityId: 32, projectId: null, success: false, message: "Existing project could not be linked." },
        ],
      });
    });
    mocks.useRunAwardCatchUp.mockReturnValue({ mutate: mocks.mutate, isPending: false });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows per-bid partial failures and an Open Project link from run results", () => {
    render(<AwardCatchUpPanel />);
    fireEvent.click(screen.getByRole("button", { name: /review records/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select B-031" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select B-032" }));
    fireEvent.click(screen.getByRole("button", { name: /approve 2 selected/i }));

    expect(screen.getByText("Existing project could not be linked.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Existing project could not be linked.");
    expect(screen.getByRole("link", { name: "Open project #101" })).toHaveAttribute("href", "/projects/101?tab=bids");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Some award records need attention",
      description: "1 repaired · 1 failed",
    }));
  });
});
