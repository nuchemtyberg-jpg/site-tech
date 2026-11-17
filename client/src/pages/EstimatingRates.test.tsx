import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyJob } from "@shared/estimating/model";
import EstimatingRates from "./EstimatingRates";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refetch: vi.fn() }));
const original = {
  ...emptyJob(),
  rates: [{ id: "stone", key: "STONE", desc: "Crushed stone", value: "42.75", unit: "TON", category: "", notes: "" }],
};
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { role: "estimator" } }) }));
vi.mock("@/hooks/use-estimates", () => ({
  useEstimatingRates: () => ({ data: { rates: original, version: 3 }, refetch: mocks.refetch, isFetching: false, isLoading: false }),
  useSaveEstimatingRates: () => ({ mutate: mocks.save, isPending: false }),
}));
vi.mock("@/components/estimating/use-unsaved-estimate", () => ({ useUnsavedEstimate: vi.fn() }));
vi.mock("@/components/estimating/RateHistory", () => ({ RateHistory: () => <div>Rate history</div> }));
vi.mock("@/components/estimating/RateImportDialog", () => ({
  RateImportDialog: ({ onApplied, onClose }: { onApplied: (value: unknown) => void; onClose: () => void }) => <button onClick={() => { onApplied({ rates: { ...original, rates: [{ ...original.rates[0], value: "59.15" }] }, version: 12 }); onClose(); }}>Apply test import</button>,
}));

describe("Company estimating rates draft protection", () => {
  beforeEach(() => { mocks.save.mockReset(); mocks.refetch.mockReset(); });
  it("disables spreadsheet import and explains why when the company draft is dirty", async () => {
    const user = userEvent.setup();
    render(<EstimatingRates />);
    expect(screen.getByRole("button", { name: "Import spreadsheet" })).toBeEnabled();
    await user.type(screen.getByLabelText("Source / notes"), "New supplier");
    expect(screen.getByRole("button", { name: "Import spreadsheet" })).toBeDisabled();
    expect(screen.getByText(/Spreadsheet import is disabled/)).toBeInTheDocument();
  });
  it("accepts the server version and preserves edits made while a save is in flight", async () => {
    const user = userEvent.setup();
    render(<EstimatingRates />);
    const notes = screen.getByLabelText("Source / notes");
    await user.type(notes, "Submitted");
    await user.click(screen.getByRole("button", { name: "Save company rates" }));
    const [submitted, options] = mocks.save.mock.calls[0];
    await user.type(notes, " plus newer edits");
    act(() => options.onSuccess({ rates: submitted.rates, version: 9 }));
    expect(notes).toHaveValue("Submitted plus newer edits");
    expect(screen.getByText(/Newer local edits are still unsaved/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save company rates" }));
    expect(mocks.save.mock.calls[1][0].version).toBe(9);
  });
  it("resets the baseline to the actual import response rather than guessing the version", async () => {
    const user = userEvent.setup();
    render(<EstimatingRates />);
    await user.click(screen.getByRole("button", { name: "Import spreadsheet" }));
    await user.click(screen.getByRole("button", { name: "Apply test import" }));
    expect(screen.getByLabelText("Value / formula")).toHaveValue("59.15");
    expect(screen.getByText("Saved · version 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save company rates" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Source / notes"), { target: { value: "Another update" } });
    await user.click(screen.getByRole("button", { name: "Save company rates" }));
    expect(mocks.save.mock.calls[0][0].version).toBe(12);
  });
});
