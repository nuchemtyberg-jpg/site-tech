import { describe, expect, it } from "vitest";
import { emptyJob, newCategory, newLine } from "@shared/estimating/model";
import { csvCell, estimateCsv } from "./exports";

describe("Estimating CSV", () => {
  it("quotes delimiters, newlines and double quotes", () => {
    expect(csvCell('Excavate, "north"\narea')).toBe('"Excavate, ""north""\narea"');
  });
  it("protects text against spreadsheet formula injection without changing numeric amounts", () => {
    for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", " \t=1", "\r\n+1"]) expect(csvCell(value)).toContain(`"'`);
    expect(csvCell(-12.5)).toBe('"-12.5"');
    expect(csvCell("Excavate")).toBe('"Excavate"');
  });
  it("only includes in-scope cover lines with consecutive numbers and includes notes", () => {
    const job = emptyJob(), cat = newCategory();
    cat.name = "3. Earthwork";
    const line = { ...newLine(), desc: "3.4. Excavate", qty: "12", unit: "CY", priceOverride: "15" };
    cat.items = [line, { ...newLine(), desc: "Excluded line", excluded: true }, { ...newLine(), desc: "Backfill" }];
    const excluded = { ...newCategory(), name: "Excluded category", excluded: true, items: [{ ...newLine(), desc: "Hidden work" }] };
    const second = { ...newCategory(), name: "9. Paving", items: [{ ...newLine(), desc: "9.2 Wearing course" }] };
    job.categories = [cat, excluded, second];
    job.notes = "=Do not interpret this as a formula";
    const csv = estimateCsv(job);
    expect(csv).toContain('"1","Earthwork"');
    expect(csv).toContain('"1.1","Excavate","12","CY","15","180"');
    expect(csv).toContain('"1.2","Backfill"');
    expect(csv).toContain('"2","Paving"');
    expect(csv).toContain('"2.1","Wearing course"');
    expect(csv).not.toContain("3. Earthwork");
    expect(csv).not.toContain("9.2 Wearing course");
    expect(cat.name).toBe("3. Earthwork");
    expect(csv).not.toContain("Excluded line");
    expect(csv).not.toContain("Hidden work");
    expect(csv).toContain("'=Do not interpret");
    expect(estimateCsv(job, true)).toContain("Yes · would-be amounts");
  });
  it("hides only quantities and units, keeping unit prices and totals when takeoff is off", () => {
    const job = emptyJob();
    job.categories = [{ ...newCategory(), items: [{ ...newLine(), desc: "Excavate", qty: "12", unit: "CY", priceOverride: "15" }] }];
    job.coverShowTakeoff = false;
    const csv = estimateCsv(job);
    expect(csv).toContain('"No.","Description","Unit price","Amount"');
    expect(csv).not.toContain('"Quantity"');
    expect(csv).not.toContain('"Unit"');
    expect(csv).toContain('"1.1","Excavate","15","180"');
    expect(csv).toContain('"","Total estimate","","180"');
  });
});
