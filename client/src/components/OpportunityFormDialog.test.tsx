import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpportunityFormDialog } from "./OpportunityFormDialog";

const mocks = vi.hoisted(() => ({
  create: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
  toast: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
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

const completeResult = {
  display_name: "123 Main Street, Austin, Texas 78701",
  address: {
    house_number: "123",
    road: "Main Street",
    city: "Austin",
    state: "Texas",
    postcode: "78701",
  },
  lat: "30.1",
  lon: "-97.1",
};

const editOpportunity = {
  id: 9,
  opportunityNumber: "OPP-009",
  name: "Legacy Bid",
  customerId: 1,
  status: "new",
  responsibleUserId: null,
  streetAddress: "9 Old Road",
  city: "Dallas",
  state: "TX",
  zip: "75001",
  rfpReceivedDate: null,
  bidDueDate: null,
  bidDueTime: null,
  estimatedStartDate: null,
  source: null,
  projectType: null,
  scopeSummary: null,
  internalNotes: null,
  expectedValue: null,
  probability: null,
} as any;

function renderOpportunity(open = true, opportunity: any = null) {
  const client = new QueryClient();
  client.setQueryData(["/api/customers"], [{ id: 1, name: "Existing Co", status: "active" }]);
  const onOpenChange = vi.fn();
  const view = render(<QueryClientProvider client={client}>
    <OpportunityFormDialog open={open} onOpenChange={onOpenChange} opportunity={opportunity} />
  </QueryClientProvider>);
  return { ...view, client, onOpenChange };
}

async function fillAddress(user: ReturnType<typeof userEvent.setup>, values = {
  streetAddress: "123 Main Street",
  city: "Austin",
  state: "TX",
  zip: "78701",
}) {
  await user.type(screen.getByLabelText(/Street address/), values.streetAddress);
  await user.type(screen.getByLabelText(/^City/), values.city);
  await user.type(screen.getByLabelText(/^State/), values.state);
  await user.type(screen.getByLabelText(/^ZIP/), values.zip);
}

async function replaceAddress(values: {
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
}) {
  fireEvent.change(screen.getByLabelText(/Street address/), { target: { value: values.streetAddress } });
  fireEvent.change(screen.getByLabelText(/^City/), { target: { value: values.city } });
  fireEvent.change(screen.getByLabelText(/^State/), { target: { value: values.state } });
  fireEvent.change(screen.getByLabelText(/^ZIP/), { target: { value: values.zip } });
}

async function fillCreationEssentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("input-opportunity-name"), "Warehouse Bid");
  await user.click(screen.getByTestId("button-add-inline-customer"));
  fireEvent.click(screen.getByTestId("mock-create-customer"));
}

async function selectSearchResult(user: ReturnType<typeof userEvent.setup>, result = completeResult) {
  mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => [result] });
  await user.type(screen.getByTestId("input-address-autocomplete"), "123 Main");
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(
    expect.stringContaining("nominatim.openstreetmap.org/search"),
    expect.objectContaining({ headers: { "Accept-Language": "en-US,en" } }),
  ));
  fireEvent.pointerDown(await screen.findByTestId("address-option-0"));
}

describe("OpportunityFormDialog required address", () => {
  beforeEach(() => {
    mocks.create.mutate.mockReset();
    mocks.update.mutate.mockReset();
    mocks.toast.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("links required creation labels and reports every missing field inline on submit", async () => {
    const user = userEvent.setup();
    renderOpportunity();

    expect(screen.getByLabelText("Street address *")).toHaveAttribute("id", "opportunity-streetAddress");
    expect(screen.getByLabelText("City *")).toHaveAttribute("id", "opportunity-city");
    expect(screen.getByLabelText("State *")).toHaveAttribute("id", "opportunity-state");
    expect(screen.getByLabelText("ZIP *")).toHaveAttribute("id", "opportunity-zip");

    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(screen.getByText("Street address is required")).toBeInTheDocument();
    expect(screen.getByText("City is required")).toBeInTheDocument();
    expect(screen.getByText("State is required")).toBeInTheDocument();
    expect(screen.getByText("ZIP is required")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Street address *"));
    expect(mocks.create.mutate).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Complete the opportunity address",
      variant: "destructive",
    }));
  });

  it("treats whitespace and a partially completed address as missing", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    fireEvent.change(screen.getByLabelText("Street address *"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("City *"), { target: { value: "Austin" } });
    fireEvent.change(screen.getByLabelText("State *"), { target: { value: "\t " } });

    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(screen.getByText("Street address is required")).toBeInTheDocument();
    expect(screen.queryByText("City is required")).not.toBeInTheDocument();
    expect(screen.getByText("State is required")).toBeInTheDocument();
    expect(screen.getByText("ZIP is required")).toBeInTheDocument();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
  });

  it("does not treat typed-only autocomplete text as an address", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => [completeResult] });

    await user.type(screen.getByTestId("input-address-autocomplete"), "123 Main");
    await screen.findByTestId("address-option-0");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(screen.getByText("Street address is required")).toBeInTheDocument();
    expect(screen.getByText("City is required")).toBeInTheDocument();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
  });

  it("replaces all stale fields from a complete lookup and creates with those values", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    await fillCreationEssentials(user);
    await replaceAddress({ streetAddress: "Stale", city: "Old City", state: "ZZ", zip: "00000" });

    await selectSearchResult(user);

    expect(screen.getByLabelText("Street address *")).toHaveValue("123 Main Street");
    expect(screen.getByLabelText("City *")).toHaveValue("Austin");
    expect(screen.getByLabelText("State *")).toHaveValue("TX");
    expect(screen.getByLabelText("ZIP *")).toHaveValue("78701");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));
    expect(mocks.create.mutate).toHaveBeenCalledWith(expect.objectContaining({
      streetAddress: "123 Main Street",
      city: "Austin",
      state: "TX",
      zip: "78701",
    }), expect.any(Object));
  });

  it("clears stale state and ZIP when a selected lookup result omits them", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    await replaceAddress({ streetAddress: "Stale", city: "Old City", state: "TX", zip: "99999" });
    await selectSearchResult(user, {
      ...completeResult,
      display_name: "44 Pine Road, Round Rock",
      address: { house_number: "44", road: "Pine Road", town: "Round Rock" },
    });

    expect(screen.getByLabelText("Street address *")).toHaveValue("44 Pine Road");
    expect(screen.getByLabelText("City *")).toHaveValue("Round Rock");
    expect(screen.getByLabelText("State *")).toHaveValue("");
    expect(screen.getByLabelText("ZIP *")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));
    expect(screen.getByText("State is required")).toBeInTheDocument();
    expect(screen.getByText("ZIP is required")).toBeInTheDocument();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["returns no results", () => Promise.resolve({ ok: true, json: async () => [] })],
    ["is unavailable", () => Promise.reject(new Error("offline"))],
  ])("allows manual entry when address search %s", async (_description, response) => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderOpportunity();
    await fillCreationEssentials(user);
    mocks.fetch.mockImplementationOnce(response);

    await user.type(screen.getByTestId("input-address-autocomplete"), "No match address");
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    await fillAddress(user);
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(mocks.create.mutate).toHaveBeenCalledWith(expect.objectContaining({
      streetAddress: "123 Main Street",
      city: "Austin",
      state: "TX",
      zip: "78701",
    }), expect.any(Object));
    consoleError.mockRestore();
  });

  it("uses manual corrections after selecting a result and trims create values", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    await fillCreationEssentials(user);
    await selectSearchResult(user);
    fireEvent.change(screen.getByLabelText("Street address *"), { target: { value: "  123 Main Street Apt 2  " } });
    fireEvent.change(screen.getByLabelText("City *"), { target: { value: "  Pflugerville  " } });
    fireEvent.change(screen.getByLabelText("State *"), { target: { value: " TX " } });
    fireEvent.change(screen.getByLabelText("ZIP *"), { target: { value: " 78660 " } });

    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    expect(mocks.create.mutate).toHaveBeenCalledWith(expect.objectContaining({
      streetAddress: "123 Main Street Apt 2",
      city: "Pflugerville",
      state: "TX",
      zip: "78660",
    }), expect.any(Object));
  });

  it("resets address search, fields, and validation after closing and reopening creation", async () => {
    const user = userEvent.setup();
    const { rerender, client, onOpenChange } = renderOpportunity();
    await fillAddress(user);
    await user.type(screen.getByTestId("input-address-autocomplete"), "typed search");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));

    rerender(<QueryClientProvider client={client}><OpportunityFormDialog open={false} onOpenChange={onOpenChange} /></QueryClientProvider>);
    rerender(<QueryClientProvider client={client}><OpportunityFormDialog open onOpenChange={onOpenChange} /></QueryClientProvider>);

    expect(screen.getByTestId("input-address-autocomplete")).toHaveValue("");
    expect(screen.getByLabelText("Street address *")).toHaveValue("");
    expect(screen.getByLabelText("City *")).toHaveValue("");
    expect(screen.getByLabelText("State *")).toHaveValue("");
    expect(screen.getByLabelText("ZIP *")).toHaveValue("");
    expect(screen.queryByText(/is required/)).not.toBeInTheDocument();
  });
});

describe("OpportunityFormDialog edit addresses", () => {
  beforeEach(() => {
    mocks.create.mutate.mockReset();
    mocks.update.mutate.mockReset();
    mocks.toast.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("prefills the autocomplete and linked optional address fields when editing", () => {
    renderOpportunity(true, editOpportunity);

    expect(screen.getByTestId("input-address-autocomplete")).toHaveValue("9 Old Road, Dallas, TX, 75001");
    expect(screen.getByLabelText("Street address")).toHaveValue("9 Old Road");
    expect(screen.getByLabelText("City")).toHaveValue("Dallas");
    expect(screen.getByLabelText("State")).toHaveValue("TX");
    expect(screen.getByLabelText("ZIP")).toHaveValue("75001");
    expect(screen.queryByLabelText("Street address *")).not.toBeInTheDocument();
  });

  it("preserves unchanged legacy optional address values verbatim", async () => {
    const user = userEvent.setup();
    const legacy = {
      ...editOpportunity,
      streetAddress: "  Legacy Road  ",
      city: "",
      state: null,
      zip: "  ",
    };
    renderOpportunity(true, legacy);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.queryByText(/is required/)).not.toBeInTheDocument();
    expect(mocks.update.mutate).toHaveBeenCalledWith(expect.objectContaining({
      id: 9,
      streetAddress: "  Legacy Road  ",
      city: null,
      state: null,
      zip: "  ",
    }), expect.any(Object));
  });
});

describe("OpportunityFormDialog customer creation integration", () => {
  beforeEach(() => {
    mocks.create.mutate.mockReset();
    mocks.update.mutate.mockReset();
    mocks.toast.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("preserves the full opportunity draft on customer cancellation", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    await user.type(screen.getByTestId("input-opportunity-name"), "Warehouse Bid");
    await fillAddress(user);
    await user.click(screen.getByTestId("button-add-inline-customer"));
    fireEvent.click(screen.getByTestId("mock-cancel-customer"));

    expect(screen.getByTestId("input-opportunity-name")).toHaveValue("Warehouse Bid");
    expect(screen.getByLabelText("Street address *")).toHaveValue("123 Main Street");
    expect(screen.getByLabelText("City *")).toHaveValue("Austin");
    expect(screen.getByLabelText("State *")).toHaveValue("TX");
    expect(screen.getByLabelText("ZIP *")).toHaveValue("78701");
    expect(screen.queryByTestId("mock-customer-dialog")).not.toBeInTheDocument();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
  });

  it("selects a newly created customer and submits it with the unchanged full draft", async () => {
    const user = userEvent.setup();
    renderOpportunity();
    await user.type(screen.getByTestId("input-opportunity-name"), "Warehouse Bid");
    await fillAddress(user);
    await user.click(screen.getByTestId("button-add-inline-customer"));
    fireEvent.click(screen.getByTestId("mock-create-customer"));

    expect(screen.getByTestId("select-opp-customer")).toHaveTextContent("Created Co");
    await user.click(screen.getByRole("button", { name: "Create opportunity" }));
    expect(mocks.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Warehouse Bid",
        customerId: 22,
        status: "new",
        streetAddress: "123 Main Street",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
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