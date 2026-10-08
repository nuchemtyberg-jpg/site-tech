import { and, eq, isNull, or, sql, asc } from "drizzle-orm";
import { db } from "../db";
import {
  opportunities, projects, projectContracts, customers, users,
  opportunityStatusHistory, projectStatusHistory, activityLogs,
  workflowRules, workflowExecutions, todos, notifications, opportunityScopeItems,
  type Opportunity,
} from "@shared/schema";
import type { Actor } from "./activityLog";
import { computeDueDate } from "./workflowEngine";
import { sendWorkflowEmail } from "./workflowMailer";

export class OpportunityStatusError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function validateBidTarget(tx: any, targetId: number | null | undefined, customerId: number) {
  if (targetId == null) return;
  const [project] = await tx.select().from(projects)
    .where(and(eq(projects.id, targetId), isNull(projects.deletedAt))).for("update");
  if (!project) throw new OpportunityStatusError("Selected Project is missing or deleted", 409);
  if (project.customerId !== customerId) throw new OpportunityStatusError("Bid and target Project must have the same customer", 409);
}

// Shared lock and numeric allocation with ordinary Project creation.
export async function allocateProjectNumber(tx: any): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('project_number'))`);
  const result = await tx.execute(sql`
    select coalesce(max(substring(project_number from '^S-([0-9]+)$')::bigint),999) as seq from projects
  `);
  return `S-${Number(result.rows[0].seq) + 1}`;
}

export function projectEmail(name: string, id: number) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30)}-${id}@updates.sitetechnj.com`;
}

/** Award never moves related records. Bid locks coordinate uploads/edits with
 * snapshot capture; shared document identities make stale uploads safe. */
export async function awardBid(params: {
  opportunityId: number; actor: Actor; awardDate?: string | null;
  today?: string; catchUp?: boolean;
  expectedTargetProjectId?: number | null;
}) {
  const emailJobs: Parameters<typeof sendWorkflowEmail>[0][] = [];
  const result = await db.transaction(async tx => {
    const [actor] = params.actor.id ? await tx.select().from(users).where(eq(users.id, params.actor.id)) : [];
    if (!actor || actor.isAuthorized !== "approved") throw new OpportunityStatusError("Approved staff access required", 403);
    if (params.catchUp && actor.role !== "admin") throw new OpportunityStatusError("Admin approval required for catch-up", 403);
    const [bid] = await tx.select().from(opportunities)
      .where(and(eq(opportunities.id, params.opportunityId), isNull(opportunities.deletedAt))).for("update");
    if (!bid) throw new OpportunityStatusError("Opportunity not found", 404);
    const [existingContract] = await tx.select().from(projectContracts).where(eq(projectContracts.opportunityId, bid.id));
    if (existingContract || bid.convertedProjectId) {
      const projectId = existingContract?.projectId ?? bid.convertedProjectId!;
      const [project] = await tx.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
      if (!project || !existingContract || existingContract.projectId !== bid.convertedProjectId || bid.status !== "awarded") {
        throw new OpportunityStatusError("Broken award association: explicit reconciliation is required; no replacement was created", 409);
      }
      return { opportunity: bid, changed: false };
    }
    if (params.expectedTargetProjectId !== undefined && params.expectedTargetProjectId !== bid.targetProjectId) {
      throw new OpportunityStatusError("The target Project changed in another tab. Refresh and confirm the new award destination", 409);
    }
    if (bid.status === "awarded" && !params.catchUp) {
      throw new OpportunityStatusError("This older award needs the approved catch-up operation", 409);
    }
    if (params.catchUp && bid.status !== "awarded") throw new OpportunityStatusError("Only existing awarded bids can be caught up", 409);
    if (["lost", "no_bid"].includes(bid.status)) throw new OpportunityStatusError("Reopen this Lost or No Bid opportunity before awarding", 409);
    const [customer] = await tx.select().from(customers).where(and(eq(customers.id, bid.customerId), isNull(customers.deletedAt))).for("share");
    if (!customer) throw new OpportunityStatusError("Bid customer is missing or deleted", 409);
    await validateBidTarget(tx, bid.targetProjectId, bid.customerId);
    const date = params.catchUp ? bid.awardDate : params.awardDate || params.today || new Date().toISOString().slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new OpportunityStatusError("A valid award date is required");

    let projectId = bid.targetProjectId;
    if (!projectId) {
      const number = await allocateProjectNumber(tx);
      const [project] = await tx.insert(projects).values({
        projectNumber: number, customerId: bid.customerId, name: bid.name,
        description: bid.scopeSummary, streetAddress: bid.streetAddress,
        city: bid.city, state: bid.state, zip: bid.zip,
        notes: bid.internalNotes, estimatedValue: bid.expectedValue,
        status: "new", // expected start is not actual work start
      }).returning();
      projectId = project.id;
      await tx.update(projects).set({ projectEmail: projectEmail(project.name, project.id) }).where(eq(projects.id, project.id));
      // Intentionally no preset seeding: Project Documents uses the original tree.
      await tx.insert(projectStatusHistory).values({
        projectId, previousStatus: null, newStatus: "new",
        changedByUserId: params.actor.id, changedByName: params.actor.name,
      });
    }
    const [opportunity] = await tx.update(opportunities).set({
      status: "awarded", awardDate: date, convertedProjectId: projectId, updatedAt: new Date(),
    }).where(eq(opportunities.id, bid.id)).returning();
    const [contract] = await tx.insert(projectContracts).values({
      projectId, opportunityId: bid.id, awardDate: date, amount: bid.expectedValue,
      snapshot: { ...opportunity, scopeItems: await tx.select().from(opportunityScopeItems).where(and(eq(opportunityScopeItems.opportunityId, bid.id), isNull(opportunityScopeItems.deletedAt))) },
      createdByUserId: params.actor.id,
    }).returning();
    let historyId: number | null = null;
    if (bid.status !== "awarded") {
      const [history] = await tx.insert(opportunityStatusHistory).values({
        opportunityId: bid.id, previousStatus: bid.status, newStatus: "awarded",
        changedByUserId: params.actor.id, changedByName: params.actor.name,
      }).returning();
      historyId = history.id;
    }
    await tx.insert(activityLogs).values({
      projectId, entityType: "opportunity", entityId: bid.id,
      action: params.catchUp ? "opportunity_award_caught_up" : "opportunity_status_changed",
      actorUserId: params.actor.id, actorName: params.actor.name,
      description: `${params.actor.name} ${params.catchUp ? "linked the existing award for" : "awarded"} ${bid.opportunityNumber}; ${bid.targetProjectId ? "added a contract to the selected Project" : "created a New Project"}.`,
      metadata: { opportunityId: bid.id, customerId: bid.customerId, previousStatus: bid.status, newStatus: "awarded", awardDate: date, projectId, contractId: contract.id, statusHistoryId: historyId, migratedFromProjectId: bid.migratedFromProjectId },
    });

    // Preserve rule semantics, but claim + todo + notification + audit commit
    // with the award. External emails are queued only after successful commit.
    if (historyId) {
      const rules = await tx.select().from(workflowRules).where(and(
        eq(workflowRules.isActive, true), eq(workflowRules.triggerType, "opportunity_status_change"),
        eq(workflowRules.triggerStatus, "awarded"), isNull(workflowRules.deletedAt),
      ));
      for (const rule of rules) {
        const [execution] = await tx.insert(workflowExecutions).values({
          workflowRuleId: rule.id, opportunityId: bid.id, projectId: null,
          statusHistoryId: historyId, triggerEvent: "opportunity_status_change",
          previousStatus: bid.status, newStatus: "awarded",
        }).onConflictDoNothing().returning();
        if (!execution) continue;
        const [assignee] = await tx.select().from(users).where(eq(users.id, rule.assignedToUserId));
        const name = [assignee?.firstName, assignee?.lastName].filter(Boolean).join(" ") || assignee?.email || "Unknown user";
        if (!assignee || assignee.isAuthorized !== "approved") {
          await tx.insert(activityLogs).values({
            projectId, entityType: "workflow_rule", entityId: rule.id, action: "workflow_skipped",
            actorName: "System", description: `Workflow rule "${rule.name}" was skipped: assigned user no longer has access.`,
            metadata: { opportunityId: bid.id, workflowRuleId: rule.id, statusHistoryId: historyId },
          });
          continue;
        }
        let todoId: number | null = null;
        const dueDate = computeDueDate(rule, params.today || date);
        const title = rule.createTodo ? rule.todoTitle?.trim() || null : null;
        if (title) {
          const [todo] = await tx.insert(todos).values({
            title, description: rule.todoDescription, assignedToUserId: rule.assignedToUserId,
            relatedEntityType: "opportunity", relatedEntityId: bid.id, projectId: null,
            dueDate, priority: rule.todoPriority || "normal", source: "workflow", workflowRuleId: rule.id,
          }).returning();
          todoId = todo.id;
          await tx.insert(activityLogs).values({
            projectId, entityType: "todo", entityId: todoId, action: "workflow_todo_created",
            actorName: "System", description: `System assigned ${name} a todo: ${title}.`,
            metadata: { opportunityId: bid.id, workflowRuleId: rule.id, statusHistoryId: historyId, dueDate },
          });
        }
        if (rule.sendInAppNotification) {
          await tx.insert(notifications).values({
            userId: assignee.id, type: "workflow_todo", title: title ? `You were assigned: ${title}` : `${bid.opportunityNumber} ${bid.name} moved to Awarded`,
            message: `${bid.name} moved to Awarded.${title && dueDate ? ` Due ${dueDate}.` : ""}`,
            projectId: null, todoId, relatedEntityType: "opportunity", relatedEntityId: bid.id,
          });
          await tx.insert(activityLogs).values({
            projectId, entityType: "notification", entityId: todoId, action: "workflow_notification_sent",
            actorName: "System", description: `System sent ${name} a workflow notification.`,
            metadata: { opportunityId: bid.id, workflowRuleId: rule.id },
          });
        }
        if (rule.sendEmailNotification && assignee.email) emailJobs.push({
          toEmail: assignee.email, toName: name, projectId: null,
          projectName: `${bid.opportunityNumber} ${bid.name}`, previousStatus: bid.status, newStatus: "awarded",
          todoTitle: title, todoDueDate: title ? dueDate : null, ruleName: rule.name,
          entityType: "opportunity", opportunityId: bid.id,
        });
        await tx.update(workflowExecutions).set({
          todoId, notificationSent: rule.sendInAppNotification, emailSent: !!(rule.sendEmailNotification && assignee.email),
        }).where(eq(workflowExecutions.id, execution.id));
      }
    }
    return { opportunity, changed: bid.status !== "awarded" };
  });
  for (const email of emailJobs) setImmediate(() => sendWorkflowEmail(email).catch(err => console.error("[Award] Workflow email failed:", err)));
  return result;
}

export async function awardCatchUpPreview() {
  const bids = await db.select().from(opportunities).where(and(eq(opportunities.status, "awarded"), isNull(opportunities.deletedAt))).orderBy(asc(opportunities.id));
  const result = [];
  for (const bid of bids) {
    const [contract] = await db.select().from(projectContracts).where(eq(projectContracts.opportunityId, bid.id));
    const id = contract?.projectId ?? bid.convertedProjectId ?? bid.targetProjectId;
    const [project] = id ? await db.select().from(projects).where(eq(projects.id, id)) : [];
    const [customer] = await db.select().from(customers).where(and(eq(customers.id, bid.customerId), isNull(customers.deletedAt)));
    let issue = !customer ? "Customer missing or deleted" : !bid.awardDate ? "Missing original award date" : null;
    if (id && (!project || project.deletedAt)) issue = "Linked/target Project missing or deleted; reconcile explicitly";
    else if (project && project.customerId !== bid.customerId) issue = "Customer mismatch; reconcile explicitly";
    if ((bid.convertedProjectId || contract) && (!contract || contract.projectId !== bid.convertedProjectId)) issue = "Existing link has no matching contract; reconcile explicitly";
    result.push({
      id: bid.id, opportunityNumber: bid.opportunityNumber, name: bid.name,
      targetProjectId: bid.targetProjectId, convertedProjectId: bid.convertedProjectId,
      migratedFromProjectId: bid.migratedFromProjectId,
      migratedFromProjectNumber: bid.migratedFromProjectNumber,
      issue, action: issue ? "conflict" : contract ? "linked" : bid.targetProjectId ? "add_contract" : "create",
    });
  }
  return result;
}
