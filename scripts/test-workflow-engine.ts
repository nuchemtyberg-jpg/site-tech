/**
 * One-off verification script for the workflow engine (Task 5).
 * Run: npx tsx scripts/test-workflow-engine.ts
 * Creates temp data, exercises the engine incl. duplicate protection, then cleans up.
 */
import { db } from "../server/db";
import { storage } from "../server/storage";
import { handleProjectStatusChange } from "../server/services/workflowEngine";
import {
  todos, workflowRules, workflowExecutions, projectStatusHistory,
  notifications, activityLogs, projects, users,
} from "../shared/schema";
import { eq, inArray } from "drizzle-orm";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.error(`  FAIL ${label}`, extra ?? ""); }
}

async function main() {
  const [assignee] = await db.select().from(users).where(eq(users.isAuthorized, "approved")).limit(1);
  if (!assignee) throw new Error("No approved user found to act as assignee");
  const actorUser = assignee;
  console.log(`Using assignee ${assignee.id} (${assignee.email})`);

  // 1. Temp project
  const project = await storage.createProject({
    name: "__WF_TEST_PROJECT__",
    streetAddress: "1 Test Way", city: "Testville", state: "NY", zipCode: "10001",
    status: "new",
  } as any);
  console.log(`Created temp project ${project.id}`);

  // 2. Temp rule: new -> bidding, todo due in 3 days, in-app only (no email)
  const rule = await storage.createWorkflowRule({
    name: "__WF_TEST_RULE__",
    isActive: true,
    triggerType: "project_status_change",
    triggerStatus: "bidding",
    assignedToUserId: assignee.id,
    createTodo: true,
    todoTitle: "Test takeoff todo",
    todoDescription: "Created by test script",
    todoPriority: "high",
    dueOffsetType: "days",
    dueOffsetDays: 3,
    dueOffsetUnit: "calendar_days",
    sendInAppNotification: true,
    sendEmailNotification: false,
  } as any);
  console.log(`Created temp rule ${rule.id}`);

  const ruleIds = [rule.id];
  const today = "2026-08-10";

  try {
    // --- Test A: true transition fires rule exactly once ---
    console.log("\nTest A: new -> bidding fires the rule");
    const { project: updated1, previousStatus: prev1 } =
      await storage.updateProjectWithStatusTracking(project.id, { status: "bidding" } as any);
    check("previousStatus is 'new'", prev1 === "new", prev1);
    if (prev1 !== null && updated1.status !== prev1) {
      await handleProjectStatusChange({
        project: updated1, previousStatus: prev1!, newStatus: updated1.status!,
        actor: { userId: actorUser.id, name: "Test Actor" }, today,
      });
    }
    const todosA = await db.select().from(todos).where(eq(todos.projectId, project.id));
    check("exactly 1 todo created", todosA.length === 1, todosA.length);
    check("todo due date = today+3", todosA[0]?.dueDate === "2026-08-13", todosA[0]?.dueDate);
    check("todo source = workflow", todosA[0]?.source === "workflow");
    check("todo assigned correctly", todosA[0]?.assignedToUserId === assignee.id);
    check("todo priority high", todosA[0]?.priority === "high");
    const historyA = await storage.getProjectStatusHistory(project.id);
    check("1 status history row", historyA.length === 1, historyA.length);
    check("history from/to correct", historyA[0]?.previousStatus === "new" && historyA[0]?.newStatus === "bidding", historyA[0]);
    const notifsA = await db.select().from(notifications).where(eq(notifications.todoId, todosA[0].id));
    check("1 notification for assignee", notifsA.length === 1 && notifsA[0].userId === assignee.id, notifsA.length);
    const execsA = await db.select().from(workflowExecutions).where(eq(workflowExecutions.workflowRuleId, rule.id));
    check("1 execution record", execsA.length === 1, execsA.length);
    check("execution links todo", execsA[0]?.todoId === todosA[0].id);
    const activityA = await storage.getProjectActivity(project.id);
    check("activity has status change + workflow todo", activityA.length >= 2, activityA.map(a => a.action));
    const wfEntry = activityA.find(a => a.action === "workflow_todo_created");
    check("workflow activity actor is System", wfEntry?.actorName === "System" && wfEntry?.actorUserId === null, wfEntry?.actorName);

    // --- Test B: re-saving same status does NOT re-fire ---
    console.log("\nTest B: re-save same status (bidding -> bidding) is a no-op");
    const { project: updated2, previousStatus: prev2 } =
      await storage.updateProjectWithStatusTracking(project.id, { status: "bidding" } as any);
    const isTransition2 = prev2 !== null && updated2.status !== prev2;
    check("no transition detected", !isTransition2, { prev2, status: updated2.status });
    const todosB = await db.select().from(todos).where(eq(todos.projectId, project.id));
    check("still exactly 1 todo", todosB.length === 1, todosB.length);
    const historyB = await storage.getProjectStatusHistory(project.id);
    check("still 1 history row", historyB.length === 1, historyB.length);

    // --- Test C: duplicate claim on same history row is rejected ---
    console.log("\nTest C: replaying the same transition (same history row) is idempotent");
    await handleProjectStatusChange({
      project: updated1, previousStatus: "new", newStatus: "bidding",
      actor: { userId: actorUser.id, name: "Test Actor" }, today,
    });
    // This creates a NEW history row (legit second transition record), but for Test C
    // we want same-history idempotency; call claim directly:
    const historyC = await storage.getProjectStatusHistory(project.id);
    const firstHistoryId = historyA[0].id;
    const dupClaim = await storage.claimWorkflowExecution({
      workflowRuleId: rule.id, projectId: project.id, statusHistoryId: firstHistoryId,
      previousStatus: "new", newStatus: "bidding",
    } as any);
    check("duplicate claim returns undefined", dupClaim === undefined, dupClaim);
    // Note: the replayed handleProjectStatusChange above created history row #2 and a 2nd todo
    // (each real transition record executes once) — verify counts line up with history rows.
    const todosC = await db.select().from(todos).where(eq(todos.projectId, project.id));
    const execsC = await db.select().from(workflowExecutions).where(eq(workflowExecutions.workflowRuleId, rule.id));
    check("execs == history rows (1 per transition, no dupes)", execsC.length === historyC.length, { execs: execsC.length, history: historyC.length });
    check("todos == execs", todosC.length === execsC.length, { todos: todosC.length });

    // --- Test D: concurrent same-status updates fire only once ---
    console.log("\nTest D: two concurrent updates to 'active' -> only one transition fires");
    const results = await Promise.all([
      storage.updateProjectWithStatusTracking(project.id, { status: "active" } as any),
      storage.updateProjectWithStatusTracking(project.id, { status: "active" } as any),
    ]);
    const transitions = results.filter(r => r.previousStatus !== null && r.project.status !== r.previousStatus);
    check("exactly one detected transition", transitions.length === 1, results.map(r => r.previousStatus));

    // --- Test E: inactive rule does not fire ---
    console.log("\nTest E: inactive rules are skipped");
    await storage.updateWorkflowRule(rule.id, { isActive: false } as any);
    const rules = await storage.getActiveWorkflowRulesForStatus("bidding");
    check("inactive rule not returned", !rules.some(r => r.id === rule.id));

    // --- Test F: getMyWorkSummary counts ---
    console.log("\nTest F: my-work summary counts for assignee");
    const summary = await storage.getMyWorkSummary(assignee.id, today);
    check("summary has numeric fields", typeof summary.open === "number" && typeof summary.overdue === "number", summary);
    check("open >= todos created here", summary.open >= todosC.filter(t => t.status === "open").length, summary.open);

    // --- Test G: rules assigned to inactive users are skipped, with an audit record ---
    console.log("\nTest G: rule assigned to a non-approved user is skipped (no todo, flagged in activity)");
    await db.insert(users).values({
      id: "__wf_test_inactive__", email: "wf-inactive@test.local",
      firstName: "Inactive", lastName: "Tester", role: "user", isAuthorized: "pending",
    } as any).onConflictDoNothing();
    const rule2 = await storage.createWorkflowRule({
      name: "__WF_TEST_RULE_INACTIVE__", isActive: true,
      triggerType: "project_status_change", triggerStatus: "proposal_sent",
      assignedToUserId: "__wf_test_inactive__", createTodo: true, todoTitle: "Should never exist",
      todoPriority: "normal", dueOffsetType: "none", dueOffsetDays: null, dueOffsetUnit: "calendar_days",
      sendInAppNotification: true, sendEmailNotification: false,
    } as any);
    ruleIds.push(rule2.id);
    const { project: updatedG, previousStatus: prevG } =
      await storage.updateProjectWithStatusTracking(project.id, { status: "proposal_sent" } as any);
    await handleProjectStatusChange({
      project: updatedG, previousStatus: prevG!, newStatus: updatedG.status!,
      actor: { userId: actorUser.id, name: "Test Actor" }, today,
    });
    const skippedTodos = await db.select().from(todos).where(eq(todos.workflowRuleId, rule2.id));
    check("no todo created for inactive assignee", skippedTodos.length === 0, skippedTodos.length);
    const skippedNotifs = await db.select().from(notifications).where(eq(notifications.userId, "__wf_test_inactive__"));
    check("no notification for inactive assignee", skippedNotifs.length === 0, skippedNotifs.length);
    const execsG = await db.select().from(workflowExecutions).where(eq(workflowExecutions.workflowRuleId, rule2.id));
    check("execution claimed but finalized without todo", execsG.length === 1 && execsG[0].todoId === null && !execsG[0].notificationSent, execsG);
    const activityG = await storage.getProjectActivity(project.id);
    const skipEntry = activityG.find(a => a.action === "workflow_skipped");
    check("activity records the skip with System actor", !!skipEntry && skipEntry.actorName === "System", skipEntry?.description);
  } finally {
    // --- Cleanup ---
    console.log("\nCleaning up temp data...");
    const todoRows = await db.select().from(todos).where(eq(todos.projectId, project.id));
    const todoIds = todoRows.map(t => t.id);
    if (todoIds.length) await db.delete(notifications).where(inArray(notifications.todoId, todoIds));
    await db.delete(notifications).where(eq(notifications.projectId, project.id));
    await db.delete(workflowExecutions).where(inArray(workflowExecutions.workflowRuleId, ruleIds));
    await db.delete(activityLogs).where(eq(activityLogs.projectId, project.id));
    await db.delete(projectStatusHistory).where(eq(projectStatusHistory.projectId, project.id));
    if (todoIds.length) await db.delete(todos).where(inArray(todos.id, todoIds));
    await db.delete(workflowRules).where(inArray(workflowRules.id, ruleIds));
    await db.delete(projects).where(eq(projects.id, project.id));
    await db.delete(users).where(eq(users.id, "__wf_test_inactive__"));
    console.log("Cleanup done.");
  }

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error("Script error:", err); process.exit(1); });
