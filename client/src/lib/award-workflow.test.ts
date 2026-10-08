import { describe, expect, it } from "vitest";
import { awardDestination, awardStatusPayload, canChangeOpportunityStatus } from "./award-workflow";

describe("immutable award workflow", () => {
  it("allows an active opportunity to be awarded", () => {
    expect(canChangeOpportunityStatus("in_progress", "awarded")).toBe(true);
  });
  it("requires lost and no-bid opportunities to be reopened first", () => {
    expect(canChangeOpportunityStatus("lost", "awarded")).toBe(false);
    expect(canChangeOpportunityStatus("no_bid", "awarded")).toBe(false);
    expect(canChangeOpportunityStatus("lost", "new")).toBe(true);
  });
  it("does not allow an awarded record to be changed", () => {
    expect(canChangeOpportunityStatus("awarded", "new")).toBe(false);
    expect(canChangeOpportunityStatus("awarded", "awarded")).toBe(false);
  });
  it("previews whether an award creates a project or adds a contract", () => {
    expect(awardDestination(null)).toBe("Creates a new project with status New");
    expect(awardDestination(8, "Harbor retrofit")).toBe("Adds a new contract to Harbor retrofit");
  });
  it("sends the confirmed target project as an optimistic concurrency guard, including null", () => {
    expect(awardStatusPayload("2025-03-06", 18)).toEqual({ awardDate: "2025-03-06", expectedTargetProjectId: 18 });
    expect(awardStatusPayload("2025-03-06", undefined)).toEqual({ awardDate: "2025-03-06", expectedTargetProjectId: null });
  });
});
