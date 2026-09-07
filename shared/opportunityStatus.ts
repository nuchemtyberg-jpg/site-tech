// Canonical Opportunity value lists — single source of truth shared by:
// - client dropdowns (Opportunities page, workflow rules admin)
// - server-side validation (opportunity create/update, status change service, workflow rules)
// Mirrors shared/projectStatus.ts. Never hard-code these labels elsewhere.

export type OpportunityStatusOption = { value: string; label: string; color: string };

export const OPPORTUNITY_STATUSES: OpportunityStatusOption[] = [
  { value: "new", label: "New", color: "#3b82f6" },
  { value: "under_review", label: "Under Review", color: "#6366f1" },
  { value: "estimating", label: "Estimating", color: "#8b5cf6" },
  { value: "proposal_ready", label: "Proposal Ready", color: "#a855f7" },
  { value: "proposal_sent", label: "Proposal Sent", color: "#06b6d4" },
  { value: "follow_up", label: "Follow-Up", color: "#0ea5e9" },
  { value: "on_hold", label: "On Hold", color: "#f59e0b" },
  { value: "awarded", label: "Awarded", color: "#22c55e" },
  { value: "lost", label: "Lost", color: "#ef4444" },
  { value: "no_bid", label: "No Bid", color: "#6b7280" },
];

export const OPPORTUNITY_STATUS_VALUES = OPPORTUNITY_STATUSES.map(s => s.value) as [string, ...string[]];

/** Terminal business outcomes. These are retained for reporting, not active bidding work. */
export const OPPORTUNITY_OUTCOME_STATUSES = ["awarded", "lost", "no_bid"] as const;
/** Statuses shown by the default active-opportunity dashboard view. */
export const OPPORTUNITY_ACTIVE_STATUSES = ["new", "under_review", "estimating", "proposal_ready", "proposal_sent", "follow_up", "on_hold"] as const;
/** Pre-submission statuses for which a bid deadline requires attention. */
export const OPPORTUNITY_DEADLINE_ELIGIBLE_STATUSES = ["new", "under_review", "estimating", "proposal_ready"] as const;

export const OPPORTUNITY_OUTCOME_STATUS_SET: ReadonlySet<string> = new Set(OPPORTUNITY_OUTCOME_STATUSES);
export const OPPORTUNITY_ACTIVE_STATUS_SET: ReadonlySet<string> = new Set(OPPORTUNITY_ACTIVE_STATUSES);
export const OPPORTUNITY_DEADLINE_ELIGIBLE_STATUS_SET: ReadonlySet<string> = new Set(OPPORTUNITY_DEADLINE_ELIGIBLE_STATUSES);

export type OpportunityDeadlineUrgency =
  | "overdue" | "today" | "tomorrow" | "this_week" | "next_7_days" | "later" | "no_due_date";

/**
 * Classifies an ISO date-only bid deadline relative to an ISO date-only today.
 * `this_week` means the remaining calendar week after tomorrow; `next_7_days`
 * is a rolling window and intentionally includes tomorrow through day seven.
 */
export function getOpportunityDeadlineUrgency(
  bidDueDate: string | null | undefined,
  today: string,
): OpportunityDeadlineUrgency {
  if (!bidDueDate) return "no_due_date";
  if (bidDueDate < today) return "overdue";
  if (bidDueDate === today) return "today";
  const todayDate = new Date(`${today}T00:00:00Z`);
  const daysAhead = Math.round((new Date(`${bidDueDate}T00:00:00Z`).getTime() - todayDate.getTime()) / 86_400_000);
  if (daysAhead === 1) return "tomorrow";
  if (daysAhead <= 7) {
    const daysUntilSunday = 7 - todayDate.getUTCDay();
    return daysAhead <= daysUntilSunday ? "this_week" : "next_7_days";
  }
  return "later";
}

export function getOpportunityStatusLabel(value: string | null | undefined): string {
  const status = OPPORTUNITY_STATUSES.find(s => s.value === value);
  return status?.label ?? (value || "Unknown");
}

export function getOpportunityStatusColor(value: string | null | undefined): string {
  const status = OPPORTUNITY_STATUSES.find(s => s.value === value);
  return status?.color ?? "#3b82f6";
}

// --- Opportunity source ---

export type LabeledValue = { value: string; label: string };

export const OPPORTUNITY_SOURCES: LabeledValue[] = [
  { value: "existing_customer", label: "Existing Customer" },
  { value: "invitation_to_bid", label: "Invitation to Bid" },
  { value: "email_rfp", label: "Email RFP" },
  { value: "referral", label: "Referral" },
  { value: "website_inbound", label: "Website / Inbound" },
  { value: "repeat_project", label: "Repeat Project" },
  { value: "developer_owner", label: "Developer / Owner" },
  { value: "public_bid", label: "Public Bid" },
  { value: "other", label: "Other" },
];
export const OPPORTUNITY_SOURCE_VALUES = OPPORTUNITY_SOURCES.map(s => s.value) as [string, ...string[]];

// --- Project type ---

export const OPPORTUNITY_PROJECT_TYPES: LabeledValue[] = [
  { value: "commercial", label: "Commercial" },
  { value: "multifamily", label: "Multifamily" },
  { value: "residential", label: "Residential" },
  { value: "industrial", label: "Industrial" },
  { value: "institutional", label: "Institutional" },
  { value: "municipal_public", label: "Municipal / Public" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "other", label: "Other" },
];
export const OPPORTUNITY_PROJECT_TYPE_VALUES = OPPORTUNITY_PROJECT_TYPES.map(s => s.value) as [string, ...string[]];

// --- Opportunity-specific contact roles (distinct from company-level contact roles) ---

export const OPPORTUNITY_CONTACT_ROLES: LabeledValue[] = [
  { value: "estimator", label: "Estimator" },
  { value: "project_manager", label: "Project Manager" },
  { value: "project_executive", label: "Project Executive" },
  { value: "superintendent", label: "Superintendent" },
  { value: "purchasing", label: "Purchasing" },
  { value: "accounting", label: "Accounting" },
  { value: "contract_signer", label: "Contract Signer" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];
export const OPPORTUNITY_CONTACT_ROLE_VALUES = OPPORTUNITY_CONTACT_ROLES.map(s => s.value) as [string, ...string[]];

// --- Lost reasons ---

export const OPPORTUNITY_LOST_REASONS: LabeledValue[] = [
  { value: "price", label: "Price" },
  { value: "competitor_selected", label: "Competitor Selected" },
  { value: "customer_cancelled", label: "Customer Cancelled Project" },
  { value: "schedule", label: "Schedule" },
  { value: "scope_changed", label: "Scope Changed" },
  { value: "relationship", label: "Relationship" },
  { value: "no_response", label: "No Response" },
  { value: "unknown", label: "Unknown" },
  { value: "other", label: "Other" },
];
export const OPPORTUNITY_LOST_REASON_VALUES = OPPORTUNITY_LOST_REASONS.map(s => s.value) as [string, ...string[]];

// --- No Bid reasons ---

export const OPPORTUNITY_NO_BID_REASONS: LabeledValue[] = [
  { value: "outside_scope", label: "Outside Scope" },
  { value: "insufficient_time", label: "Insufficient Time" },
  { value: "schedule_conflict", label: "Schedule Conflict" },
  { value: "too_far_geography", label: "Too Far / Geography" },
  { value: "project_risk", label: "Project Risk" },
  { value: "customer_credit_concern", label: "Customer / Credit Concern" },
  { value: "insufficient_information", label: "Insufficient Information" },
  { value: "capacity", label: "Capacity" },
  { value: "not_competitive", label: "Not Competitive" },
  { value: "other", label: "Other" },
];
export const OPPORTUNITY_NO_BID_REASON_VALUES = OPPORTUNITY_NO_BID_REASONS.map(s => s.value) as [string, ...string[]];

export function labelFor(list: LabeledValue[], value: string | null | undefined): string {
  const item = list.find(i => i.value === value);
  return item?.label ?? (value || "");
}

// --- Workflow trigger types (project + opportunity status changes) ---

export const WORKFLOW_TRIGGER_TYPES = [
  { value: "project_status_change", label: "Project status change" },
  { value: "opportunity_status_change", label: "Opportunity status change" },
] as const;
export const WORKFLOW_TRIGGER_TYPE_VALUES = ["project_status_change", "opportunity_status_change"] as [string, ...string[]];
