import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { emptyJob, type EstimateRates } from "@shared/estimating/model";
import { RatesEditor } from "./RatesEditor";

const initial: EstimateRates = {
  ...emptyJob(),
  rates: [
    { id: "stone", key: "STONE", desc: "Crushed stone", unit: "TON", value: "42.75", category: "Sitework", notes: "Delivered to Newark" },
    { id: "blank", key: "ALLOWANCE", desc: "Pending vendor quote", unit: "EA", value: "" },
    { id: "bolt", key: "BOLT", desc: "Anchor bolt", unit: "EA", value: "2.35", category: "Anchors", notes: "" },
  ],
};
function Editor() {
  const [rates, setRates] = useState(initial);
  return <RatesEditor rates={rates} onChange={setRates} />;
}
describe("RatesEditor", () => {
  it("groups alphabetically with Uncategorized last, and collapses groups", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor />);
    const groups = Array.from(container.querySelectorAll("details"));
    expect(groups.map(group => group.querySelector("summary")?.textContent)).toEqual(["Anchors1 rate", "Sitework1 rate", "Uncategorized1 rate"]);
    await user.click(groups[0].querySelector("summary")!);
    expect(groups[0]).not.toHaveAttribute("open");
    await user.click(groups[0].querySelector("summary")!);
    expect(groups[0]).toHaveAttribute("open");
    expect(screen.getByText("No price set")).toBeInTheDocument();
  });
  it("searches notes and filters material categories without removing rows", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.type(screen.getByLabelText("Search material rates"), "Newark");
    expect(screen.getByDisplayValue("STONE")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("BOLT")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search material rates"));
    await user.selectOptions(screen.getByLabelText("Material category"), "Anchors");
    expect(screen.getByDisplayValue("BOLT")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("STONE")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add material rate" }));
    expect(screen.getByDisplayValue("STONE")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Key")).toHaveLength(4);
  });
  it("keeps category input focused until committing the move on blur", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const category = screen.getAllByLabelText("Category")[0];
    await user.clear(category);
    await user.type(category, "Concrete");
    expect(category).toHaveFocus();
    fireEvent.blur(category);
    expect(screen.getByText("Concrete", { selector: "summary" })).toBeInTheDocument();
  });
  it("defaults legacy notes to empty and makes history snapshots read-only", () => {
    render(<RatesEditor rates={initial} onChange={() => {}} readOnly />);
    expect(screen.getByLabelText("Material tax notes")).toHaveValue("");
    expect(screen.getByLabelText("Material tax notes")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add material rate" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search material rates")).toBeEnabled();
  });
});
