import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TakeoffWizard } from "./TakeoffWizard";

const mocks = vi.hoisted(() => ({ action: vi.fn(), register: vi.fn(), refetch: vi.fn(), configError: false, registered: false }));
vi.mock("@/hooks/use-takeoff", () => ({
  takeoffRoot: (id: number) => `/api/opportunities/${id}/takeoff`,
  useTakeoffDocuments: () => ({ data: [{ id: 41, name: "SOE plan.pdf", contentType: "application/pdf", source: "Opportunity" }], refetch: mocks.refetch }),
  useTakeoffAction: () => ({ mutate: mocks.action, isPending: false }),
}));
vi.mock("./use-takeoff-management", () => ({
  useTakeoffConfig: () => ({ data: mocks.configError ? undefined : { model: "claude-opus-5-5", maxCost: 18.75, maxSteps: 120, estimatedInputPerPage: 3000, prices: { input: 7, output: 31, cacheRead: .4, cacheWrite: 9 } }, isError: mocks.configError, error: new Error("Limits unavailable"), refetch: mocks.refetch }),
  useTakeoffSheets: () => ({ data: { pages: [{ page: 1, title: "General notes", sheetNumber: "S-001", scaleText: [], vector: true }, { page: 2, title: "SOE layout", sheetNumber: "SOE-101", scaleText: ["1/8 inch = 1 foot"], vector: true }] } }),
}));
vi.mock("@/components/documents/use-document-tools", () => ({
  documentToolsBase: () => "/api/document-tools/opportunity/3",
  useDocumentTools: () => ({ folders: { data: [] }, createFile: { mutateAsync: vi.fn() }, createFolder: { mutateAsync: vi.fn() } }),
}));
vi.mock("@/components/documents/document-uploads", () => ({
  createRegistrationSession: () => ({ register: mocks.register }),
}));
vi.mock("@/components/NativeFileUploader", () => ({
  NativeFileUploader: ({ onUploadComplete, accept }: { onUploadComplete: (files: unknown[]) => Promise<void>; accept: string }) => <button data-accept={accept} onClick={() => void onUploadComplete([{ name: "Geo report.pdf", objectPath: "/objects/geo", type: "application/pdf", size: 1234 }])}>Upload test document</button>,
}));
beforeEach(() => {
  mocks.action.mockReset(); mocks.register.mockReset(); mocks.refetch.mockReset(); mocks.configError = false; mocks.registered = false;
});
function prepare() {
  fireEvent.click(screen.getByRole("checkbox", { name: /SOE plan.pdf/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Page 2/ }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}
describe("Claude takeoff setup", () => {
  it("accepts only supported file extensions", () => {
    render(<TakeoffWizard opportunityId={3} dirty={false} onClose={vi.fn()} onStarted={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Upload test document" }).getAttribute("data-accept")).toBe(".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv");
  });
  it("retains standard trades and adds, deduplicates and removes custom trades", () => {
    render(<TakeoffWizard opportunityId={3} dirty={false} onClose={vi.fn()} onStarted={vi.fn()} />);
    prepare();
    fireEvent.click(screen.getByRole("checkbox", { name: "SOE" }));
    const input = screen.getByLabelText("Custom trade");
    fireEvent.change(input, { target: { value: "  Marine access  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add trade" }));
    fireEvent.change(input, { target: { value: "marine ACCESS" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getAllByRole("button", { name: /Remove custom trade Marine access/ })).toHaveLength(1);
    fireEvent.change(input, { target: { value: "Temporary roads" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Remove custom trade Temporary roads" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/SOE, Marine access/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /I approve spending/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start Claude takeoff" }));
    expect(mocks.action.mock.calls[0][0].data.trades).toEqual(["SOE", "Marine access"]);
  });
  it("requires pages and spending consent, then sends the saved revision and selected pages", () => {
    render(<TakeoffWizard opportunityId={3} revisionId={7} dirty onClose={vi.fn()} onStarted={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    prepare();
    fireEvent.click(screen.getByRole("checkbox", { name: "SOE" }));
    fireEvent.change(screen.getByLabelText(/^Additional instructions/), { target: { value: "Separate rock quantities." } });
    expect(screen.getByText(/Your unsaved draft remains open/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Approximate planning range/)).toBeTruthy();
    const start = screen.getByRole("button", { name: "Start Claude takeoff" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /I approve spending/ }));
    fireEvent.click(start);
    expect(mocks.action.mock.calls[0][0]).toEqual({ action: "runs", data: { documents: [{ fileId: 41, pages: [2] }], revisionId: 7, instructions: "Separate rock quantities.", trades: ["SOE"], approvedBudget: 18.75, approvedSteps: 120 } });
  });
  it("does not start without a successfully loaded budget configuration", () => {
    mocks.configError = true;
    render(<TakeoffWizard opportunityId={3} dirty={false} onClose={vi.fn()} onStarted={vi.fn()} />);
    prepare(); fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toContain("Limits unavailable");
    fireEvent.click(screen.getByRole("checkbox", { name: /I approve spending/ }));
    expect((screen.getByRole("button", { name: "Start Claude takeoff" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("registers uploads in Documents before reloading takeoff documents", async () => {
    let finish!: () => void;
    mocks.register.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<TakeoffWizard opportunityId={3} dirty={false} onClose={vi.fn()} onStarted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload test document" }));
    expect(mocks.register).toHaveBeenCalledWith([expect.objectContaining({ name: "Geo report.pdf", objectPath: "/objects/geo" })]);
    expect(mocks.refetch).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  });
  it("keeps the wizard open and surfaces a start failure for retry", () => {
    mocks.action.mockImplementation((_data, options) => options.onError(new Error("Provider is not configured")));
    render(<TakeoffWizard opportunityId={3} dirty={false} onClose={vi.fn()} onStarted={vi.fn()} />);
    prepare(); fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I approve spending/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start Claude takeoff" }));
    expect(screen.getByRole("alert").textContent).toContain("Provider is not configured");
    fireEvent.click(screen.getByRole("button", { name: "Start Claude takeoff" }));
    expect(mocks.action).toHaveBeenCalledTimes(2);
  });
});
