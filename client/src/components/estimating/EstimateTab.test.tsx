import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyJob, type EstimateRates, type EstimateRevision } from "@shared/estimating/model";
import { summarize } from "@shared/estimating/engine";
import { EstimateApiError } from "@/hooks/use-estimates";
import { EstimateTab } from "./EstimateTab";

const mocks = vi.hoisted(() => ({
  revision: undefined as EstimateRevision | undefined,
  mutate: vi.fn(),
  dirty: vi.fn(),
  refetch: vi.fn(),
  companyRates: undefined as EstimateRates | undefined,
}));
vi.mock("@/hooks/use-estimates", async importOriginal => {
  const actual = await importOriginal<typeof import("@/hooks/use-estimates")>();
  return {
    ...actual,
    useEstimateRevisions: () => ({ data: mocks.revision ? [mocks.revision] : [], isLoading: false, isError: false }),
    useEstimateRevision: () => ({ data: mocks.revision, isLoading: false, isError: false }),
    useSaveEstimate: () => ({ mutate: mocks.mutate, isPending: false }),
    useEstimatingRates: () => ({ data: mocks.companyRates ? { rates: mocks.companyRates } : undefined, isLoading: !mocks.companyRates, isError: false, refetch: mocks.refetch }),
  };
});
function revision(): EstimateRevision {
  const job = { ...emptyJob(), name: "North access road" };
  return { id: 7, opportunityId: 3, revisionNumber: 0, name: null, job, summary: summarize(job), version: 4, locked: false, lockReason: null, createdAt: "2026-06-03T12:00:00Z", savedAt: "2026-06-03T12:00:00Z", createdBy: "estimator-1", savedBy: "estimator-1" };
}
beforeEach(() => {
  mocks.revision = revision();
  mocks.companyRates = undefined;
  mocks.mutate.mockReset(); mocks.dirty.mockReset();
});
describe("Estimate revision workflow", () => {
  it("keeps edits local and overwrites with the loaded version token", () => {
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Revised access road" } });
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ revisionId: 7, version: 4, job: { name: "Revised access road" } });
  });
  it("does not overwrite newer typing when a slow save finishes", () => {
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "First edit" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Newer edit" } });
    const saved = { ...mocks.revision!, version: 5, job: { ...mocks.revision!.job, name: "First edit" } };
    act(() => mocks.mutate.mock.calls[0][1].onSuccess(saved));
    expect((screen.getByLabelText("Job name") as HTMLInputElement).value).toBe("Newer edit");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(mocks.mutate.mock.calls[1][0]).toMatchObject({ revisionId: 7, version: 5 });
  });
  it("disables locked overwrites, shows the reason, and allows Save as revision", () => {
    mocks.revision = { ...revision(), locked: true, lockReason: "Requested for bid review" };
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Review draft" } });
    expect((screen.getByRole("button", { name: /^Save$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Requested for bid review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save as revision" }));
    fireEvent.click(screen.getByRole("button", { name: "Save new revision" }));
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ job: { name: "Review draft" } });
    expect(mocks.mutate.mock.calls[0][0]).not.toHaveProperty("revisionId");
  });
  it("keeps a conflicting draft and offers current or a new revision", () => {
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "My draft" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    act(() => mocks.mutate.mock.calls[0][1].onError(new EstimateApiError(409, { message: "Version changed", current: { ...revision(), version: 5 } })));
    expect(screen.getByRole("button", { name: "Load current" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save draft as new revision" }));
    fireEvent.click(screen.getByRole("button", { name: "Save new revision" }));
    expect(mocks.mutate.mock.calls[1][0]).toMatchObject({ job: { name: "My draft" } });
  });
  it("starts the first revision explicitly", () => {
    mocks.revision = undefined;
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.click(screen.getByRole("button", { name: "Start Rev 0" }));
    expect(mocks.mutate.mock.calls[0][0]).toEqual({ start: true });
  });
  it("confirms formula errors before overwrite, allows cancellation, and preserves errors in the draft", () => {
    mocks.revision!.job.defaults.tax = "1/0";
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Draft with errors" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const save = screen.getByRole("button", { name: /^Save$/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(confirm).toHaveBeenCalledWith("1 formula errors — those values count as zero. Save anyway?");
    expect(mocks.mutate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(save);
    expect(mocks.mutate.mock.calls[0][0].job.defaults.tax).toBe("1/0");
    confirm.mockRestore();
  });
  it("confirms formula errors when saving as a revision through the conflict path", () => {
    mocks.revision!.job.defaults.tax = "1/0";
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "My invalid draft" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    act(() => mocks.mutate.mock.calls[0][1].onError(new EstimateApiError(409, { message: "Version changed", current: { ...revision(), version: 5 } })));
    fireEvent.click(screen.getByRole("button", { name: "Save draft as new revision" }));
    confirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Save new revision" }));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Save new revision" }));
    expect(mocks.mutate.mock.calls[1][0]).toMatchObject({ job: { name: "My invalid draft", defaults: { tax: "1/0" } } });
    expect(confirm).toHaveBeenLastCalledWith("1 formula errors — those values count as zero. Save anyway?");
    confirm.mockRestore();
  });
  it("retains edits typed during a save-as revision request", () => {
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.click(screen.getByRole("button", { name: "Save as revision" }));
    fireEvent.click(screen.getByRole("button", { name: "Save new revision" }));
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Continued draft" } });
    act(() => mocks.mutate.mock.calls[0][1].onSuccess({ ...revision(), id: 8, revisionNumber: 1 }));
    expect((screen.getByLabelText("Job name") as HTMLInputElement).value).toBe("Continued draft");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });
  it.each([false, true])("refreshes rates with replaceDefaultMarkups=%s", replace => {
    mocks.revision!.job.defaults.tax = "8.875";
    mocks.companyRates = { ...emptyJob(), defaults: { tax: "6.25", oh: "12", ins: "3", profit: "9" } };
    render(<EstimateTab opportunityId={3} onDirtyChange={mocks.dirty} />);
    fireEvent.change(screen.getByLabelText("Job name"), { target: { value: "Refreshed draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Estimate-local rates" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh company rates" }));
    const checkbox = screen.getByRole("checkbox", { name: "Also replace default markups" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    if (replace) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Refresh draft" }));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(mocks.mutate.mock.calls[0][0].job.defaults.tax).toBe(replace ? "6.25" : "8.875");
  });
});
