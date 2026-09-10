import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpportunityScopeTab from "./OpportunityScopeTab";

const refetch = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({
  query: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn(), todo: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/use-opportunity-scope", () => ({
  useOpportunityScope: () => mocks.query(),
  useReorderScopeItems: () => ({ mutate: mocks.reorder, isPending: false }),
  useAddScopeItem: () => ({ mutate: mocks.add, isPending: false }),
  useUpdateScopeItem: () => ({ mutate: mocks.update, isPending: false }),
  useDeleteScopeItem: () => ({ mutate: mocks.remove, isPending: false }),
  useCreateScopeClarificationTodo: () => ({ mutate: mocks.todo, isPending: false }),
}));
vi.mock("@/hooks/use-todos", () => ({
  useAppUsers: () => ({ data: [{ id: "assignee", firstName: "Estimator" }] }),
  userDisplayName: () => "Estimator", extractApiError: (e: Error) => e.message,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReturnValue({
    isLoading: false, isError: false,
    data: {
      categories: [{ key: "sitework", name: "Sitework" }],
      readiness: "in_progress",
      items: [
        { id: 1, categoryKey: "sitework", name: "Clearing", status: "not_reviewed", description: "Historical master text", notes: "Local note" },
        { id: 2, categoryKey: "sitework", name: "Survey", status: "needs_clarification", description: null, notes: null, isCustom: true },
      ],
    },
  });
});

describe("OpportunityScopeTab errors", () => {
  it("shows a retryable error instead of an empty/not-started checklist", async () => {
    mocks.query.mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: new Error("503 unavailable"),
      refetch, isFetching: false,
    });
    const user = userEvent.setup();
    render(<OpportunityScopeTab opportunityId={42} />);
    expect(screen.getByText(/Unable to load this Opportunity's scope checklist/)).toBeInTheDocument();
    expect(screen.queryByText("Not Started")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 Scope Items/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("Opportunity scope without master descriptions", () => {
  it("hides existing descriptions and all description controls, including custom creation", async () => {
    const user = userEvent.setup();
    render(<OpportunityScopeTab opportunityId={42} />);
    expect(screen.queryByText("Historical master text")).not.toBeInTheDocument();
    expect(screen.queryByText(/master description|edit description/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add custom item" }));
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/description/)).not.toBeInTheDocument();
    await user.type(screen.getByTestId("input-custom-scope-item-name-sitework"), "  Drainage  ");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(mocks.add).toHaveBeenCalledWith({ categoryKey: "sitework", name: "Drainage" }, expect.any(Object));
    act(() => mocks.add.mock.calls[0][1].onSuccess());
    expect(screen.queryByTestId("input-custom-scope-item-name-sitework")).not.toBeInTheDocument();
  });

  it("saves and clears Opportunity-specific notes without description writes", async () => {
    const user = userEvent.setup();
    render(<OpportunityScopeTab opportunityId={42} />);
    const notes = screen.getByTestId("textarea-scope-notes-1");
    await user.clear(notes);
    await user.type(notes, "Check revised plans");
    await user.click(screen.getByTestId("button-save-scope-notes-1"));
    expect(mocks.update).toHaveBeenLastCalledWith({ itemId: 1, notes: "Check revised plans" }, expect.any(Object));
    act(() => mocks.update.mock.calls[0][1].onSuccess());
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Scope item notes saved" });
    await user.clear(notes);
    await user.click(screen.getByTestId("button-save-scope-notes-1"));
    expect(mocks.update).toHaveBeenLastCalledWith({ itemId: 1, notes: null }, expect.any(Object));
  });

  it("keeps notes and custom item drafts after failed saves", async () => {
    const user = userEvent.setup();
    render(<OpportunityScopeTab opportunityId={42} />);
    await user.type(screen.getByTestId("textarea-scope-notes-1"), " revised");
    await user.click(screen.getByTestId("button-save-scope-notes-1"));
    act(() => mocks.update.mock.calls[0][1].onError(new Error("Save failed")));
    expect(screen.getByTestId("textarea-scope-notes-1")).toHaveValue("Local note revised");
    await user.click(screen.getByRole("button", { name: "Add custom item" }));
    await user.type(screen.getByTestId("input-custom-scope-item-name-sitework"), "Drainage");
    await user.click(screen.getByRole("button", { name: "Add" }));
    act(() => mocks.add.mock.calls[0][1].onError(new Error("Add failed")));
    expect(screen.getByTestId("input-custom-scope-item-name-sitework")).toHaveValue("Drainage");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't add item", variant: "destructive" }));
  });

  it("retains Included/Excluded, ordering and confirmed removal", async () => {
    const user = userEvent.setup();
    render(<OpportunityScopeTab opportunityId={42} />);
    await user.click(screen.getByTestId("button-include-scope-item-1"));
    expect(mocks.update).toHaveBeenLastCalledWith({ itemId: 1, status: "included" }, expect.any(Object));
    await user.click(screen.getByTestId("button-exclude-scope-item-1"));
    expect(mocks.update).toHaveBeenLastCalledWith({ itemId: 1, status: "excluded" }, expect.any(Object));
    await user.click(screen.getByTestId("button-move-down-1"));
    expect(mocks.reorder).toHaveBeenCalledWith([2, 1]);
    await user.click(screen.getByTestId("button-remove-scope-item-2"));
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove item" }));
    expect(mocks.remove).toHaveBeenCalledWith(2, expect.any(Object));
  });

  it("still creates clarification Todos", async () => {
    const user = userEvent.setup();
    render(<OpportunityScopeTab opportunityId={42} />);
    await user.click(screen.getByTestId("button-create-clarification-todo-2"));
    await user.click(screen.getByText("Choose user").closest("button")!);
    await user.click(screen.getByRole("option", { name: "Estimator" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(mocks.todo).toHaveBeenCalledWith({ itemId: 2, assignedToUserId: "assignee", dueDate: null }, expect.any(Object));
  });
});