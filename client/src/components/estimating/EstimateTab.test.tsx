import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyJob, type EstimateRevision } from "@shared/estimating/model";
import { summarize } from "@shared/estimating/engine";
import { EstimateApiError } from "@/hooks/use-estimates";
import { EstimateTab } from "./EstimateTab";

const mocks = vi.hoisted(() => ({
  revision: undefined as EstimateRevision | undefined,
  mutate: vi.fn(),
  dirty: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/hooks/use-estimates", async importOriginal => {
  const actual = await importOriginal<typeof import("@/hooks/use-estimates")>();
  return {
    ...actual,
    useEstimateRevisions: () => ({ data: mocks.revision ? [mocks.revision] : [], isLoading: false, isError: false }),
    useEstimateRevision: () => ({ data: mocks.revision, isLoading: false, isError: false }),
    useSaveEstimate: () => ({ mutate: mocks.mutate, isPending: false }),
    useEstimatingRates: () => ({ data: undefined, isLoading: true, isError: false, refetch: mocks.refetch }),
  };
});
function revision(): EstimateRevision {
  const job = { ...emptyJob(), name: "North access road" };
  return { id: 7, opportunityId: 3, revisionNumber: 0, name: null, job, summary: summarize(job), version: 4, locked: false, lockReason: null, createdAt: "2026-06-03T12:00:00Z", savedAt: "2026-06-03T12:00:00Z", createdBy: "estimator-1", savedBy: "estimator-1" };
}
beforeEach(() => {
  mocks.revision = revision();
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
});
