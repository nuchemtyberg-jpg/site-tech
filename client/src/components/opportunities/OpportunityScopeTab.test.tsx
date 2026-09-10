import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import OpportunityScopeTab from "./OpportunityScopeTab";

const refetch = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-opportunity-scope", () => ({
  useOpportunityScope: () => ({
    data: undefined, isLoading: false, isError: true, error: new Error("503 unavailable"),
    refetch, isFetching: false,
  }),
  useReorderScopeItems: () => ({ mutate: vi.fn(), isPending: false }),
  useAddScopeItem: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateScopeItem: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteScopeItem: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateScopeClarificationTodo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-todos", () => ({
  useAppUsers: () => ({ data: [] }), userDisplayName: vi.fn(), extractApiError: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe("OpportunityScopeTab errors", () => {
  it("shows a retryable error instead of an empty/not-started checklist", async () => {
    const user = userEvent.setup();
    render(<OpportunityScopeTab opportunityId={42} />);
    expect(screen.getByText(/Unable to load this Opportunity's scope checklist/)).toBeInTheDocument();
    expect(screen.queryByText("Not Started")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 Scope Items/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});