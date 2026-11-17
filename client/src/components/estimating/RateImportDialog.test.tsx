import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyJob } from "@shared/estimating/model";
import type { RatePreview } from "@shared/estimating/rate-import";
import { RateImportDialog } from "./RateImportDialog";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn() }));
vi.mock("@/hooks/use-rate-import", () => ({
  usePreviewRateImport: () => ({ mutateAsync: mocks.preview, isPending: false }),
  useApplyRateImport: () => ({ mutate: mocks.apply, isPending: false }),
}));
const preview: RatePreview = {
  version: 7, counts: { new: 1, changed: 1, unchanged: 2 }, errors: [], warnings: ["Materials row 3: no price set."], token: "confirmation-token",
  changes: [{ section: "Materials", label: "STONE", status: "changed", before: { value: "41.25" }, after: { value: "42.75", notes: "Supplier update" } }],
};
describe("RateImportDialog", () => {
  beforeEach(() => { mocks.preview.mockReset().mockResolvedValue(preview); mocks.apply.mockReset(); });
  it("previews without replacing markups by default, displays old/new, and cancels without applying", async () => {
    const user = userEvent.setup(), close = vi.fn(), applied = vi.fn();
    render(<RateImportDialog estimateRates={emptyJob()} onClose={close} onApplied={applied} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    await screen.findByText("41.25");
    expect(screen.getByText("42.75")).toBeInTheDocument();
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ source: "estimate", replaceDefaultMarkups: false }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(applied).not.toHaveBeenCalled();
  });
  it("honors the markup checkbox and applies only the confirmation token", async () => {
    const user = userEvent.setup(), applied = vi.fn(), close = vi.fn();
    const result = { rates: emptyJob(), version: 8 };
    mocks.apply.mockImplementation((token, options) => options.onSuccess(result));
    render(<RateImportDialog estimateRates={emptyJob()} onClose={close} onApplied={applied} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    await screen.findByText("41.25");
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ replaceDefaultMarkups: true }));
    await user.click(screen.getByRole("button", { name: "Confirm company rate changes" }));
    expect(mocks.apply).toHaveBeenCalledWith("confirmation-token", expect.any(Object));
    expect(applied).toHaveBeenCalledWith(result);
    expect(close).toHaveBeenCalledOnce();
  });
  it.each([
    { ...preview, errors: ["Duplicate key STONE"] },
    { ...preview, token: undefined },
  ])("blocks confirmation with errors or without a token", async invalid => {
    mocks.preview.mockResolvedValue(invalid);
    const user = userEvent.setup();
    render(<RateImportDialog estimateRates={emptyJob()} onClose={() => {}} onApplied={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    expect(await screen.findByRole("button", { name: "Confirm company rate changes" })).toBeDisabled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("reads a CSV as base64 and submits the assigned tab", async () => {
    const user = userEvent.setup();
    render(<RateImportDialog onClose={() => {}} onApplied={() => {}} />);
    await user.upload(screen.getByLabelText("Rate spreadsheet files"), new File(["Labor type,Hourly rate\nOperator,65"], "crew.csv", { type: "text/csv" }));
    await user.selectOptions(screen.getByLabelText("Tab for crew.csv"), "Labor");
    await user.click(screen.getByRole("button", { name: "Preview changes" }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith({
      source: "spreadsheet", files: [{ name: "crew.csv", tab: "Labor", data: btoa("Labor type,Hourly rate\nOperator,65") }],
    }));
  });
  it("rejects more than four files before a preview request", async () => {
    const user = userEvent.setup();
    render(<RateImportDialog onClose={() => {}} onApplied={() => {}} />);
    await user.upload(screen.getByLabelText("Rate spreadsheet files"), Array.from({ length: 5 }, (_, i) => new File([""], `${i}.csv`, { type: "text/csv" })));
    expect(screen.getByRole("alert")).toHaveTextContent("at most four");
    expect(screen.getByRole("button", { name: "Preview changes" })).toBeDisabled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
