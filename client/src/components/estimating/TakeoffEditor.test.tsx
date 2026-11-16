import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    fireEvent.click(screen.getByRole("button", { name: /1. Earthwork/ }));
    expect(screen.getByText("Rough grade")).toBeTruthy();
    expect(screen.queryByLabelText("Size / steel section")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(screen.getByLabelText("Size / steel section")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add row" })).toHaveLength(4);
  });
  it("makes a new category editable and keeps full job information available", () => {
    render(<Controlled initial={emptyJob()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    expect(screen.getByLabelText("Category title")).toBeTruthy();
    expect(screen.getByLabelText("Job name")).toBeTruthy();
    expect(screen.getByLabelText("Show takeoff quantities, units and unit prices on cover")).toBeTruthy();
  });
});
