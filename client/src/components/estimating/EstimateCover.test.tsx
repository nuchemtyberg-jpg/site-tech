import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { computeJob } from "@shared/estimating/engine";
import { emptyJob, newCategory, newLine } from "@shared/estimating/model";
import { EstimateCover } from "./EstimateCover";
import { coverTitle } from "./cover-title";

describe("Estimate cover", () => {
  it.each([true, false])("keeps unit prices and totals visible with coverShowTakeoff=%s", showTakeoff => {
    const job = emptyJob();
    job.coverShowTakeoff = showTakeoff;
    job.categories = [{ ...newCategory(), name: "4. Earthwork", items: [{ ...newLine(), desc: "4.3. Excavate", qty: "12", unit: "CY", priceOverride: "15" }] }];
    render(<EstimateCover job={job} computed={computeJob(job)} />);
    expect(screen.getByRole("columnheader", { name: /^Unit price$/ })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeTruthy();
    expect(!!screen.queryByRole("columnheader", { name: "Quantity" })).toBe(showTakeoff);
    expect(!!screen.queryByRole("columnheader", { name: /^Unit$/ })).toBe(showTakeoff);
    const line = screen.getByText("Excavate").closest("tr")!;
    expect(within(line).getByText("1.1")).toBeTruthy();
    expect(within(line).getByText("$15.00")).toBeTruthy();
    expect(within(line).getByText("$180.00")).toBeTruthy();
    expect(within(line).queryAllByRole("cell")).toHaveLength(showTakeoff ? 6 : 4);
    const total = screen.getByText("Total estimate").closest("tr")!;
    expect(within(total).getByText("$180.00")).toBeTruthy();
    expect(screen.getByText("Earthwork")).toBeTruthy();
    expect(screen.queryByText("4. Earthwork")).toBeNull();
  });
  it("renumbers only included categories and lines", () => {
    const job = emptyJob();
    job.categories = [
      { ...newCategory(), name: "1. Excluded category", excluded: true },
      { ...newCategory(), name: "2. Earthwork", items: [{ ...newLine(), desc: "Hidden", excluded: true }, { ...newLine(), desc: "2.8 Grade" }] },
      { ...newCategory(), name: "7. Paving", items: [{ ...newLine(), desc: "7.3 Asphalt" }] },
    ];
    render(<EstimateCover job={job} computed={computeJob(job)} />);
    expect(screen.queryByText("Excluded category")).toBeNull();
    expect(screen.queryByText("Hidden")).toBeNull();
    expect(within(screen.getByText("Earthwork").closest("tr")!).getByText("1")).toBeTruthy();
    expect(within(screen.getByText("Paving").closest("tr")!).getByText("2")).toBeTruthy();
    expect(within(screen.getByText("Grade").closest("tr")!).getByText("1.1")).toBeTruthy();
    expect(within(screen.getByText("Asphalt").closest("tr")!).getByText("2.1")).toBeTruthy();
  });
  it("does not remove meaningful size numbers", () => {
    expect(coverTitle('24" pipe')).toBe('24" pipe');
    expect(coverTitle("24 inch pipe")).toBe("24 inch pipe");
  });
});
