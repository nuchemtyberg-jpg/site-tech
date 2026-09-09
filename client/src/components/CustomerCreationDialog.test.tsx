import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerCreationDialog } from "./CustomerCreationDialog";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

function renderDialog(props: Partial<React.ComponentProps<typeof CustomerCreationDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  const onSelectExisting = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <CustomerCreationDialog
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        onSelectExisting={onSelectExisting}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onCreated, onSelectExisting };
}

describe("CustomerCreationDialog", () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.toast.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });

  it("creates the company and optional contact before reporting success", async () => {
    const user = userEvent.setup();
    const customer = { id: 42, name: "Acme Builders" };
    mocks.apiRequest
      .mockResolvedValueOnce({ json: async () => customer })
      .mockResolvedValueOnce({ json: async () => ({ id: 9 }) });
    const { onCreated, onOpenChange } = renderDialog();

    await user.type(screen.getByTestId("input-customer-name"), "Acme Builders");
    await user.type(screen.getByTestId("input-contact-first-name"), "Avery");
    await user.type(screen.getByTestId("input-contact-email"), "avery@acme.test");
    await user.click(screen.getByTestId("badge-role-estimating"));
    await user.click(screen.getByTestId("button-save-customer"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(customer));
    expect(mocks.apiRequest).toHaveBeenNthCalledWith(1, "POST", "/api/customers", expect.objectContaining({ name: "Acme Builders" }));
    expect(mocks.apiRequest).toHaveBeenNthCalledWith(2, "POST", "/api/customers/42/contacts", expect.objectContaining({
      firstName: "Avery", email: "avery@acme.test", roles: ["estimating"], isPrimary: true,
    }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Customer created successfully" });
  });

  it("shows duplicate matches and lets the opportunity select one without creating", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 7, name: "Acme Construction LLC", status: "active" }],
    }));
    const { onSelectExisting, onOpenChange } = renderDialog();

    await user.type(screen.getByTestId("input-customer-name"), "Acme Construction");
    expect(await screen.findByTestId("warning-duplicate-customer", {}, { timeout: 1200 })).toBeInTheDocument();
    await user.click(screen.getByTestId("button-select-existing-customer-7"));

    expect(onSelectExisting).toHaveBeenCalledWith({ id: 7, name: "Acme Construction LLC", status: "active" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it("cancels without creating and clears unfinished fields when reopened", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CustomerCreationDialog open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    );
    await user.type(screen.getByTestId("input-customer-name"), "Unfinished Co");
    await user.click(screen.getByTestId("button-cancel-customer"));
    expect(mocks.apiRequest).not.toHaveBeenCalled();

    rerender(<QueryClientProvider client={new QueryClient()}><CustomerCreationDialog open={false} onOpenChange={onOpenChange} /></QueryClientProvider>);
    rerender(<QueryClientProvider client={new QueryClient()}><CustomerCreationDialog open onOpenChange={onOpenChange} /></QueryClientProvider>);
    expect(screen.getByTestId("input-customer-name")).toHaveValue("");
  });

  it("keeps the dialog open and shows actionable feedback when company creation fails", async () => {
    const user = userEvent.setup();
    mocks.apiRequest.mockRejectedValueOnce(new Error("503: customer service unavailable"));
    const { onCreated, onOpenChange } = renderDialog();
    await user.type(screen.getByTestId("input-customer-name"), "Failure Co");
    await user.click(screen.getByTestId("button-save-customer"));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't create customer", variant: "destructive",
    })));
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId("dialog-create-customer")).toBeInTheDocument();
  });

  it("truthfully reports a contact failure while returning the created company", async () => {
    const user = userEvent.setup();
    const customer = { id: 51, name: "Partial Co" };
    mocks.apiRequest
      .mockResolvedValueOnce({ json: async () => customer })
      .mockRejectedValueOnce(new Error("400: Contact email is already in use"));
    const { onCreated } = renderDialog();
    await user.type(screen.getByTestId("input-customer-name"), "Partial Co");
    await user.type(screen.getByTestId("input-contact-first-name"), "Pat");
    await user.click(screen.getByTestId("button-save-customer"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(customer));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Customer created, but contact was not", variant: "destructive",
    }));
  });

  it("does not offer inactive duplicate matches as opportunity selections", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 8, name: "Old Acme", status: "archived" }],
    }));
    renderDialog();
    await user.type(screen.getByTestId("input-customer-name"), "Old Acme");
    expect(await screen.findByText("Old Acme (archived)", {}, { timeout: 1200 })).toBeInTheDocument();
    expect(screen.queryByTestId("button-select-existing-customer-8")).not.toBeInTheDocument();
  });

  it("ignores a late result after the dialog session is dismissed", async () => {
    let resolveRequest!: (value: { json: () => Promise<{ id: number; name: string }> }) => void;
    mocks.apiRequest.mockReturnValueOnce(new Promise(resolve => { resolveRequest = resolve; }));
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    const queryClient = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <CustomerCreationDialog open onOpenChange={onOpenChange} onCreated={onCreated} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByTestId("input-customer-name"), "Slow Co");
    await user.click(screen.getByTestId("button-save-customer"));
    rerender(<QueryClientProvider client={queryClient}><CustomerCreationDialog open={false} onOpenChange={onOpenChange} onCreated={onCreated} /></QueryClientProvider>);
    resolveRequest({ json: async () => ({ id: 60, name: "Slow Co" }) });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("prevents choosing a duplicate while customer creation is in flight", async () => {
    let resolveRequest!: (value: { json: () => Promise<{ id: number; name: string }> }) => void;
    mocks.apiRequest.mockReturnValueOnce(new Promise(resolve => { resolveRequest = resolve; }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 7, name: "Acme Existing", status: "active" }],
    }));
    const user = userEvent.setup();
    const { onSelectExisting } = renderDialog();
    await user.type(screen.getByTestId("input-customer-name"), "Acme New");
    const existing = await screen.findByTestId("button-select-existing-customer-7", {}, { timeout: 1200 });
    await user.click(screen.getByTestId("button-save-customer"));

    expect(existing).toBeDisabled();
    await user.click(existing);
    expect(onSelectExisting).not.toHaveBeenCalled();
    resolveRequest({ json: async () => ({ id: 61, name: "Acme New" }) });
  });
});