import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiSettingsSchema } from "@shared/estimating/takeoff";
import type { PublicRun } from "@/hooks/use-takeoff";
import { ClaudeTakeoff, RunProgress, TakeoffReview } from "./ClaudeTakeoff";
import TakeoffPlaybook from "./TakeoffPlaybook";
import EstimatingAISettings from "./EstimatingAISettings";
import { estimateTakeoffUsage } from "./takeoff-helpers";

const mocks = vi.hoisted(() => ({
  canEstimate: true, isAdmin: true, runs: [] as PublicRun[], mutate: vi.fn(),
  playbook: { versions: [] as { id: number; markdown: string; createdAt: string; createdBy: string; restoredFrom: number | null }[], rules: [] as unknown[] },
  save: vi.fn(), ruleSave: vi.fn(), settingsSave: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ canEstimate: mocks.canEstimate, isAdmin: mocks.isAdmin }) }));
vi.mock("@/hooks/use-takeoff", async importOriginal => ({
  ...await importOriginal<typeof import("@/hooks/use-takeoff")>(),
  useTakeoffRuns: () => ({ data: mocks.runs }),
  useTakeoffAction: () => ({ mutate: mocks.mutate, isPending: false }),
  useTakeoffPlaybook: () => ({ data: mocks.playbook, isLoading: false, isError: false }),
  useTakeoffSettings: () => ({ data: { settings: aiSettingsSchema.parse({}), version: 3, monthSpend: 12.36, runs: mocks.runs }, isLoading: false, isError: false }),
}));
vi.mock("./use-takeoff-management", () => ({
  useSavePlaybook: () => ({ mutate: mocks.save, isPending: false }),
  useSaveLearnedRule: () => ({ mutate: mocks.ruleSave, isPending: false }),
  useSaveTakeoffSettings: () => ({ mutate: mocks.settingsSave, isPending: false }),
}));
vi.mock("./TakeoffWizard", () => ({ TakeoffWizard: ({ onStarted, onClose }: { onStarted: (id: number) => void; onClose: () => void }) => <button onClick={() => { onStarted(9); onClose(); }}>Start mocked takeoff</button> }));

function run(patch: Partial<PublicRun> = {}): PublicRun {
  return { id: 9, opportunityId: 3, revisionId: 21, status: "needs_review", createdBy: "estimator-4", createdAt: "2026-06-01T09:12:00Z", startedAt: "2026-06-01T09:12:00Z", finishedAt: "2026-06-01T09:14:36Z", model: "claude-opus-5-5", cost: 1.37, steps: 23, budget: 8, stepLimit: 120, usage: { input: 24000, output: 13200, cacheRead: 1500, cacheWrite: 1500 }, progress: [{ at: "2026-06-01T09:14:36Z", message: "Takeoff ready" }], documents: [], instructions: "", trades: [], playbookVersion: 2, summary: "Review temporary shoring quantities.", questions: ["Confirm the shoring toe elevation."], flags: [{ type: "quantity", lineId: "line-7", categoryId: "cat-2", flag: "Verify", description: "Toe elevation is missing." }], error: null, ...patch };
}
beforeEach(() => {
  mocks.canEstimate = true; mocks.isAdmin = true; mocks.runs = []; mocks.playbook = { versions: [], rules: [] };
  mocks.mutate.mockReset(); mocks.save.mockReset(); mocks.ruleSave.mockReset(); mocks.settingsSave.mockReset();
});
describe("Claude takeoff review & approval", () => {
  it("guards estimator and admin-only workspaces", () => {
    mocks.canEstimate = false; mocks.isAdmin = false;
    render(<><ClaudeTakeoff opportunityId={3} dirty={false} onOpenRevision={vi.fn()} onFocus={vi.fn()} /><EstimatingAISettings /><TakeoffPlaybook /></>);
    expect(screen.queryByRole("button", { name: "New Claude takeoff" })).toBeNull();
    expect(screen.getByText(/Only administrators/)).toBeTruthy();
    expect(screen.getByText(/Estimating access is required/)).toBeTruthy();
  });
  it("opens flagged lines and submits review explicitly", () => {
    const focus = vi.fn(); vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TakeoffReview run={run()} opportunityId={3} onFocus={focus} />);
    fireEvent.click(screen.getByRole("button", { name: /quantity · Verify/ }));
    expect(focus.mock.calls[0][0]).toMatchObject({ lineId: "line-7", categoryId: "cat-2" });
    fireEvent.click(screen.getByRole("button", { name: "Mark takeoff reviewed" }));
    expect(mocks.mutate.mock.calls[0][0]).toEqual({ action: "runs/9/review" });
    vi.restoreAllMocks();
  });
  it("groups flags by type and shows the source model and document pages in Review", () => {
    const focus = vi.fn();
    const reviewRun = run();
    reviewRun.documents = [{ fileId: 41, name: "North SOE.pdf", contentType: "application/pdf", pages: [2, 5], sha256: "saved-document-hash" }];
    reviewRun.flags.push(
      { type: "quantity", lineId: "line-8", categoryId: "cat-2", flag: "Check length", description: "Confirm wall return length." },
      { type: "pricing", lineId: "line-9", categoryId: "cat-3", flag: "Missing rate", description: "Confirm disposal rate." },
    );
    render(<TakeoffReview run={reviewRun} opportunityId={3} onFocus={focus} />);
    expect(screen.getByRole("heading", { name: "quantity (2)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "pricing (1)" })).toBeTruthy();
    expect(screen.getByText("claude-opus-5-5")).toBeTruthy();
    expect(screen.getByText("North SOE.pdf")).toBeTruthy();
    expect(screen.getByText("Pages / sheets: 2, 5 · 2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /pricing · Missing rate/ }));
    expect(focus.mock.calls[0][0]).toMatchObject({ lineId: "line-9", categoryId: "cat-3" });
  });
  it("blocks result navigation while a draft is dirty", () => {
    render(<RunProgress run={run()} opportunityId={3} dirty selected={false} onOpenRevision={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Open generated revision" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Your edits have not been discarded/)).toBeTruthy();
  });
  it("requires confirmation before retrying the same failed run", () => {
    const confirm=vi.spyOn(window,"confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<RunProgress run={run({status:"failed",error:"Anthropic rejected the token count: credit balance too low"})} opportunityId={3} dirty={false} selected={false} onOpenRevision={vi.fn()} />);
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    expect(mocks.mutate.mock.calls[0][0]).toEqual({action:"runs/9/retry",data:undefined});
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("paid Claude calls"));
    confirm.mockRestore();
  });
  it("shows estimate-local added rates as read-only information to verify", () => {
    render(<TakeoffReview run={run({ addedRates: [
      { id: "rate-1", key: "FLOWABLE_FILL", desc: "Flowable fill delivered to Newark", unit: "CY", value: "187.65", computedValue: 187.65 },
    ] })} opportunityId={3} onFocus={vi.fn()} />);
    const rates = within(screen.getByRole("region", { name: "Rates added by Claude — verify" }));
    expect(rates.getByRole("heading", { name: "Rates added by Claude — verify" })).toBeTruthy();
    expect(rates.getByText("FLOWABLE_FILL")).toBeTruthy();
    expect(rates.getByText(/Flowable fill delivered to Newark/)).toBeTruthy();
    expect(rates.getByText("CY")).toBeTruthy();
    expect(rates.getByText("$187.65")).toBeTruthy();
    expect(rates.getByText(/estimate-local, not automatically company rates/)).toBeTruthy();
    expect(rates.getByText(/Verify each rate before relying on it/)).toBeTruthy();
    expect(rates.queryByRole("button")).toBeNull();
    expect(rates.queryByRole("textbox")).toBeNull();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("shows original formulas, computed prices, zero and explicitly unavailable values", () => {
    render(<TakeoffReview run={run({ addedRates: [
      { id: "formula", key: "DELIVERED_FILL", desc: "Delivered fill", unit: "CY", value: "=125*1.12", computedValue: 140 },
      { id: "zero", key: "REUSED_FILL", desc: "Reused fill", unit: "CY", value: "0", computedValue: 0 },
      { id: "formula-zero", key: "CREDIT", desc: "Material credit", unit: "LS", value: "=125-125", computedValue: 0 },
      { id: "unavailable", key: "SPECIAL_MIX", desc: "Special mix pending quote", unit: "CY", value: "=MISSING_QUOTE*1.12", computedValue: null },
    ] })} opportunityId={3} onFocus={vi.fn()} />);
    const rates = within(screen.getByRole("region", { name: "Rates added by Claude — verify" }));
    const rows = rates.getAllByRole("listitem");
    expect(within(rows[0]).getByText("=125*1.12")).toBeTruthy();
    expect(within(rows[0]).getByText("Computed price:")).toBeTruthy();
    expect(within(rows[0]).getByText("$140.00")).toBeTruthy();
    expect(within(rows[1]).getByText("Computed price:")).toBeTruthy();
    expect(within(rows[1]).getByText("$0.00")).toBeTruthy();
    expect(within(rows[2]).getByText("=125-125")).toBeTruthy();
    expect(within(rows[2]).getByText("$0.00")).toBeTruthy();
    expect(within(rows[3]).getByText("=MISSING_QUOTE*1.12")).toBeTruthy();
    expect(within(rows[3]).getByText("Unavailable")).toBeTruthy();
    expect(within(rows[3]).queryByText("$0.00")).toBeNull();
  });
  it.each([undefined, []])("omits the added rates section for missing or empty rates (%j)", addedRates => {
    render(<TakeoffReview run={run({ addedRates })} opportunityId={3} onFocus={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Rates added by Claude — verify" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Rates added by Claude — verify" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mark takeoff reviewed" })).toBeTruthy();
  });
  it("requires positive limits and explicit additional spending approval", () => {
    render(<RunProgress run={run({ status: "stopped_at_cap" })} opportunityId={3} dirty={false} selected={false} onOpenRevision={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve more budget & continue" }));
    const submit = screen.getByRole("button", { name: "Approve & continue" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Additional budget (USD)"), { target: { value: "6.5" } });
    fireEvent.change(screen.getByLabelText("Additional steps"), { target: { value: "27" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I approve/ }));
    fireEvent.click(submit);
    expect(mocks.mutate.mock.calls[0][0]).toEqual({ action: "runs/9/continue", data: { additionalBudget: 6.5, additionalSteps: 27 } });
  });
  it("shows cancellation API errors rather than silently closing", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.mutate.mockImplementation((_data, options) => options.onError(new Error("Cancellation refused")));
    render(<RunProgress run={run({ status: "running", finishedAt: null })} opportunityId={3} dirty={false} selected={false} onOpenRevision={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel takeoff" }));
    expect(screen.getByRole("alert").textContent).toContain("Cancellation refused");
    vi.restoreAllMocks();
  });
  it("waits for local edits to be saved before auto-opening a new result", async () => {
    const open = vi.fn(); mocks.runs = [run()];
    const rendered = render(<ClaudeTakeoff opportunityId={3} revisionId={7} dirty onOpenRevision={open} onFocus={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "New Claude takeoff" }));
    fireEvent.click(screen.getByRole("button", { name: "Start mocked takeoff" }));
    expect(open).not.toHaveBeenCalled();
    rendered.rerender(<ClaudeTakeoff opportunityId={3} revisionId={7} dirty={false} onOpenRevision={open} onFocus={vi.fn()} />);
    await waitFor(() => expect(open).toHaveBeenCalledWith(21));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
describe("Playbook versioning", () => {
  it("offers the empty playbook and creates a version", () => {
    render(<TakeoffPlaybook />);
    fireEvent.change(screen.getByPlaceholderText("Paste the playbook here"), { target: { value: "# SOE\nCheck toe elevations." } });
    fireEvent.click(screen.getByRole("button", { name: "Save new version" }));
    expect(mocks.save.mock.calls[0][0]).toEqual({ markdown: "# SOE\nCheck toe elevations." });
  });
  it("adds a custom-scope learned rule with a source note", () => {
    render(<TakeoffPlaybook />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "Allow mobilization for each phase." } });
    fireEvent.change(screen.getByLabelText(/^Applies to/), { target: { value: "Marine access" } });
    fireEvent.change(screen.getByLabelText("Source note"), { target: { value: "Pier review meeting" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));
    expect(mocks.ruleSave.mock.calls[0][0]).toMatchObject({ text: "Allow mobilization for each phase.", appliesTo: "Marine access", sourceNote: "Pier review meeting", active: true });
  });
  it("restores an old version by posting a new version", () => {
    mocks.playbook.versions = [{ id: 5, markdown: "Saved playbook", createdAt: "2026-06-01T09:00:00Z", createdBy: "manager-2", restoredFrom: null }];
    render(<TakeoffPlaybook />);
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    fireEvent.click(screen.getByRole("button", { name: "View / restore" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore as new version" }));
    expect(mocks.save.mock.calls[0][0]).toEqual({ markdown: "Saved playbook", restoredFrom: 5 });
  });
  it("sends numeric settings and the optimistic version token", () => {
    render(<EstimatingAISettings />);
    expect(screen.getByRole("note", { name: "Production readiness warning" }).textContent).toContain("Reserved VM or external persistent worker");
    expect(screen.getByRole("note", { name: "Production readiness warning" }).textContent).toContain("Autoscale");
    fireEvent.change(screen.getByLabelText("Maximum cost per run (USD)"), { target: { value: "17.36" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(mocks.settingsSave.mock.calls[0][0]).toMatchObject({ version: 3, settings: { maxCost: 17.36 } });
    act(() => mocks.settingsSave.mock.calls[0][1].onError(new Error("Settings changed elsewhere")));
    expect(screen.getByRole("alert").textContent).toContain("Settings changed elsewhere");
  });
});
describe("Planning estimate", () => {
  it("includes selected-page input plus fixed overhead and labels a range", () => {
    const estimate = estimateTakeoffUsage(7, { model: "claude-opus-5-5", maxCost: 25, maxSteps: 150, estimatedInputPerPage: 3000, prices: { input: 7, output: 31, cacheRead: .4, cacheWrite: 9 } });
    expect(estimate.inputTokens).toBe(33000);
    expect(estimate.low).toBeCloseTo((33000*9+40*(33000*.4+3000*7+2500*31))/1_000_000);
    expect(estimate.high).toBeCloseTo((33000*9+120*(66000*.4+10000*7+6000*31))/1_000_000);
  });
  it("does not invent model prices when config omits them", () => {
    const estimate = estimateTakeoffUsage(7, { model: "claude-sonnet-5-5", maxCost: 25, maxSteps: 150, estimatedInputPerPage: 3000 });
    expect(estimate.inputTokens).toBe(33000);
    expect(estimate.low).toBeNull();
    expect(estimate.high).toBeNull();
  });
});
