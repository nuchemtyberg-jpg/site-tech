export function canChangeOpportunityStatus(current: string, next: string) {
  if (current === "awarded") return false;
  if ((current === "lost" || current === "no_bid") && next === "awarded") return false;
  return true;
}

export function awardDestination(targetProjectId: number | null | undefined, projectName?: string | null) {
  return targetProjectId
    ? `Adds a new contract to ${projectName || "the selected project"}`
    : "Creates a new project with status New";
}

export function awardStatusPayload(awardDate: string, targetProjectId: number | null | undefined) {
  return { awardDate, expectedTargetProjectId: targetProjectId ?? null };
}
