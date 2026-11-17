import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyJob, newCategory, newLine, type EstimateJob } from "@shared/estimating/model";
import { TakeoffEditor } from "./TakeoffEditor";

function Controlled({ initial }: { initial: EstimateJob }) {
  const [job, setJob] = useState(initial);
  return <TakeoffEditor job={job} onChange={setJob} />;
}
describe("Practical takeoff editing", () => {
  it("opens saved categories and lines collapsed, and opens new lines", () => {
    const job = emptyJob(), cat = newCategory();
    cat.name = "Earthwork"; cat.items = [{ ...newLine(), desc: "Rough grade" }]; job.categories = [cat];
    render(<Controlled initial={job} />);
    expect(screen.queryByText("Rough grade")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand category Earthwork" }));
    expect((screen.getByLabelText("Description 1.1") as HTMLTextAreaElement).value).toBe("Rough grade");
    expect(screen.queryByLabelText("Drawing reference")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(screen.getByLabelText("Drawing reference")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Add .* row$/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: /^Collapse line 1.2/ })).toBeTruthy();
  });
  it("makes a new category editable and keeps full job information available", () => {
    render(<Controlled initial={emptyJob()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    expect(screen.getByLabelText("Category title 1")).toBeTruthy();
    expect(screen.getByLabelText("Job name")).toBeTruthy();
    expect(screen.getByLabelText("Show takeoff quantities, units and unit prices on cover")).toBeTruthy();
  });
  it("edits collapsed category titles and markups without expanding", () => {
    const job = emptyJob(), cat = newCategory();
    cat.name = "Earthwork"; job.categories = [cat];
    render(<Controlled initial={job} />);
    fireEvent.change(screen.getByLabelText("Category title 1"), { target: { value: "Earthwork\nand shoring" } });
    fireEvent.change(screen.getByLabelText("Tax %"), { target: { value: "8.875" } });
    expect(screen.getByRole("button", { name: /Expand category Earthwork/ }).getAttribute("aria-expanded")).toBe("false");
    expect((screen.getByLabelText("Tax %") as HTMLInputElement).value).toBe("8.875");
    expect(screen.queryByRole("combobox", { name: /Move category/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Up" })).toBeNull();
  });
  it("edits inline unit price, resets it, toggles scope and opens duplicated lines", () => {
    const job = emptyJob(), cat = newCategory();
    cat.name = "Earthwork"; cat.items = [{ ...newLine(), desc: "Rough grade", qty: "3", unit: "CY" }]; job.categories = [cat];
    render(<Controlled initial={job} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand category Earthwork" }));
    const price = screen.getByLabelText("Unit price 1.1") as HTMLInputElement;
    expect(price.placeholder).toBe("$0.00");
    fireEvent.change(price, { target: { value: "17.25" } });
    expect(screen.getByText("Manual price · calculated $0.00")).toBeTruthy();
    expect(screen.getAllByText("$51.75").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Reset Unit price 1.1 to calculated" }));
    expect(price.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Exclude line 1.1" }));
    expect(screen.getByRole("button", { name: "Exclude line 1.1" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Duplicate line 1.1" }));
    expect(screen.getByRole("button", { name: /^Collapse line 1.2/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Up" })).toBeTruthy();
  });
  it("uses compact resource tables, evaluates formulas, and duplicates and deletes costs", () => {
    const job = emptyJob(), cat = newCategory();
    cat.name = "Earthwork"; cat.items = [{ ...newLine(), desc: "Rough grade", qty: "3" }]; job.categories = [cat];
    render(<Controlled initial={job} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand category Earthwork" }));
    fireEvent.click(screen.getByRole("button", { name: /^Expand line 1.1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add material row" }));
    const material = within(screen.getByRole("region", { name: "Material costs" }));
    fireEvent.change(material.getByLabelText("Quantity"), { target: { value: "qty*2" } });
    fireEvent.change(material.getByLabelText("Unit cost"), { target: { value: "8.75" } });
    expect(material.getByText("= 6")).toBeTruthy();
    expect(material.getAllByText("$52.50").length).toBeGreaterThan(0);
    expect(material.queryByLabelText("Length · ft")).toBeNull();
    fireEvent.change(material.getByLabelText("Material calculator"), { target: { value: "lf" } });
    expect(material.getByLabelText("Length · ft")).toBeTruthy();
    fireEvent.change(material.getByLabelText("Length · ft"), { target: { value: "1/0" } });
    expect(material.getByLabelText("Length · ft").getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(material.getByRole("button", { name: "Duplicate material row" }));
    expect(material.getAllByLabelText("Material calculator")).toHaveLength(2);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(material.getAllByRole("button", { name: "Delete material row" })[0]);
    expect(material.getAllByLabelText("Material calculator")).toHaveLength(1);
    confirm.mockRestore();
    expect(screen.getByText("Price buildup")).toBeTruthy();
  });
  it("shows the effective unit price beneath Sell and marks only overrides as manual", () => {
    const job = emptyJob(), cat = newCategory();
    cat.name = "Earthwork";
    cat.items = [{ ...newLine(), desc: "Rough grade", qty: "3", priceOverride: "17.25" }];
    job.categories = [cat];
    render(<Controlled initial={job} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand category Earthwork" }));
    fireEvent.click(screen.getByRole("button", { name: /^Expand line 1.1/ }));
    const unitPrice = screen.getByText("Unit price · manual");
    expect(unitPrice.previousElementSibling?.textContent).toBe("$51.75");
    expect(unitPrice.nextElementSibling?.textContent).toBe("$17.25");
    expect(unitPrice.className).toContain("estimate-buildup-manual");
    expect(unitPrice.nextElementSibling?.className).toContain("estimate-buildup-manual");
    fireEvent.click(screen.getByRole("button", { name: "Reset Unit price 1.1 to calculated" }));
    expect(screen.queryByText("Unit price · manual")).toBeNull();
    const buildup = screen.getByText("Price buildup").nextElementSibling!;
    const calculated = within(buildup as HTMLElement).getByText("Unit price");
    expect(calculated.nextElementSibling?.textContent).toBe("$0.00");
    expect(calculated.className).not.toContain("estimate-buildup-manual");
  });
  it("keeps size, drag, expansion and labeled resource fields available for mobile cards", () => {
    const job = emptyJob(), cat = newCategory();
    cat.name = "Earthwork";
    cat.items = [{ ...newLine(), desc: "Rough grade", size: "12 by 18" }];
    job.categories = [cat];
    render(<Controlled initial={job} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand category Earthwork" }));
    expect(screen.getByTitle("Drag line").getAttribute("draggable")).toBe("true");
    fireEvent.change(screen.getByLabelText("Size 1.1"), { target: { value: "18 by 24" } });
    expect((screen.getByLabelText("Size 1.1") as HTMLTextAreaElement).value).toBe("18 by 24");
    fireEvent.click(screen.getByRole("button", { name: /^Expand line 1.1/ }));
    for (const kind of ["material", "labor", "equipment", "subcontract / other"]) {
      fireEvent.click(screen.getByRole("button", { name: `Add ${kind} row` }));
    }
    for (const title of ["Material", "Labor", "Equipment", "Subcontract / other"]) {
      const region = screen.getByRole("region", { name: `${title} costs` });
      const cells = region.querySelectorAll("tbody tr:first-child td");
      expect(cells.length).toBeGreaterThan(4);
      for (const cell of Array.from(cells).slice(0, -1)) expect(cell.getAttribute("data-label")).toBeTruthy();
      expect(within(region).getByRole("button", { name: `Duplicate ${title.toLowerCase()} row` })).toBeTruthy();
      expect(within(region).getByRole("button", { name: `Delete ${title.toLowerCase()} row` })).toBeTruthy();
    }
  });
});
