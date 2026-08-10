/**
 * Authenticated HTTP verification for Task 12 (Opportunities / RFP backend).
 * Forges a session like scripts/test-http-api.ts. Self-cleaning.
 * Run: npx tsx scripts/test-opportunities-api.ts
 */
import crypto from "node:crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { storage } from "../server/storage";
import { handleOpportunityStatusChange } from "../server/services/workflowEngine";

const BASE = "http://localhost:5000";
const USER_ID = "mobile-user-001"; // admin, approved

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
  const sid = crypto.randomBytes(16).toString("hex");
  const expiresAtSec = Math.floor(Date.now() / 1000) + 6 * 3600;
  const sess = {
    cookie: { originalMaxAge: 604800000, expires: new Date(Date.now() + 6 * 3600_000).toISOString(), httpOnly: true, path: "/" },
    passport: { user: { claims: { sub: USER_ID, email: "admin@test.com" }, expires_at: expiresAtSec, access_token: "test", refresh_token: "test" } },
  };
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}::jsonb, NOW() + interval '6 hours')`);
  const H = { Cookie: makeCookie(sid), "Content-Type": "application/json" };
  const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });

  let custAId: number | null = null;
  let custBId: number | null = null;
  let oppId: number | null = null;
  let opp2Id: number | null = null;
  let ruleId: number | null = null;
  let todoId: number | null = null;
  let commId: number | null = null;

  try {
    console.log("== Setup ==");
    const cA = await j(await fetch(`${BASE}/api/customers`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPP Test Customer A" }) }));
    const cB = await j(await fetch(`${BASE}/api/customers`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPP Test Customer B" }) }));
    custAId = cA.body?.id; custBId = cB.body?.id;
    check("setup customers", cA.status === 201 && cB.status === 201, [cA.status, cB.status]);

    const ctA1 = await j(await fetch(`${BASE}/api/customers/${custAId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ firstName: "Erin", lastName: "Estimator", mobilePhone: "555-3001", email: "erin@opp.local" }) }));
    const ctA2 = await j(await fetch(`${BASE}/api/customers/${custAId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ firstName: "Sam", lastName: "Signer", mobilePhone: "555-3002", email: "sam@opp.local" }) }));
    const ctB1 = await j(await fetch(`${BASE}/api/customers/${custBId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ firstName: "Blake", lastName: "OtherCo", mobilePhone: "555-3003", email: "blake@opp.local" }) }));
    check("setup contacts", ctA1.status === 201 && ctA2.status === 201 && ctB1.status === 201);

    console.log("== Creation + number generation ==");
    const create = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPP Test Warehouse Bid", customerId: custAId, status: "new" }) }));
    oppId = create.body?.id;
    const year = new Date().getFullYear();
    check("create 201 with minimal fields", create.status === 201, create);
    check(`number matches OPP-${year}-NNNN`, new RegExp(`^OPP-${year}-\\d{4}$`).test(create.body?.opportunityNumber ?? ""), create.body?.opportunityNumber);

    const create2 = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPP Test Second", customerId: custAId }) }));
    opp2Id = create2.body?.id;
    check("second create gets a different number", create2.status === 201 && create2.body?.opportunityNumber !== create.body?.opportunityNumber, [create.body?.opportunityNumber, create2.body?.opportunityNumber]);

    const badCust = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "x", customerId: 99999999 }) }));
    check("create with missing customer 400", badCust.status === 400, badCust);
    const badProb = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "x", customerId: custAId, probability: 150 }) }));
    check("probability > 100 rejected 400", badProb.status === 400, badProb);
    const badStatus = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "x", customerId: custAId, status: "bogus" }) }));
    check("invalid status rejected 400", badStatus.status === 400, badStatus);

    console.log("== Edit optional fields later ==");
    const upd = await j(await fetch(`${BASE}/api/opportunities/${oppId}`, { method: "PUT", headers: H, body: JSON.stringify({ bidDueDate: "2026-09-15", bidDueTime: "14:00", expectedValue: 250000, probability: 60, source: "email_rfp" }) }));
    check("update optional fields 200", upd.status === 200 && upd.body?.probability === 60 && upd.body?.bidDueTime === "14:00", upd);
    check("number unchanged after edits", upd.body?.opportunityNumber === create.body?.opportunityNumber);

    console.log("== Contacts ==");
    const l1 = await j(await fetch(`${BASE}/api/opportunities/${oppId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctA1.body.id, role: "estimator", isPrimary: true }) }));
    check("add contact w/ role + primary 201", l1.status === 201 && l1.body?.role === "estimator" && l1.body?.isPrimary === true, l1);
    const l2 = await j(await fetch(`${BASE}/api/opportunities/${oppId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctA2.body.id, role: "contract_signer" }) }));
    check("add second contact 201", l2.status === 201, l2);
    const dup = await j(await fetch(`${BASE}/api/opportunities/${oppId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctA1.body.id }) }));
    check("duplicate contact rejected 400", dup.status === 400, dup);
    const wrong = await j(await fetch(`${BASE}/api/opportunities/${oppId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctB1.body.id, role: "owner" }) }));
    check("cross-customer contact rejected 400", wrong.status === 400, wrong);

    // switch primary — only one primary at a time
    const makePrimary = await j(await fetch(`${BASE}/api/opportunity-contacts/${l2.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ isPrimary: true }) }));
    check("make second contact primary 200", makePrimary.status === 200 && makePrimary.body?.isPrimary === true, makePrimary);
    const clist = await j(await fetch(`${BASE}/api/opportunities/${oppId}/contacts`, { headers: H }));
    check("exactly one primary after switch", clist.body?.filter((c: any) => c.isPrimary).length === 1, clist.body);

    console.log("== Workflow rule + status change ==");
    const rule = await j(await fetch(`${BASE}/api/workflow-rules`, { method: "POST", headers: H, body: JSON.stringify({
      name: "__OPP Test Rule", triggerType: "opportunity_status_change", triggerStatus: "estimating",
      assignedToUserId: USER_ID, createTodo: true, todoTitle: "__OPP Test Takeoff", todoPriority: "normal",
      dueOffsetType: "days", dueOffsetDays: 3, dueOffsetUnit: "calendar_days",
      sendInAppNotification: true, sendEmailNotification: false, isActive: true,
    }) }));
    ruleId = rule.body?.id;
    check("create opportunity-trigger workflow rule 201", rule.status === 201, rule);
    const badRule = await j(await fetch(`${BASE}/api/workflow-rules`, { method: "POST", headers: H, body: JSON.stringify({
      name: "__OPP Bad Rule", triggerType: "opportunity_status_change", triggerStatus: "active", // project status, invalid here
      assignedToUserId: USER_ID, createTodo: false, todoPriority: "normal", dueOffsetType: "none", dueOffsetUnit: "calendar_days",
      sendInAppNotification: true, sendEmailNotification: false, isActive: true,
    }) }));
    check("rule with project status for opportunity trigger rejected 400", badRule.status === 400, badRule);

    const st = await j(await fetch(`${BASE}/api/opportunities/${oppId}/status`, { method: "POST", headers: H, body: JSON.stringify({ status: "estimating" }) }));
    check("status change 200", st.status === 200 && st.body?.status === "estimating", st);

    const hist = await j(await fetch(`${BASE}/api/opportunities/${oppId}/status-history`, { headers: H }));
    check("status history recorded", hist.status === 200 && hist.body?.length === 1 && hist.body[0].newStatus === "estimating", hist.body);

    const act = await j(await fetch(`${BASE}/api/opportunities/${oppId}/activity`, { headers: H }));
    const actions = (act.body ?? []).map((a: any) => a.action);
    check("activity includes create/update/contact/status", ["opportunity_created", "opportunity_updated", "opportunity_contact_added", "opportunity_status_changed"].every(a => actions.includes(a)), actions);

    // workflow-created todo linked to the opportunity
    const todos = await j(await fetch(`${BASE}/api/todos?assignedToUserId=me&status=all&today=2026-08-10`, { headers: H }));
    const wfTodo = (todos.body ?? []).find((t: any) => t.title === "__OPP Test Takeoff");
    check("workflow todo created + linked to opportunity", !!wfTodo && wfTodo.relatedEntityType === "opportunity" && wfTodo.relatedEntityId === oppId, wfTodo);
    check("todo enriched with opportunity name/number", wfTodo?.opportunityName === "__OPP Test Warehouse Bid" && /^OPP-/.test(wfTodo?.opportunityNumber ?? ""), wfTodo);
    if (wfTodo) todoId = wfTodo.id;

    // re-save same status → no-op: no new history, no duplicate todo
    const resave = await j(await fetch(`${BASE}/api/opportunities/${oppId}/status`, { method: "POST", headers: H, body: JSON.stringify({ status: "estimating" }) }));
    check("re-save same status 200 no-op", resave.status === 200, resave);
    const hist2 = await j(await fetch(`${BASE}/api/opportunities/${oppId}/status-history`, { headers: H }));
    check("no duplicate history on re-save", hist2.body?.length === 1, hist2.body);
    const todos2 = await j(await fetch(`${BASE}/api/todos?assignedToUserId=me&status=all&today=2026-08-10`, { headers: H }));
    check("no duplicate workflow todo on re-save", (todos2.body ?? []).filter((t: any) => t.title === "__OPP Test Takeoff").length === 1);

    console.log("== Cross-trigger rule updates rejected ==");
    // Switching a valid opportunity rule to the project trigger type while
    // keeping an opportunity-only status must be rejected (merged validation).
    const crossType = await j(await fetch(`${BASE}/api/workflow-rules/${ruleId}`, { method: "PUT", headers: H, body: JSON.stringify({ triggerType: "project_status_change" }) }));
    check("rule update to project trigger keeping opportunity status rejected 400", crossType.status === 400, crossType);
    const crossStatus = await j(await fetch(`${BASE}/api/workflow-rules/${ruleId}`, { method: "PUT", headers: H, body: JSON.stringify({ triggerStatus: "bidding" }) }));
    check("rule update to project-only status keeping opportunity trigger rejected 400", crossStatus.status === 400, crossStatus);
    const okUpdate = await j(await fetch(`${BASE}/api/workflow-rules/${ruleId}`, { method: "PUT", headers: H, body: JSON.stringify({ triggerType: "project_status_change", triggerStatus: "bidding" }) }));
    check("consistent cross-trigger update accepted 200", okUpdate.status === 200 && okUpdate.body?.triggerStatus === "bidding", okUpdate);
    // restore for later cleanup consistency
    await fetch(`${BASE}/api/workflow-rules/${ruleId}`, { method: "PUT", headers: H, body: JSON.stringify({ triggerType: "opportunity_status_change", triggerStatus: "estimating" }) });

    console.log("== Transition atomicity + dispatch retry ==");
    // The status update and its history row commit in ONE transaction: a
    // single storage call returns both, and a workflow dispatch that dies can
    // be replayed against the same history row without duplicating work.
    const opp3 = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPP Test Atomicity", customerId: custAId }) }));
    const tr = await storage.updateOpportunityWithStatusTracking(opp3.body.id, { status: "estimating" }, { userId: USER_ID, name: "Atomicity Test" });
    check("transition returns committed history atomically", tr.changed === true && !!tr.history && tr.history.newStatus === "estimating", tr.history);
    const histRows = await db.execute(sql`SELECT count(*)::int AS n FROM opportunity_status_history WHERE opportunity_id = ${opp3.body.id}`);
    check("exactly one history row for one transition", (histRows.rows[0] as any).n === 1, histRows.rows[0]);
    // Simulate a dispatch that crashed and is retried: fire twice for the SAME history row
    await handleOpportunityStatusChange({ opportunity: tr.opportunity, previousStatus: tr.previousStatus, newStatus: "estimating", statusHistoryId: tr.history!.id });
    await handleOpportunityStatusChange({ opportunity: tr.opportunity, previousStatus: tr.previousStatus, newStatus: "estimating", statusHistoryId: tr.history!.id });
    const execRows = await db.execute(sql`SELECT count(*)::int AS n FROM workflow_executions WHERE opportunity_id = ${opp3.body.id}`);
    check("retried dispatch executes exactly once", (execRows.rows[0] as any).n === 1, execRows.rows[0]);
    const todoRows = await db.execute(sql`SELECT count(*)::int AS n FROM todos WHERE related_entity_type = 'opportunity' AND related_entity_id = ${opp3.body.id} AND deleted_at IS NULL`);
    check("retried dispatch creates exactly one todo (event not lost, not duplicated)", (todoRows.rows[0] as any).n === 1, todoRows.rows[0]);

    console.log("== Lost / No Bid ==");
    const lostNoReason = await j(await fetch(`${BASE}/api/opportunities/${oppId}/status`, { method: "POST", headers: H, body: JSON.stringify({ status: "lost" }) }));
    check("lost without reason rejected 400", lostNoReason.status === 400, lostNoReason);
    const lost = await j(await fetch(`${BASE}/api/opportunities/${oppId}/status`, { method: "POST", headers: H, body: JSON.stringify({ status: "lost", lostReason: "price", lostReasonNotes: "10% over" }) }));
    check("lost with reason 200", lost.status === 200 && lost.body?.lostReason === "price" && lost.body?.lostReasonNotes === "10% over", lost);
    const noBid = await j(await fetch(`${BASE}/api/opportunities/${opp2Id}/status`, { method: "POST", headers: H, body: JSON.stringify({ status: "no_bid", noBidReason: "capacity" }) }));
    check("no_bid with reason 200", noBid.status === 200 && noBid.body?.noBidReason === "capacity", noBid);
    // lost records remain searchable
    const searchLost = await j(await fetch(`${BASE}/api/opportunities?search=__OPP%20Test%20Warehouse&status=lost`, { headers: H }));
    check("lost record searchable", searchLost.body?.some((o: any) => o.id === oppId), searchLost.body?.length);

    console.log("== Awarded ==");
    const award = await j(await fetch(`${BASE}/api/opportunities/${opp2Id}/status`, { method: "POST", headers: H, body: JSON.stringify({ status: "awarded" }) }));
    check("awarded sets award date", award.status === 200 && !!award.body?.awardDate, award.body?.awardDate);

    console.log("== Archive ==");
    const arch = await j(await fetch(`${BASE}/api/opportunities/${opp2Id}/archive`, { method: "POST", headers: H, body: JSON.stringify({ archived: true }) }));
    check("archive 200", arch.status === 200 && arch.body?.isArchived === true, arch);
    const listDefault = await j(await fetch(`${BASE}/api/opportunities`, { headers: H }));
    check("archived hidden by default", !(listDefault.body ?? []).some((o: any) => o.id === opp2Id));
    const listAll = await j(await fetch(`${BASE}/api/opportunities?includeArchived=true`, { headers: H }));
    check("archived visible with includeArchived", (listAll.body ?? []).some((o: any) => o.id === opp2Id));

    console.log("== Customer change safety ==");
    const custChange = await j(await fetch(`${BASE}/api/opportunities/${oppId}`, { method: "PUT", headers: H, body: JSON.stringify({ customerId: custBId }) }));
    check("customer change with contacts requires confirmation 409", custChange.status === 409, custChange);
    const custChangeOk = await j(await fetch(`${BASE}/api/opportunities/${oppId}`, { method: "PUT", headers: H, body: JSON.stringify({ customerId: custBId, confirmRemoveContacts: true }) }));
    check("confirmed customer change 200", custChangeOk.status === 200 && custChangeOk.body?.customerId === custBId, custChangeOk);
    const clistAfter = await j(await fetch(`${BASE}/api/opportunities/${oppId}/contacts`, { headers: H }));
    check("old-customer contacts removed", clistAfter.body?.length === 0, clistAfter.body);

    console.log("== Manual opportunity-linked todo ==");
    const manualTodo = await j(await fetch(`${BASE}/api/todos`, { method: "POST", headers: H, body: JSON.stringify({
      title: "__OPP Manual Todo", assignedToUserId: USER_ID, priority: "normal", status: "open",
      relatedEntityType: "opportunity", relatedEntityId: oppId,
    }) }));
    check("manual todo linked to opportunity, no project", manualTodo.status === 201 && manualTodo.body?.relatedEntityType === "opportunity" && manualTodo.body?.projectId === null, manualTodo);
    const badTodo = await j(await fetch(`${BASE}/api/todos`, { method: "POST", headers: H, body: JSON.stringify({
      title: "__OPP Bad Todo", assignedToUserId: USER_ID, priority: "normal", status: "open",
      relatedEntityType: "opportunity", relatedEntityId: 99999999,
    }) }));
    check("todo with missing opportunity rejected 400", badTodo.status === 400, badTodo);
    if (manualTodo.body?.id) {
      await fetch(`${BASE}/api/todos/${manualTodo.body.id}`, { method: "DELETE", headers: H });
    }

    console.log("== Communications link ==");
    const comm = await j(await fetch(`${BASE}/api/customers/${custBId}/communications`, { method: "POST", headers: H, body: JSON.stringify({ type: "phone", subject: "__OPP Test call", notes: "Discussed bid", contactDate: new Date().toISOString(), opportunityId: oppId }) }));
    commId = comm.body?.id;
    check("communication with opportunity link 201", comm.status === 201 && comm.body?.opportunityId === oppId, comm);
    const commWrong = await j(await fetch(`${BASE}/api/customers/${custAId}/communications`, { method: "POST", headers: H, body: JSON.stringify({ type: "phone", subject: "__OPP Bad call", notes: "Wrong customer", contactDate: new Date().toISOString(), opportunityId: oppId }) }));
    check("communication cross-customer opportunity rejected 400", commWrong.status === 400, commWrong);

    console.log("== Auth ==");
    const unauth = await fetch(`${BASE}/api/opportunities`);
    check("unauthenticated list 401", unauth.status === 401, unauth.status);
    const unauthEdit = await fetch(`${BASE}/api/opportunities/${oppId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "hax" }) });
    check("unauthenticated edit 401", unauthEdit.status === 401, unauthEdit.status);
  } finally {
    console.log("== Cleanup ==");
    try {
      if (commId) await db.execute(sql`DELETE FROM communications WHERE id = ${commId}`);
      await db.execute(sql`DELETE FROM communications WHERE subject LIKE '__OPP%'`);
      if (todoId) await db.execute(sql`DELETE FROM todo_updates WHERE todo_id = ${todoId}`);
      await db.execute(sql`DELETE FROM notifications WHERE related_entity_type = 'opportunity' AND related_entity_id IN (SELECT id FROM opportunities WHERE name LIKE '__OPP%')`);
      await db.execute(sql`DELETE FROM workflow_executions WHERE opportunity_id IN (SELECT id FROM opportunities WHERE name LIKE '__OPP%')`);
      await db.execute(sql`DELETE FROM todos WHERE title LIKE '__OPP%'`);
      if (ruleId) await db.execute(sql`DELETE FROM workflow_rules WHERE id = ${ruleId}`);
      await db.execute(sql`DELETE FROM workflow_rules WHERE name LIKE '__OPP%'`);
      await db.execute(sql`DELETE FROM opportunity_status_history WHERE opportunity_id IN (SELECT id FROM opportunities WHERE name LIKE '__OPP%')`);
      await db.execute(sql`DELETE FROM opportunity_contacts WHERE opportunity_id IN (SELECT id FROM opportunities WHERE name LIKE '__OPP%')`);
      await db.execute(sql`DELETE FROM activity_logs WHERE (entity_type = 'opportunity' AND entity_id IN (SELECT id FROM opportunities WHERE name LIKE '__OPP%')) OR description LIKE '%__OPP%'`);
      await db.execute(sql`DELETE FROM opportunities WHERE name LIKE '__OPP%'`);
      await db.execute(sql`DELETE FROM contacts WHERE email LIKE '%@opp.local'`);
      if (custAId) await db.execute(sql`DELETE FROM customers WHERE id = ${custAId}`);
      if (custBId) await db.execute(sql`DELETE FROM customers WHERE id = ${custBId}`);
      await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid}`);
    } catch (e) {
      console.error("cleanup error:", e);
    }
  }

  console.log(failures === 0 ? "\nALL OPPORTUNITY TESTS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
