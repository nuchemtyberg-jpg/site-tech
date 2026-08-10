/**
 * One-off authenticated HTTP verification for Task 5 endpoints.
 * Inserts a temporary session row (signed like express-session) and curls the API.
 * Run: npx tsx scripts/test-http-api.ts
 */
import crypto from "node:crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const BASE = "http://localhost:5000";
const USER_ID = "mobile-user-001"; // admin, approved
const OTHER_USER_ID = "616245";    // another approved admin (gets assignment notifications)
const REGULAR_ID = "__http_regular__"; // temp approved user with role 'user' (non-manager)
const PENDING_ID = "__http_pending__"; // temp non-approved user (must never receive work)

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.error(`  FAIL ${label}`, extra !== undefined ? JSON.stringify(extra)?.slice(0, 400) : ""); }
}

function makeCookie(sid: string): string {
  const secret = process.env.SESSION_SECRET!;
  const sig = crypto.createHmac("sha256", secret).update(sid).digest("base64").replace(/=+$/, "");
  return `connect.sid=${encodeURIComponent(`s:${sid}.${sig}`)}`;
}

async function main() {
  // --- forge session ---
  const sid = crypto.randomBytes(16).toString("hex");
  const expiresAtSec = Math.floor(Date.now() / 1000) + 6 * 3600;
  const sess = {
    cookie: { originalMaxAge: 604800000, expires: new Date(Date.now() + 6 * 3600_000).toISOString(), httpOnly: true, path: "/" },
    passport: { user: { claims: { sub: USER_ID, email: "admin@test.com" }, expires_at: expiresAtSec, access_token: "test", refresh_token: "test" } },
  };
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}::jsonb, NOW() + interval '6 hours')`);
  const cookie = makeCookie(sid);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });

  const createdTodoIds: number[] = [];
  let ruleId: number | null = null;
  let tempProjectId: number | null = null;
  let sid2: string | null = null;

  try {
    // --- auth sanity ---
    console.log("Auth:");
    const noAuth = await fetch(`${BASE}/api/todos`);
    check("no cookie -> 401", noAuth.status === 401, noAuth.status);
    const me = await j(await fetch(`${BASE}/api/auth/user`, { headers: H }));
    check("forged session -> 200 auth user", me.status === 200 && me.body?.id === USER_ID, me);

    // --- temp project (avoid touching real data) ---
    const proj = await j(await fetch(`${BASE}/api/projects`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "__HTTP_TEST_PROJECT__", streetAddress: "1 Test Way", city: "Testville", state: "NJ", status: "new" }),
    }));
    check("create temp project", proj.status === 200 || proj.status === 201, proj);
    tempProjectId = proj.body?.id ?? null;
    if (!tempProjectId) throw new Error("no temp project id, aborting");

    // --- todo CRUD ---
    console.log("\nTodos:");
    const t1 = await j(await fetch(`${BASE}/api/todos`, {
      method: "POST", headers: H,
      body: JSON.stringify({ title: "HTTP self todo", assignedToUserId: USER_ID, projectId: tempProjectId, priority: "high", dueDate: "2026-08-10" }),
    }));
    check("create todo (self-assign)", (t1.status === 200 || t1.status === 201) && t1.body?.id > 0, t1);
    if (t1.body?.id) createdTodoIds.push(t1.body.id);

    const selfNotifs = await db.execute(sql`SELECT count(*)::int AS n FROM notifications WHERE todo_id = ${t1.body.id}`);
    check("self-assign -> no notification", (selfNotifs.rows[0] as any).n === 0, selfNotifs.rows[0]);

    const t2 = await j(await fetch(`${BASE}/api/todos`, {
      method: "POST", headers: H,
      body: JSON.stringify({ title: "HTTP other todo", assignedToUserId: OTHER_USER_ID, projectId: tempProjectId, priority: "normal" }),
    }));
    check("create todo (assign other)", (t2.status === 200 || t2.status === 201), t2.status);
    if (t2.body?.id) createdTodoIds.push(t2.body.id);
    const otherNotifs = await db.execute(sql`SELECT user_id FROM notifications WHERE todo_id = ${t2.body.id}`);
    check("other-assign -> 1 notification to assignee", otherNotifs.rows.length === 1 && (otherNotifs.rows[0] as any).user_id === OTHER_USER_ID, otherNotifs.rows);

    const myList = await j(await fetch(`${BASE}/api/todos?assignedToUserId=me&status=active&today=2026-08-10`, { headers: H }));
    check("list mine active includes t1 w/ names", myList.status === 200 && myList.body?.some((t: any) => t.id === t1.body.id && t.projectName === "__HTTP_TEST_PROJECT__"), myList.body?.length);

    const summary = await j(await fetch(`${BASE}/api/todos/my-work-summary?today=2026-08-10`, { headers: H }));
    check("my-work summary dueToday >= 1", summary.status === 200 && summary.body?.dueToday >= 1, summary.body);

    const upd = await j(await fetch(`${BASE}/api/todos/${t1.body.id}`, {
      method: "PUT", headers: H, body: JSON.stringify({ title: "HTTP self todo (edited)", status: "in_progress" }),
    }));
    check("update todo (title+status)", upd.status === 200 && upd.body?.title === "HTTP self todo (edited)" && upd.body?.status === "in_progress", upd);

    const comp1 = await j(await fetch(`${BASE}/api/todos/${t1.body.id}/complete`, { method: "POST", headers: H }));
    check("quick complete", comp1.status === 200 && comp1.body?.status === "completed" && !!comp1.body?.completedAt, comp1.body?.status);
    const comp2 = await j(await fetch(`${BASE}/api/todos/${t1.body.id}/complete`, { method: "POST", headers: H }));
    check("re-complete idempotent", comp2.status === 200 && comp2.body?.status === "completed", comp2.status);

    const delCompleted = await fetch(`${BASE}/api/todos/${t1.body.id}`, { method: "DELETE", headers: H });
    check("delete completed todo -> 400", delCompleted.status === 400, delCompleted.status);

    // --- workflow rule + engine over HTTP ---
    console.log("\nWorkflow over HTTP:");
    const rule = await j(await fetch(`${BASE}/api/workflow-rules`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        name: "__HTTP_TEST_RULE__", isActive: true, triggerType: "project_status_change", triggerStatus: "takeoff_done",
        assignedToUserId: OTHER_USER_ID, createTodo: true, todoTitle: "Review takeoff (HTTP test)",
        todoPriority: "urgent", dueOffsetType: "days", dueOffsetDays: 2, dueOffsetUnit: "calendar_days",
        sendInAppNotification: true, sendEmailNotification: false,
      }),
    }));
    check("admin create rule", (rule.status === 200 || rule.status === 201) && rule.body?.id > 0, rule);
    ruleId = rule.body?.id ?? null;

    const rulesList = await j(await fetch(`${BASE}/api/workflow-rules`, { headers: H }));
    check("rules list has assigneeIsActive", rulesList.status === 200 && typeof rulesList.body?.find((r: any) => r.id === ruleId)?.assigneeIsActive === "boolean", rulesList.body?.[0]);

    const put1 = await j(await fetch(`${BASE}/api/projects/${tempProjectId}?clientDate=2026-08-10`, {
      method: "PUT", headers: H, body: JSON.stringify({ status: "takeoff_done" }),
    }));
    check("status change new->takeoff_done", put1.status === 200 && put1.body?.status === "takeoff_done", put1);
    await new Promise(r => setTimeout(r, 500)); // engine runs before response, email is deferred; small buffer

    const wfTodos = await db.execute(sql`SELECT id, title, due_date, assigned_to_user_id, source FROM todos WHERE project_id = ${tempProjectId} AND source = 'workflow'`);
    check("workflow created exactly 1 todo", wfTodos.rows.length === 1, wfTodos.rows);
    const wfTodo = wfTodos.rows[0] as any;
    check("workflow todo due today+2", wfTodo?.due_date === "2026-08-12", wfTodo?.due_date);
    check("workflow todo assignee", wfTodo?.assigned_to_user_id === OTHER_USER_ID);
    if (wfTodo?.id) createdTodoIds.push(wfTodo.id);

    const put2 = await j(await fetch(`${BASE}/api/projects/${tempProjectId}?clientDate=2026-08-10`, {
      method: "PUT", headers: H, body: JSON.stringify({ status: "takeoff_done" }),
    }));
    check("re-save same status -> 200", put2.status === 200, put2.status);
    const wfTodos2 = await db.execute(sql`SELECT count(*)::int AS n FROM todos WHERE project_id = ${tempProjectId} AND source = 'workflow'`);
    check("no duplicate workflow todo", (wfTodos2.rows[0] as any).n === 1, wfTodos2.rows[0]);

    const activity = await j(await fetch(`${BASE}/api/projects/${tempProjectId}/activity`, { headers: H }));
    check("activity feed has status change + workflow entries", activity.status === 200 && activity.body?.length >= 2 &&
      activity.body.some((a: any) => a.action === "project_status_changed") &&
      activity.body.some((a: any) => a.action === "workflow_todo_created" && a.actorName === "System"), activity.body?.map((a: any) => a.action));

    const history = await j(await fetch(`${BASE}/api/projects/${tempProjectId}/status-history`, { headers: H }));
    check("status history has 1 transition", history.status === 200 && history.body?.length === 1 && history.body[0].newStatus === "takeoff_done", history.body);

    // --- notifications API ---
    console.log("\nNotifications API:");
    const notifRow = await db.execute(sql`SELECT id FROM notifications WHERE user_id = ${USER_ID} ORDER BY id DESC LIMIT 1`);
    // create one aimed at our test user (reassign t2 to self from other -> no notif; instead mark-read flow on other's notif is off-limits).
    // Use unread-count + list shape checks with our own account:
    const unread = await j(await fetch(`${BASE}/api/notifications/unread-count`, { headers: H }));
    check("unread-count returns {count}", unread.status === 200 && typeof unread.body?.count === "number", unread.body);
    const notifList = await j(await fetch(`${BASE}/api/notifications`, { headers: H }));
    check("notifications list 200 array", notifList.status === 200 && Array.isArray(notifList.body));
    const markAll = await j(await fetch(`${BASE}/api/notifications/read-all`, { method: "POST", headers: H }));
    check("mark all read 200", markAll.status === 200, markAll.status);

    // --- users endpoint ---
    const usersList = await j(await fetch(`${BASE}/api/users`, { headers: H }));
    check("users list excludes sensitive fields", usersList.status === 200 && usersList.body?.length > 0 && !("createdAt" in usersList.body[0]), usersList.body?.[0]);

    // --- authorization scope: regular (non-manager) user + inactive assignees ---
    console.log("\nPermission scope (regular user) & assignee validation:");
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, is_authorized)
      VALUES (${REGULAR_ID}, 'http-regular@test.local', 'Regular', 'Tester', 'user', 'approved')
      ON CONFLICT (id) DO UPDATE SET role = 'user', is_authorized = 'approved'`);
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, is_authorized)
      VALUES (${PENDING_ID}, 'http-pending@test.local', 'Pending', 'Tester', 'user', 'pending')
      ON CONFLICT (id) DO UPDATE SET is_authorized = 'pending'`);

    sid2 = crypto.randomBytes(16).toString("hex");
    const sess2 = {
      cookie: { originalMaxAge: 604800000, expires: new Date(Date.now() + 6 * 3600_000).toISOString(), httpOnly: true, path: "/" },
      passport: { user: { claims: { sub: REGULAR_ID, email: "http-regular@test.local" }, expires_at: expiresAtSec, access_token: "test", refresh_token: "test" } },
    };
    await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${sid2}, ${JSON.stringify(sess2)}::jsonb, NOW() + interval '6 hours')`);
    const H2 = { Cookie: makeCookie(sid2), "Content-Type": "application/json" };

    // a personal (no-project) todo owned by the admin — must be invisible to the regular user
    const tPersonal = await j(await fetch(`${BASE}/api/todos`, {
      method: "POST", headers: H,
      body: JSON.stringify({ title: "__HTTP_TEST_PERSONAL__", assignedToUserId: USER_ID, priority: "normal" }),
    }));
    check("admin creates personal todo", tPersonal.status === 201 || tPersonal.status === 200, tPersonal.status);

    // a project todo assigned to the regular user
    const tReg = await j(await fetch(`${BASE}/api/todos`, {
      method: "POST", headers: H,
      body: JSON.stringify({ title: "HTTP regular's todo", assignedToUserId: REGULAR_ID, projectId: tempProjectId, priority: "normal" }),
    }));
    check("admin assigns todo to regular user", tReg.status === 201 || tReg.status === 200, tReg.status);
    if (tReg.body?.id) createdTodoIds.push(tReg.body.id);

    const crossList = await j(await fetch(`${BASE}/api/todos?assignedToUserId=${USER_ID}`, { headers: H2 }));
    check("regular: cross-user list -> 403", crossList.status === 403, crossList.status);

    const defaultList = await j(await fetch(`${BASE}/api/todos`, { headers: H2 }));
    check("regular: unscoped list -> only own todos", defaultList.status === 200 &&
      Array.isArray(defaultList.body) && defaultList.body.length > 0 &&
      defaultList.body.every((t: any) => t.assignedToUserId === REGULAR_ID) &&
      defaultList.body.some((t: any) => t.id === tReg.body.id), defaultList.body?.map((t: any) => t.assignedToUserId));

    const projList = await j(await fetch(`${BASE}/api/todos?projectId=${tempProjectId}`, { headers: H2 }));
    check("regular: project-scoped list allowed (sees others' project todos)", projList.status === 200 &&
      projList.body?.some((t: any) => t.id === t2.body.id), projList.status);

    const getOtherPersonal = await j(await fetch(`${BASE}/api/todos/${tPersonal.body.id}`, { headers: H2 }));
    check("regular: someone else's personal todo -> 403", getOtherPersonal.status === 403, getOtherPersonal.status);

    const getProjTodo = await j(await fetch(`${BASE}/api/todos/${t2.body.id}`, { headers: H2 }));
    check("regular: project todo detail -> 200", getProjTodo.status === 200, getProjTodo.status);

    const rulesAsRegular = await fetch(`${BASE}/api/workflow-rules`, { headers: H2 });
    check("regular: list workflow rules -> 403", rulesAsRegular.status === 403, rulesAsRegular.status);
    const ruleAsRegular = await fetch(`${BASE}/api/workflow-rules`, {
      method: "POST", headers: H2,
      body: JSON.stringify({ name: "hax", triggerType: "project_status_change", triggerStatus: "bidding", assignedToUserId: REGULAR_ID, createTodo: true, todoTitle: "hax", dueOffsetType: "none", sendInAppNotification: false, sendEmailNotification: false, isActive: true }),
    });
    check("regular: create workflow rule -> 403", ruleAsRegular.status === 403, ruleAsRegular.status);

    const statusOnly = await j(await fetch(`${BASE}/api/todos/${tReg.body.id}`, {
      method: "PUT", headers: H2, body: JSON.stringify({ status: "in_progress" }),
    }));
    check("regular assignee: status-only update -> 200", statusOnly.status === 200 && statusOnly.body?.status === "in_progress", statusOnly.status);
    const titleHack = await fetch(`${BASE}/api/todos/${tReg.body.id}`, {
      method: "PUT", headers: H2, body: JSON.stringify({ title: "hax" }),
    });
    check("regular assignee: editing title -> 403", titleHack.status === 403, titleHack.status);

    const badAssignee = await j(await fetch(`${BASE}/api/todos`, {
      method: "POST", headers: H,
      body: JSON.stringify({ title: "bad", assignedToUserId: "__no_such_user__", projectId: tempProjectId }),
    }));
    check("assign to nonexistent user -> 400", badAssignee.status === 400, badAssignee.status);

    const pendingAssignee = await j(await fetch(`${BASE}/api/todos`, {
      method: "POST", headers: H,
      body: JSON.stringify({ title: "bad", assignedToUserId: PENDING_ID, projectId: tempProjectId }),
    }));
    check("assign to non-approved user -> 400", pendingAssignee.status === 400, pendingAssignee.status);

    const reassignPending = await j(await fetch(`${BASE}/api/todos/${tReg.body.id}`, {
      method: "PUT", headers: H, body: JSON.stringify({ assignedToUserId: PENDING_ID }),
    }));
    check("reassign to non-approved user -> 400", reassignPending.status === 400, reassignPending.status);

    const rulePending = await j(await fetch(`${BASE}/api/workflow-rules`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        name: "__HTTP_TEST_RULE_PENDING__", isActive: true, triggerType: "project_status_change", triggerStatus: "bidding",
        assignedToUserId: PENDING_ID, createTodo: true, todoTitle: "x", todoPriority: "normal",
        dueOffsetType: "none", sendInAppNotification: false, sendEmailNotification: false,
      }),
    }));
    check("rule with non-approved assignee -> 400", rulePending.status === 400, rulePending.status);

    const missingActivity = await fetch(`${BASE}/api/projects/999999999/activity`, { headers: H });
    check("activity for nonexistent project -> 404", missingActivity.status === 404, missingActivity.status);

    // ---------- Todo Updates (notes timeline) ----------
    console.log("\nTodo updates...");

    // Admin adds an update to the regular user's todo -> 201 + notification for assignee
    const u1 = await j(await fetch(`${BASE}/api/todos/${tReg.body.id}/updates`, {
      method: "POST", headers: H, body: JSON.stringify({ body: "Called the vendor, waiting on pricing." }),
    }));
    check("admin adds update to regular's todo -> 201 w/ author", u1.status === 201 && !!u1.body?.authorName, u1.status);

    const regNotifs = await j(await fetch(`${BASE}/api/notifications`, { headers: H2 }));
    const updateNotifs = (regNotifs.body || []).filter((n: any) => n.type === "todo_update" && n.todoId === tReg.body.id);
    check("assignee got todo_update notification", regNotifs.status === 200 && updateNotifs.length === 1, updateNotifs.length);

    // Assignee adds an update to their own todo -> 201, no self-notification
    const u2 = await j(await fetch(`${BASE}/api/todos/${tReg.body.id}/updates`, {
      method: "POST", headers: H2, body: JSON.stringify({ body: "Left a voicemail this morning." }),
    }));
    check("assignee adds update to own todo -> 201", u2.status === 201, u2.status);
    const regNotifs2 = await j(await fetch(`${BASE}/api/notifications`, { headers: H2 }));
    const updateNotifs2 = (regNotifs2.body || []).filter((n: any) => n.type === "todo_update" && n.todoId === tReg.body.id);
    check("self-update creates no notification", updateNotifs2.length === 1, updateNotifs2.length);

    // Timeline list: newest first, total, author names
    const updList = await j(await fetch(`${BASE}/api/todos/${tReg.body.id}/updates`, { headers: H2 }));
    check("list updates -> 200, newest first, total=2", updList.status === 200 &&
      updList.body?.total === 2 && updList.body?.items?.[0]?.id === u2.body.id &&
      updList.body?.items?.every((it: any) => !!it.authorName), JSON.stringify({ total: updList.body?.total }));

    // Validation
    const emptyUpd = await fetch(`${BASE}/api/todos/${tReg.body.id}/updates`, {
      method: "POST", headers: H, body: JSON.stringify({ body: "   " }),
    });
    check("empty update body -> 400", emptyUpd.status === 400, emptyUpd.status);

    // Permissions: only the author (or admin) may edit/remove
    const editOthers = await fetch(`${BASE}/api/todo-updates/${u1.body.id}`, {
      method: "PUT", headers: H2, body: JSON.stringify({ body: "hax" }),
    });
    check("regular edits admin's update -> 403", editOthers.status === 403, editOthers.status);
    const delOthers = await fetch(`${BASE}/api/todo-updates/${u1.body.id}`, { method: "DELETE", headers: H2 });
    check("regular deletes admin's update -> 403", delOthers.status === 403, delOthers.status);

    const editOwn = await j(await fetch(`${BASE}/api/todo-updates/${u1.body.id}`, {
      method: "PUT", headers: H, body: JSON.stringify({ body: "Called the vendor — pricing arrives Friday." }),
    }));
    check("author edits own update -> 200 + editedAt set", editOwn.status === 200 && !!editOwn.body?.editedAt, editOwn.status);

    const delOwn = await fetch(`${BASE}/api/todo-updates/${u1.body.id}`, { method: "DELETE", headers: H });
    check("author deletes own update -> 204", delOwn.status === 204, delOwn.status);
    const updList2 = await j(await fetch(`${BASE}/api/todos/${tReg.body.id}/updates`, { headers: H }));
    check("deleted update leaves timeline (total=1)", updList2.body?.total === 1 &&
      !updList2.body?.items?.some((it: any) => it.id === u1.body.id), updList2.body?.total);
    const softRow = await db.execute(sql`SELECT deleted_at FROM todo_updates WHERE id = ${u1.body.id}`);
    check("removed update is soft-deleted (row kept)", (softRow.rows?.[0] as any)?.deleted_at != null, softRow.rows?.length);

    // updateCount surfaces on todo lists
    const countList = await j(await fetch(`${BASE}/api/todos?projectId=${tempProjectId}&status=all`, { headers: H }));
    const tRegRow = (countList.body || []).find((t: any) => t.id === tReg.body.id);
    check("todo list exposes updateCount", tRegRow?.updateCount === 1, tRegRow?.updateCount);

    // Completed todos still accept updates
    const completeReg = await j(await fetch(`${BASE}/api/todos/${tReg.body.id}/complete`, { method: "POST", headers: H2 }));
    check("assignee completes todo -> 200", completeReg.status === 200, completeReg.status);
    const uAfterDone = await j(await fetch(`${BASE}/api/todos/${tReg.body.id}/updates`, {
      method: "POST", headers: H2, body: JSON.stringify({ body: "Wrapped up — invoice filed." }),
    }));
    check("update on completed todo -> 201", uAfterDone.status === 201, uAfterDone.status);

    // Access control mirrors todo visibility
    const unauthUpd = await fetch(`${BASE}/api/todos/${tReg.body.id}/updates`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "anon" }),
    });
    check("unauthenticated add update -> 401", unauthUpd.status === 401, unauthUpd.status);
    const updOnPersonal = await fetch(`${BASE}/api/todos/${tPersonal.body.id}/updates`, {
      method: "POST", headers: H2, body: JSON.stringify({ body: "sneaky" }),
    });
    check("regular adds update to other's personal todo -> 403", updOnPersonal.status === 403, updOnPersonal.status);
    const listPersonalUpd = await fetch(`${BASE}/api/todos/${tPersonal.body.id}/updates`, { headers: H2 });
    check("regular lists other's personal todo updates -> 403", listPersonalUpd.status === 403, listPersonalUpd.status);
  } finally {
    // --- cleanup ---
    console.log("\nCleanup...");
    if (tempProjectId) {
      await db.execute(sql`DELETE FROM notifications WHERE project_id = ${tempProjectId}`);
      await db.execute(sql`DELETE FROM workflow_executions WHERE project_id = ${tempProjectId}`);
      await db.execute(sql`DELETE FROM activity_logs WHERE project_id = ${tempProjectId}`);
      await db.execute(sql`DELETE FROM project_status_history WHERE project_id = ${tempProjectId}`);
      await db.execute(sql`DELETE FROM todo_updates WHERE todo_id IN (SELECT id FROM todos WHERE project_id = ${tempProjectId})`);
      await db.execute(sql`DELETE FROM todos WHERE project_id = ${tempProjectId}`);
      await db.execute(sql`DELETE FROM files WHERE project_id = ${tempProjectId}`);
      await db.execute(sql`DELETE FROM folders WHERE project_id = ${tempProjectId}`);
      await db.execute(sql`DELETE FROM projects WHERE id = ${tempProjectId}`);
    }
    if (ruleId) {
      await db.execute(sql`DELETE FROM workflow_executions WHERE workflow_rule_id = ${ruleId}`);
      await db.execute(sql`DELETE FROM workflow_rules WHERE id = ${ruleId}`);
    }
    await db.execute(sql`DELETE FROM todo_updates WHERE todo_id IN (SELECT id FROM todos WHERE title = '__HTTP_TEST_PERSONAL__')`);
    await db.execute(sql`DELETE FROM todos WHERE title = '__HTTP_TEST_PERSONAL__'`);
    await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${REGULAR_ID}, ${PENDING_ID})`);
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid}`);
    if (sid2) await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid2}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${REGULAR_ID}, ${PENDING_ID})`);
    console.log("Cleanup done.");
  }

  console.log(failures === 0 ? "\nALL HTTP TESTS PASSED" : `\n${failures} HTTP TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error("Script error:", err); process.exit(1); });
