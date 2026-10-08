import { storage } from "../storage";
import { logActivity, systemActor, type Actor } from "./activityLog";
import { sendWorkflowEmail } from "./workflowMailer";
import { getProjectStatusLabel } from "@shared/projectStatus";
import { getOpportunityStatusLabel } from "@shared/opportunityStatus";
import type { Opportunity, Project, WorkflowRule } from "@shared/schema";

// Workflow execution engine.
//
// Fired from the project update path only when a project's status truly
// changes (previous !== new, detected atomically under a row lock in
// storage.updateProjectWithStatusTracking). Each real transition creates one
// project_status_history record; that record's id is the transition identity.
// A unique constraint on (workflowRuleId, statusHistoryId) makes each rule
// execute at most once per transition — refreshes, retried requests, and
// double-fired handlers cannot duplicate todos, notifications, or emails.

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function computeDueDate(rule: WorkflowRule, todayStr: string): string | null {
  switch (rule.dueOffsetType) {
    case "immediately":
      return todayStr;
    case "days":
      // dueOffsetUnit is 'calendar_days' for now; business_days can be added later
      return addDays(todayStr, rule.dueOffsetDays ?? 0);
    case "none":
    default:
      return null;
  }
}

export async function handleProjectStatusChange(params: {
  project: Project;
  previousStatus: string | null;
  newStatus: string;
  actor: Actor;
  today?: string; // client-local date (YYYY-MM-DD) for due-date offsets
}): Promise<void> {
  const { project, previousStatus, newStatus, actor } = params;
  const todayStr = params.today || new Date().toISOString().slice(0, 10);

  // 1. Record the status transition (also serves as the workflow idempotency identity)
  const history = await storage.createProjectStatusHistory({
    projectId: project.id,
    previousStatus,
    newStatus,
    changedByUserId: actor.id,
    changedByName: actor.name,
  });

  const prevLabel = previousStatus ? getProjectStatusLabel(previousStatus) : null;
  const newLabel = getProjectStatusLabel(newStatus);

  await logActivity({
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
    action: "project_status_changed",
    actor,
    description: prevLabel
      ? `${actor.name} changed project status from ${prevLabel} to ${newLabel}.`
      : `${actor.name} set project status to ${newLabel}.`,
    metadata: { previousStatus, newStatus, statusHistoryId: history.id },
  });

  // 2. Execute matching active rules exactly once for this transition
  const rules = await storage.getActiveWorkflowRulesForStatus(newStatus, "project_status_change");
  for (const rule of rules) {
    try {
      await executeRule({ rule, project, previousStatus, newStatus, statusHistoryId: history.id, todayStr });
    } catch (err) {
      console.error(`[Workflow] Rule ${rule.id} (${rule.name}) failed for project ${project.id}:`, err);
    }
  }
}

// Opportunity analog of handleProjectStatusChange. Fired ONLY from the
// centralized opportunity status change service after a true transition was
// detected under a row lock (changed === true). The opportunity_status_history
// row created there is the idempotency identity, keyed together with the
// trigger event so project/opportunity history ids can never collide.
export async function handleOpportunityStatusChange(params: {
  opportunity: Opportunity;
  previousStatus: string | null;
  newStatus: string;
  statusHistoryId: number;
  today?: string; // client-local date (YYYY-MM-DD) for due-date offsets
}): Promise<void> {
  const { opportunity, previousStatus, newStatus, statusHistoryId } = params;
  const todayStr = params.today || new Date().toISOString().slice(0, 10);

  const rules = await storage.getActiveWorkflowRulesForStatus(newStatus, "opportunity_status_change");
  for (const rule of rules) {
    try {
      await executeOpportunityRule({ rule, opportunity, previousStatus, newStatus, statusHistoryId, todayStr });
    } catch (err) {
      console.error(`[Workflow] Rule ${rule.id} (${rule.name}) failed for opportunity ${opportunity.id}:`, err);
    }
  }
}

async function executeOpportunityRule(params: {
  rule: WorkflowRule;
  opportunity: Opportunity;
  previousStatus: string | null;
  newStatus: string;
  statusHistoryId: number;
  todayStr: string;
}): Promise<void> {
  const { rule, opportunity, previousStatus, newStatus, statusHistoryId, todayStr } = params;

  // Idempotency claim: unique (workflowRuleId, triggerEvent, statusHistoryId).
  const execution = await storage.claimWorkflowExecution({
    workflowRuleId: rule.id,
    projectId: null,
    opportunityId: opportunity.id,
    statusHistoryId,
    triggerEvent: "opportunity_status_change",
    previousStatus,
    newStatus,
    todoId: null,
    notificationSent: false,
    emailSent: false,
  });
  if (!execution) {
    console.log(`[Workflow] Rule ${rule.id} already executed for opportunity transition ${statusHistoryId}, skipping`);
    return;
  }

  const assignee = await storage.getUser(rule.assignedToUserId);
  const assigneeName = assignee
    ? ([assignee.firstName, assignee.lastName].filter(Boolean).join(" ").trim() || assignee.email || "Unknown user")
    : "Unknown user";

  if (!assignee || assignee.isAuthorized !== "approved") {
    const reason = assignee
      ? `${assigneeName} no longer has app access`
      : "its assigned user no longer exists";
    console.warn(`[Workflow] Rule ${rule.id} (${rule.name}) skipped for opportunity ${opportunity.id}: ${reason}`);
    await logActivity({
      entityType: "workflow_rule",
      entityId: rule.id,
      action: "workflow_skipped",
      actor: systemActor(),
      description: `Workflow rule "${rule.name}" was skipped: ${reason}. Reassign the rule under Admin → Workflows.`,
      metadata: { workflowRuleId: rule.id, ruleName: rule.name, statusHistoryId, assignedToUserId: rule.assignedToUserId, opportunityId: opportunity.id },
    });
    await storage.updateWorkflowExecution(execution.id, { todoId: null, notificationSent: false, emailSent: false });
    return;
  }

  const newLabel = getOpportunityStatusLabel(newStatus);
  const displayName = `${opportunity.opportunityNumber} ${opportunity.name}`;
  let todoId: number | null = null;
  let dueDate: string | null = null;
  let todoTitle: string | null = null;

  // Create the todo — linked to the Opportunity, no Project required
  if (rule.createTodo && rule.todoTitle && rule.todoTitle.trim()) {
    dueDate = computeDueDate(rule, todayStr);
    todoTitle = rule.todoTitle.trim();
    const todo = await storage.createTodo({
      title: todoTitle,
      description: rule.todoDescription || null,
      assignedToUserId: rule.assignedToUserId,
      createdByUserId: null, // System
      projectId: null,
      relatedEntityType: "opportunity",
      relatedEntityId: opportunity.id,
      dueDate,
      priority: (rule.todoPriority as any) || "normal",
      status: "open",
      source: "workflow",
      workflowRuleId: rule.id,
    });
    todoId = todo.id;

    await logActivity({
      entityType: "todo",
      entityId: todo.id,
      action: "workflow_todo_created",
      actor: systemActor(),
      description: `System assigned ${assigneeName} a todo: ${todoTitle}${dueDate ? ` (due ${dueDate})` : ""}.`,
      metadata: { workflowRuleId: rule.id, ruleName: rule.name, statusHistoryId, dueDate, opportunityId: opportunity.id },
    });
  }

  // In-app notification
  let notificationSent = false;
  if (rule.sendInAppNotification && assignee) {
    await storage.createNotification({
      userId: rule.assignedToUserId,
      type: "workflow_todo",
      title: todoTitle ? `You were assigned: ${todoTitle}` : `${displayName} moved to ${newLabel}`,
      message: todoTitle
        ? `${displayName} moved to ${newLabel}.${dueDate ? ` Due ${dueDate}.` : ""}`
        : `You are responsible for ${displayName} in ${newLabel}.`,
      projectId: null,
      todoId,
      relatedEntityType: "opportunity",
      relatedEntityId: opportunity.id,
      isRead: false,
    });
    notificationSent = true;

    await logActivity({
      entityType: "notification",
      entityId: todoId,
      action: "workflow_notification_sent",
      actor: systemActor(),
      description: `System sent ${assigneeName} a workflow notification.`,
      metadata: { workflowRuleId: rule.id, ruleName: rule.name, opportunityId: opportunity.id },
    });
  }

  // Email — non-blocking, only when the rule enables it
  let emailQueued = false;
  if (rule.sendEmailNotification && assignee?.email) {
    emailQueued = true;
    const emailParams = {
      toEmail: assignee.email,
      toName: assigneeName,
      projectId: null,
      projectName: displayName,
      previousStatus,
      newStatus,
      todoTitle,
      todoDueDate: dueDate,
      ruleName: rule.name,
      entityType: "opportunity" as const,
      opportunityId: opportunity.id,
    };
    setImmediate(() => {
      sendWorkflowEmail(emailParams).catch(err =>
        console.error("[Workflow] Email send failed:", err)
      );
    });
  } else if (rule.sendEmailNotification && !assignee?.email) {
    console.warn(`[Workflow] Rule ${rule.id} (${rule.name}): email enabled but assignee has no email address`);
  }

  // Finalize the execution record (audit trail)
  await storage.updateWorkflowExecution(execution.id, {
    todoId,
    notificationSent,
    emailSent: emailQueued,
  });

  console.log(`[Workflow] Executed rule ${rule.id} (${rule.name}) for opportunity ${opportunity.id}: ${previousStatus} -> ${newStatus}${todoId ? `, todo #${todoId}` : ""}`);
}

async function executeRule(params: {
  rule: WorkflowRule;
  project: Project;
  previousStatus: string | null;
  newStatus: string;
  statusHistoryId: number;
  todayStr: string;
}): Promise<void> {
  const { rule, project, previousStatus, newStatus, statusHistoryId, todayStr } = params;

  // Idempotency claim: unique (workflowRuleId, statusHistoryId). If another
  // request already claimed this transition, skip entirely.
  const execution = await storage.claimWorkflowExecution({
    workflowRuleId: rule.id,
    projectId: project.id,
    statusHistoryId,
    triggerEvent: "project_status_change",
    previousStatus,
    newStatus,
    todoId: null,
    notificationSent: false,
    emailSent: false,
  });
  if (!execution) {
    console.log(`[Workflow] Rule ${rule.id} already executed for transition ${statusHistoryId}, skipping`);
    return;
  }

  const assignee = await storage.getUser(rule.assignedToUserId);
  const assigneeName = assignee
    ? ([assignee.firstName, assignee.lastName].filter(Boolean).join(" ").trim() || assignee.email || "Unknown user")
    : "Unknown user";

  // Never assign work to a missing or inactive user. Flag it clearly in the
  // project activity feed instead, and finalize the claimed execution as
  // skipped (so retries don't re-attempt and the audit trail is honest).
  if (!assignee || assignee.isAuthorized !== "approved") {
    const reason = assignee
      ? `${assigneeName} no longer has app access`
      : "its assigned user no longer exists";
    console.warn(`[Workflow] Rule ${rule.id} (${rule.name}) skipped for project ${project.id}: ${reason}`);
    await logActivity({
      projectId: project.id,
      entityType: "workflow_rule",
      entityId: rule.id,
      action: "workflow_skipped",
      actor: systemActor(),
      description: `Workflow rule "${rule.name}" was skipped: ${reason}. Reassign the rule under Admin → Workflows.`,
      metadata: { workflowRuleId: rule.id, ruleName: rule.name, statusHistoryId, assignedToUserId: rule.assignedToUserId },
    });
    await storage.updateWorkflowExecution(execution.id, { todoId: null, notificationSent: false, emailSent: false });
    return;
  }

  const newLabel = getProjectStatusLabel(newStatus);
  let todoId: number | null = null;
  let dueDate: string | null = null;
  let todoTitle: string | null = null;

  // 3. Create the todo
  if (rule.createTodo && rule.todoTitle && rule.todoTitle.trim()) {
    dueDate = computeDueDate(rule, todayStr);
    todoTitle = rule.todoTitle.trim();
    const todo = await storage.createTodo({
      title: todoTitle,
      description: rule.todoDescription || null,
      assignedToUserId: rule.assignedToUserId,
      createdByUserId: null, // System
      projectId: project.id,
      relatedEntityType: "project",
      relatedEntityId: project.id,
      dueDate,
      priority: (rule.todoPriority as any) || "normal",
      status: "open",
      source: "workflow",
      workflowRuleId: rule.id,
    });
    todoId = todo.id;

    await logActivity({
      projectId: project.id,
      entityType: "todo",
      entityId: todo.id,
      action: "workflow_todo_created",
      actor: systemActor(),
      description: `System assigned ${assigneeName} a todo: ${todoTitle}${dueDate ? ` (due ${dueDate})` : ""}.`,
      metadata: { workflowRuleId: rule.id, ruleName: rule.name, statusHistoryId, dueDate },
    });
  }

  // 4. In-app notification
  let notificationSent = false;
  if (rule.sendInAppNotification && assignee) {
    await storage.createNotification({
      userId: rule.assignedToUserId,
      type: "workflow_todo",
      title: todoTitle ? `You were assigned: ${todoTitle}` : `${project.name} moved to ${newLabel}`,
      message: todoTitle
        ? `${project.name} moved to ${newLabel}.${dueDate ? ` Due ${dueDate}.` : ""}`
        : `You are responsible for ${project.name} in ${newLabel}.`,
      projectId: project.id,
      todoId,
      relatedEntityType: "project",
      relatedEntityId: project.id,
      isRead: false,
    });
    notificationSent = true;

    await logActivity({
      projectId: project.id,
      entityType: "notification",
      entityId: todoId,
      action: "workflow_notification_sent",
      actor: systemActor(),
      description: `System sent ${assigneeName} a workflow notification.`,
      metadata: { workflowRuleId: rule.id, ruleName: rule.name },
    });
  }

  // 5. Email — non-blocking, only when the rule enables it
  let emailQueued = false;
  if (rule.sendEmailNotification && assignee?.email) {
    emailQueued = true;
    const emailParams = {
      toEmail: assignee.email,
      toName: assigneeName,
      projectId: project.id,
      projectName: project.name,
      previousStatus,
      newStatus,
      todoTitle,
      todoDueDate: dueDate,
      ruleName: rule.name,
    };
    setImmediate(() => {
      sendWorkflowEmail(emailParams).catch(err =>
        console.error("[Workflow] Email send failed:", err)
      );
    });
  } else if (rule.sendEmailNotification && !assignee?.email) {
    console.warn(`[Workflow] Rule ${rule.id} (${rule.name}): email enabled but assignee has no email address`);
  }

  // 6. Finalize the execution record (audit trail)
  await storage.updateWorkflowExecution(execution.id, {
    todoId,
    notificationSent,
    emailSent: emailQueued,
  });

  console.log(`[Workflow] Executed rule ${rule.id} (${rule.name}) for project ${project.id}: ${previousStatus} -> ${newStatus}${todoId ? `, todo #${todoId}` : ""}`);
}
