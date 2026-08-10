// Canonical project status list — single source of truth shared by:
// - client status dropdowns (Projects, ProjectDetails)
// - workflow rules admin (trigger status dropdown)
// - server-side validation (project create/update, workflow rules)
export type ProjectStatusOption = { value: string; label: string; color: string };

export const PROJECT_STATUSES: ProjectStatusOption[] = [
  { value: "new", label: "New", color: "#3b82f6" },
  { value: "bidding", label: "Bidding", color: "#6366f1" },
  { value: "takeoff_done", label: "Takeoff Done", color: "#8b5cf6" },
  { value: "takeoff_reviewed", label: "Takeoff Reviewed", color: "#a855f7" },
  { value: "proposal_sent", label: "Proposal Sent", color: "#06b6d4" },
  { value: "active", label: "Active", color: "#f97316" },
  { value: "completed", label: "Completed", color: "#22c55e" },
  { value: "bid_lost", label: "Bid Lost", color: "#ef4444" },
  { value: "archive", label: "Archive", color: "#6b7280" },
];

export const PROJECT_STATUS_VALUES = PROJECT_STATUSES.map(s => s.value) as [string, ...string[]];

export function getProjectStatusLabel(value: string | null | undefined): string {
  const status = PROJECT_STATUSES.find(s => s.value === value);
  return status?.label ?? (value || "Unknown");
}

export function getProjectStatusColor(value: string | null | undefined): string {
  const status = PROJECT_STATUSES.find(s => s.value === value);
  return status?.color ?? "#f97316";
}
