import { storage } from "../storage";
import { logActivity, type Actor } from "./activityLog";
import { handleOpportunityStatusChange } from "./workflowEngine";
import {
  getOpportunityStatusLabel,
  OPPORTUNITY_STATUS_VALUES,
  OPPORTUNITY_LOST_REASONS,
  OPPORTUNITY_NO_BID_REASONS,
  labelFor,
} from "@shared/opportunityStatus";
import type { Opportunity, OpportunityStatusChangeInput } from "@shared/schema";
import { awardBid, OpportunityStatusError } from "./awardService";
export { OpportunityStatusError } from "./awardService";

// Centralized Opportunity status change service (spec §48).
//
// EVERY opportunity status transition — from any screen or API — must run
// through this one method. It:
//   1. validates the new status,
//   2. no-ops when the status is unchanged (re-saving never triggers anything),
//   3. updates the record under a row lock (atomic transition detection),
//   4. captures Lost / No Bid reasons and the award date at the appropriate
//      transitions (and clears stale outcome fields when leaving them),
//   5. writes status history,
//   6. records activity,
//   7. fires workflow rules exactly once per real transition.

export async function changeOpportunityStatus(params: {
  opportunityId: number;
  input: OpportunityStatusChangeInput;
  actor: Actor;
  today?: string; // client-local date (YYYY-MM-DD)
}): Promise<{ opportunity: Opportunity; changed: boolean }> {
  const { opportunityId, input, actor } = params;
  const todayStr = params.today || new Date().toISOString().slice(0, 10);
  const newStatus = input.status;

  if (!OPPORTUNITY_STATUS_VALUES.includes(newStatus)) {
    throw new OpportunityStatusError(`Invalid opportunity status: ${newStatus}`);
  }
  if (newStatus === "awarded") return awardBid({
    opportunityId, actor, awardDate: input.awardDate, today: todayStr, expectedTargetProjectId: input.expectedTargetProjectId,
  });

  const existing = await storage.getOpportunity(opportunityId);
  if (!existing) throw new OpportunityStatusError("Opportunity not found", 404);
  if (existing.convertedProjectId || existing.status === "awarded") {
    if (newStatus !== "awarded") throw new OpportunityStatusError("Award reversal requires a separate future workflow; Project status does not reverse an award", 409);
  }

  // Fast no-op path (the row-locked update below re-checks atomically)
  if (existing.status === newStatus) {
    return { opportunity: existing, changed: false };
  }

  // Reason requirements + outcome field capture
  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === "lost") {
    if (!input.lostReason) throw new OpportunityStatusError("Lost reason is required when marking an opportunity Lost");
    updates.lostReason = input.lostReason;
    updates.lostReasonNotes = input.lostReasonNotes?.trim() || null;
  } else if (newStatus === "no_bid") {
    if (!input.noBidReason) throw new OpportunityStatusError("No Bid reason is required when marking an opportunity No Bid");
    updates.noBidReason = input.noBidReason;
    updates.noBidReasonNotes = input.noBidReasonNotes?.trim() || null;
  } else if (newStatus === "awarded") {
    updates.awardDate = input.awardDate || todayStr;
  }
  // Leaving an outcome status clears its stale capture so records stay honest
  if (existing.status === "lost" && newStatus !== "lost") {
    updates.lostReason = null;
    updates.lostReasonNotes = null;
  }
  if (existing.status === "no_bid" && newStatus !== "no_bid") {
    updates.noBidReason = null;
    updates.noBidReasonNotes = null;
  }
  if (existing.status === "awarded" && newStatus !== "awarded") {
    updates.awardDate = null;
  }

  // Atomic transition under a row lock: the status update AND its history row
  // (the workflow idempotency identity) commit in one transaction. Concurrent
  // duplicate requests cannot both observe the same transition, and a failure
  // rolls the whole transition back so a retry re-runs it — no status event
  // can be committed without its history.
  const { opportunity, previousStatus, changed, history } =
    await storage.updateOpportunityWithStatusTracking(opportunityId, updates as any, {
      userId: actor.id,
      name: actor.name,
    });
  if (!changed || !history) return { opportunity, changed: false };

  const prevLabel = previousStatus ? getOpportunityStatusLabel(previousStatus) : null;
  const newLabel = getOpportunityStatusLabel(newStatus);
  let outcomeNote = "";
  if (newStatus === "lost") outcomeNote = ` Reason: ${labelFor(OPPORTUNITY_LOST_REASONS, input.lostReason)}.`;
  if (newStatus === "no_bid") outcomeNote = ` Reason: ${labelFor(OPPORTUNITY_NO_BID_REASONS, input.noBidReason)}.`;
  if (newStatus === "awarded") outcomeNote = ` Award date: ${opportunity.awardDate}.`;

  await logActivity({
    entityType: "opportunity",
    entityId: opportunity.id,
    action: "opportunity_status_changed",
    actor,
    description: prevLabel
      ? `${actor.name} changed status of ${opportunity.opportunityNumber} from ${prevLabel} to ${newLabel}.${outcomeNote}`
      : `${actor.name} set status of ${opportunity.opportunityNumber} to ${newLabel}.${outcomeNote}`,
    metadata: {
      opportunityId: opportunity.id,
      customerId: opportunity.customerId,
      previousStatus,
      newStatus,
      statusHistoryId: history.id,
      ...(newStatus === "lost" ? { lostReason: input.lostReason } : {}),
      ...(newStatus === "no_bid" ? { noBidReason: input.noBidReason } : {}),
      ...(newStatus === "awarded" ? { awardDate: opportunity.awardDate } : {}),
    },
  });

  // Workflow rules — never fail the status change itself
  try {
    await handleOpportunityStatusChange({
      opportunity,
      previousStatus,
      newStatus,
      statusHistoryId: history.id,
      today: todayStr,
    });
  } catch (err) {
    console.error("[Opportunity] Workflow processing failed for status change:", err);
  }

  return { opportunity, changed: true };
}
