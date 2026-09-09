import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpportunityFormDialog } from "./OpportunityFormDialog";

const mocks = vi.hoisted(() => ({
  create: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-todos", () => ({
  extractApiError: (_error: unknown, fallback: string) => fallback,
  useAppUsers: () => ({ data: [] }),
  userDisplayName: () => "",
}));
vi.mock("@/hooks/use-opportunities", () => ({
  useCreateOpportunity: () => mocks.create,
  useUpdateOpportunity: () => mocks.update,
}));
vi.mock("@/components/CustomerCreationDialog", () => ({
  CustomerCreationDialog: ({ open, onOpenChange, onCreated }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (customer: { id: number; name: string }) => void;
  }) => open ? <div data-testid="mock-customer-dialog">
    <button data-testid="mock-cancel-customer" onClick={() => onOpenChange(false)}>Cancel customer</button>
    <button data-testid="mock-create-customer" onClick={() => { onCreated({ id: 22, name: "Created Co" }); onOpenChange(false); }}>Create mock customer</button>
  </div> : null,
}));

function renderOpportunity(open = true) {
  const client = new QueryClient();
  client.setQueryData(["/api/customers"], [{ id: 1, name: "Existing Co", status: "active" }]);
  const onOpenChange = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <OpportunityFormDialog open={open} onOpenChange={onOpenChange} />
  </QueryClientProvider>);
  return { ...view, client, onOpenChange };
}

describe("OpportunityFormDialog customer creation integration", () => {
  beforeEach(() => {
    mocks.create.mutate.mockReset();
    mocks.update.mutate.mockReset();
  });

  it("preserves the opportunity draft on customer cancellation", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    await user.type(screen.getByTestId("input-opportunity-name"), "Warehouse Bid");
    await user.click(screen.getByTestId("button-add-inline-customer"));
    fireEvent.click(screen.getByTestId("mock-cancel-customer"));

    expect(screen.getByTestId("input-opportunity-name")).toHaveValue("Warehouse Bid");
    expect(screen.queryByTestId("mock-customer-dialog")).not.toBeInTheDocument();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
  });

  it("selects a newly created customer and submits it with the unchanged draft", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    await user.type(screen.getByTestId("input-opportunity-name"), "Warehouse Bid");
    await user.click(screen.getByTestId("button-add-inline-customer"));
    fireEvent.click(screen.getByTestId("mock-create-customer"));

    expect(screen.getByTestId("select-opp-customer")).toHaveTextContent("Created Co");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));
    expect(mocks.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Warehouse Bid", customerId: 22, status: "new" }),
      expect.any(Object),
    );
  });

  it("dismisses unfinished customer state when the opportunity closes", async () => {
    const user = userEvent.setup();
    const { rerender, client, onOpenChange } = renderOpportunity();
    await user.click(screen.getByTestId("button-add-inline-customer"));
    expect(screen.getByTestId("mock-customer-dialog")).toBeInTheDocument();

    rerender(<QueryClientProvider client={client}><OpportunityFormDialog open={false} onOpenChange={onOpenChange} /></QueryClientProvider>);
    rerender(<QueryClientProvider client={client}><OpportunityFormDialog open onOpenChange={onOpenChange} /></QueryClientProvider>);
    expect(screen.queryByTestId("mock-customer-dialog")).not.toBeInTheDocument();
  });
});