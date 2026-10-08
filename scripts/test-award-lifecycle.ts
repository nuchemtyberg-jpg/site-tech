/** Isolated authenticated regression fixtures; all metadata is removed in finally. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, pool } from "../server/db";
import { sql, eq, and, inArray } from "drizzle-orm";
import {
  users, customers, opportunities, projects, projectContracts, folders, files,
  contacts, opportunityContacts, todos, todoUpdates, communications, opportunityScopeItems,
  opportunityStatusHistory, projectStatusHistory, activityLogs, notifications,
  workflowRules, workflowExecutions, projectContacts,
  photos, rfis,
} from "../shared/schema";
import { checkAwardBrowser } from "./award-lifecycle-browser";

const base = process.env.TEST_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const token = crypto.randomUUID();
const prefix = `__AWARD_${token}`;
const userIds = [`award-admin-${token}`, `award-user-${token}`, `award-denied-${token}`];
const sessions: string[] = [];
const bidIds: number[] = [], projectIds: number[] = [], customerIds: number[] = [];
let ruleId: number | undefined;
let passed = 0;
function check(value: unknown, label: string) { assert.ok(value, label); console.log(`PASS ${++passed} ${label}`); }

async function session(userId: string) {
  const sid = crypto.randomUUID(); sessions.push(sid);
  const sess = { cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: "/" }, passport: { user: { claims: { sub: userId }, expires_at: Math.floor(Date.now() / 1000) + 3600 } } };
  await db.execute(sql`INSERT INTO sessions (sid,sess,expire) VALUES (${sid},${JSON.stringify(sess)}::jsonb,NOW()+interval '1 hour')`);
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
  return `connect.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`;
}
async function main() {
  try {
    // Do not send workflow effects to real users during this isolated suite.
    const realRules = await db.select().from(workflowRules).where(and(
      eq(workflowRules.triggerType, "opportunity_status_change"), eq(workflowRules.triggerStatus, "awarded"),
      eq(workflowRules.isActive, true), sql`${workflowRules.deletedAt} is null`,
    ));
    assert.equal(realRules.length, 0, "Use an isolated test database when real award rules are configured");
    await db.insert(users).values(userIds.map((id, i) => ({
      id, email: `${id}@example.invalid`, firstName: "Award", lastName: "Fixture",
      role: i === 0 ? "admin" : "user", isAuthorized: i === 2 ? "pending" : "approved",
    })));
    const adminCookie = await session(userIds[0]), staffCookie = await session(userIds[1]), deniedCookie = await session(userIds[2]);
    const request = async (path: string, method = "GET", body?: any, cookie = adminCookie) => {
      const response = await fetch(`${base}${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      let data: any; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: response.status, body: data };
    };
    for (let i = 0; i < 2; i++) {
      const [c] = await db.insert(customers).values({ name: `${prefix}-customer-${i}` }).returning(); customerIds.push(c.id);
    }
    const createBid = async (name: string, targetProjectId?: number) => {
      const result = await request("/api/opportunities", "POST", {
        name: `${prefix}-${name}`, customerId: customerIds[0], targetProjectId: targetProjectId ?? null,
        streetAddress: "10 Test Street", address2: "Unit 2", city: "Test City", state: "NJ", zip: "07001",
        expectedValue: 1000, probability: 75, responsibleUserId: userIds[1],
        scopeSummary: "Original scope", internalNotes: "Internal note", estimatedStartDate: "2027-04-15",
        rfpReceivedDate: "2026-10-01", bidDueDate: "2026-10-10", bidDueTime: "15:30", source: "other", projectType: "other",
      });
      assert.equal(result.status, 201, JSON.stringify(result.body)); bidIds.push(result.body.id); return result.body;
    };
    const bid = await createBid("first");
    const [contact] = await db.insert(contacts).values({ customerId: customerIds[0], firstName: "Fixture" }).returning();
    await db.insert(opportunityContacts).values({ opportunityId: bid.id, contactId: contact.id, role: "estimating", isPrimary: true });
    const [todo] = await db.insert(todos).values({
      title: "Completed retained todo", assignedToUserId: userIds[1], status: "completed",
      completedByUserId: userIds[1], completedAt: new Date(), dueDate: "2026-10-01",
      relatedEntityType: "opportunity", relatedEntityId: bid.id,
    }).returning();
    await db.insert(todoUpdates).values({ todoId: todo.id, createdByUserId: userIds[1], body: "Retained comment" });
    await db.insert(files).values({ name: "todo.txt", objectPath: `/objects/${token}/todo`, relatedEntityType: "todo", relatedEntityId: todo.id });
    await db.insert(communications).values({
      customerId: customerIds[0], opportunityId: bid.id, type: "email", notes: "Retained communication",
      contactDate: new Date("2026-10-01T12:00:00Z"), contactId: contact.id,
    });
    const scope = await db.select().from(opportunityScopeItems).where(eq(opportunityScopeItems.opportunityId, bid.id)).limit(1);
    if (scope[0]) await db.update(opportunityScopeItems).set({ notes: "Retained checklist", status: "included" }).where(eq(opportunityScopeItems.id, scope[0].id));
    const docBase = `/api/document-tools/opportunity/${bid.id}`;
    const preset = (await request(`${docBase}/folders`)).body;
    await request(`${docBase}/folders/${preset[0].id}`, "PUT", { name: "Renamed preset" });
    const custom = (await request(`${docBase}/folders`, "POST", { name: "Custom" })).body;
    const nested = (await request(`${docBase}/folders`, "POST", { name: "Nested", parentId: custom.id })).body;
    const empty = (await request(`${docBase}/folders`, "POST", { name: "Empty" })).body;
    const file = (await request(`${docBase}/files`, "POST", { name: "same.pdf", objectPath: `/objects/${token}/one`, folderId: nested.id })).body;
    await request(`${docBase}/files/${file.id}`, "PUT", { tags: ["bid"], starred: true });
    await db.update(files).set({ category: "proposal", description: "Legacy description" }).where(eq(files.id, file.id));
    const second = (await request(`${docBase}/files`, "POST", { name: "same.pdf", objectPath: `/objects/${token}/two`, supersedesId: file.id })).body;
    const root = (await request(`${docBase}/files`, "POST", { name: "same.pdf", objectPath: `/objects/${token}/root`, folderId: null })).body;
    const tombstone = (await request(`${docBase}/folders`, "POST", { name: "Deleted" })).body;
    await request(`${docBase}/folders/${tombstone.id}`, "DELETE");
    const beforeFiles = await db.select().from(files).where(eq(files.relatedEntityId, bid.id));
    const beforeFolders = await db.select().from(folders).where(eq(folders.opportunityId, bid.id));
    const [rule] = await db.insert(workflowRules).values({
      name: `${prefix}-rule`, triggerType: "opportunity_status_change", triggerStatus: "awarded",
      assignedToUserId: userIds[1], todoTitle: "Award fixture workflow", dueOffsetType: "immediately",
      sendEmailNotification: false,
    }).returning(); ruleId = rule.id;
    const statusPath = `/api/opportunities/${bid.id}/status`;
    const [awards, concurrentFile, concurrentUpdate] = await Promise.all([
      Promise.all(Array.from({ length: 5 }, () => request(statusPath, "POST", { status: "awarded", awardDate: "2026-10-07" }))),
      request(`${docBase}/files`, "POST", { name: "concurrent.txt", objectPath: `/objects/${token}/concurrent`, folderId: empty.id }),
      request(`/api/todos/${todo.id}/updates`, "POST", { body: "Concurrent award-time comment" }),
    ]);
    check(concurrentFile.status === 201 && concurrentUpdate.status === 201, "document registration and completed-todo comments survive concurrent award");
    check(awards.every(r => r.status === 200), "concurrent repeat awards succeed");
    const projectId = awards[0].body.convertedProjectId; projectIds.push(projectId);
    check(awards.every(r => r.body.convertedProjectId === projectId), "one shared association returned on every retry");
    const project = (await request(`/api/projects/${projectId}`)).body;
    check(project.status === "new" && project.startDate === null && /^S-\d+$/.test(project.projectNumber) && project.projectEmail.endsWith("@updates.sitetechnj.com"), "New Project has normal number/email and no invented work start");
    check(project.description === bid.scopeSummary && project.notes === bid.internalNotes && project.customerId === bid.customerId && project.zip === bid.zip, "compatible bid fields map without loss");
    assert.deepEqual((await db.select().from(files).where(eq(files.relatedEntityId, bid.id))).filter(f => f.id !== concurrentFile.body.id), beforeFiles);
    assert.deepEqual(await db.select().from(folders).where(eq(folders.opportunityId, bid.id)), beforeFolders);
    check(true, "every version/metadata/folder identity/tombstone remains exactly unchanged");
    check((await db.select().from(folders).where(eq(folders.projectId, projectId))).length === 0, "award never seeds another preset tree");
    check((await db.select().from(projectContracts).where(eq(projectContracts.opportunityId, bid.id))).length === 1, "one immutable contract");
    check((await db.select().from(workflowExecutions).where(eq(workflowExecutions.opportunityId, bid.id))).length === 1, "award workflow executes once");
    const projectDocs = `/api/document-tools/project/${projectId}`;
    assert.deepEqual((await request(`${projectDocs}/files`)).body, (await request(`${docBase}/files`)).body);
    check(true, "Project and Bidding resolve identical documents, including root files");
    const third = (await request(`${projectDocs}/files`, "POST", { name: "revision.pdf", objectPath: `/objects/${token}/three`, supersedesId: second.id })).body;
    check(third.documentVersion === 3 && third.folderId === nested.id && third.category === "proposal", "Project revisions preserve bid ownership, folder and legacy metadata");
    check((await request(`${docBase}/files`, "POST", { name: "stale", objectPath: `/objects/${token}/stale`, supersedesId: second.id })).status === 409, "stale revision is rejected");
    await request(`${projectDocs}/files/${third.id}`, "PUT", { name: "renamed.pdf", folderId: null, starred: false });
    const revised = (await request(`${docBase}/files`)).body;
    check(revised.filter((f: any) => f.documentGroupId === file.id).every((f: any) => f.name === "renamed.pdf" && f.folderId === null && !f.starred), "rename/move/star affects same group in both views");
    await request(`${docBase}/files/${third.id}?scope=version`, "DELETE");
    const fourth = (await request(`${projectDocs}/files`, "POST", { name: "fourth", objectPath: `/objects/${token}/four`, supersedesId: second.id })).body;
    check(fourth.documentVersion === 4, "version numbering is monotonic across deleted history");
    const staleUpload = (await request(`${docBase}/files`, "POST", { name: "inflight.txt", objectPath: `/objects/${token}/inflight`, folderId: empty.id })).body;
    check((await request(`${projectDocs}/files`)).body.some((f: any) => f.id === staleUpload.id), "pre-award tab/in-flight registration stays reachable");
    check((await request(`${projectDocs}/files`)).body.some((f: any) => f.id === concurrentFile.body.id), "concurrent award-time document accessible from Project");
    check((await request(`/api/opportunities/${bid.id}/todos`)).body.some((t: any) => t.id === todo.id && t.status === "completed"), "completed todo retained with assignment");
    check((await request(`/api/todos/${todo.id}/updates`)).status === 200, "todo comment/attachment detail remains accessible");
    check((await request(`/api/opportunities/${bid.id}/communications`)).body.length === 1 && (await request(`/api/opportunities/${bid.id}/contacts`)).body[0].role === "estimating", "communications/contact bidding roles retained");
    const initialContract = (await request(`/api/projects/${projectId}/bids`)).body.bids[0].contract;
    if (scope[0]) {
      const editedScope = await request(`/api/opportunities/${bid.id}/scope/${scope[0].id}`, "PUT", { notes: "Post-award checklist notes" });
      check(editedScope.status === 200 && editedScope.body.notes === "Post-award checklist notes" &&
        initialContract.snapshot.scopeItems.find((i: any) => i.id === scope[0].id).notes === "Retained checklist", "contract retains original checklist independent of later planning");
    }
    await request(`/api/opportunities/${bid.id}`, "PUT", { expectedValue: 9000, scopeSummary: "Edited planning", internalNotes: "Later notes" });
    const immutable = (await request(`/api/projects/${projectId}/bids`)).body;
    check(immutable.awardedTotal === 1000 && immutable.bids[0].contract.snapshot.scopeSummary === "Original scope" && immutable.bids[0].contract.amount === 1000, "later bid edits do not rewrite contract terms/totals");
    check(initialContract.snapshot.address2 === "Unit 2" && initialContract.snapshot.bidDueTime === "15:30" && initialContract.snapshot.responsibleUserId === userIds[1], "bid-only fields retained in full award snapshot");
    check((await request(statusPath, "POST", { status: "new" })).status === 409 && (await request(`/api/opportunities/${bid.id}`, "PUT", { targetProjectId: null, customerId: customerIds[1] })).status === 409, "un-award/customer retargeting is blocked");
    check((await request(`/api/projects/${projectId}`, "DELETE")).status === 409, "contracted Project cannot silently delete association");
    const additional = await createBid("additional", projectId), additional2 = await createBid("additional2", projectId);
    const pending = await createBid("pending", projectId);
    const otherFile = (await request(`/api/document-tools/opportunity/${additional.id}/files`, "POST", { name: "same.pdf", objectPath: `/objects/${token}/additional`, folderId: null })).body;
    const additions = await Promise.all([additional, additional2].map(b => request(`/api/opportunities/${b.id}/status`, "POST", { status: "awarded", awardDate: "2026-10-08" })));
    check(additions.every(r => r.status === 200 && r.body.convertedProjectId === projectId), "different concurrent bids both add contracts to explicitly selected Project");
    assert.deepEqual((await request(`/api/projects/${projectId}`)).body, project);
    check(true, "additional awards overwrite no Project operational fields or dates");
    const totals = (await request(`/api/projects/${projectId}/bids`)).body;
    check(totals.awardedTotal === 3000 && totals.pendingTotal === 1000 && totals.bids.length === 4, "awarded totals count each contract once, pending estimates separately");
    check((await request(`/api/projects/${projectId}/document-sources`)).body.length === 4, "additional and pending bid document trees remain labeled sources");
    check(!(await request(`${projectDocs}/files`)).body.some((f: any) => f.id === otherFile.id), "same-named additional files not flattened into original source");
    check((await request(`${docBase}/files?projectId=${projectId}`)).status === 200 && (await request(`/api/document-tools/opportunity/${pending.id}/files?projectId=${projectId}`)).status === 200, "explicit linked document sources authorized server-side");
    const [unrelated] = await db.insert(projects).values({ name: `${prefix}-unrelated`, customerId: customerIds[1], status: "active" }).returning(); projectIds.push(unrelated.id);
    check((await request(`${docBase}/files?projectId=${unrelated.id}`)).status === 403, "unrelated Project cannot claim linked bid document source");
    check((await request(`/api/opportunities/${pending.id}`, "PUT", { targetProjectId: unrelated.id })).status === 409, "customer-incompatible target rejected server-side");
    check((await request(`/api/opportunities/${pending.id}/status`, "POST", { status: "awarded", expectedTargetProjectId: null })).status === 409, "stale award confirmation cannot silently change destination");
    const staffView = (await request(`/api/projects/${projectId}/bids`, "GET", undefined, staffCookie)).body;
    check(staffView.project.estimatedValue === null && staffView.project.financialValuesRestricted &&
      staffView.awardedTotal === null && staffView.bids.every((b: any) => b.expectedValue === null && (!b.contract || (b.contract.amount === null && b.contract.snapshot.expectedValue === null))), "ordinary staff cannot read restricted values via contracts or embedded Project");
    const staffProject = (await request(`/api/projects/${projectId}`, "GET", undefined, staffCookie)).body;
    const staffProjects = (await request("/api/projects", "GET", undefined, staffCookie)).body;
    const staffCustomerProjects = (await request(`/api/customers/${customerIds[0]}/projects`, "GET", undefined, staffCookie)).body;
    check(staffProject.estimatedValue === null && staffProject.financialValuesRestricted &&
      staffProjects.find((p: any) => p.id === projectId).estimatedValue === null &&
      staffCustomerProjects.find((p: any) => p.id === projectId).estimatedValue === null,
      "non-admin Project detail/list/customer responses never expose award-derived financial values");
    check((await request(`/api/projects/${projectId}`, "PUT", { estimatedValue: 9999 }, staffCookie)).status === 403,
      "non-admin cannot alter restricted award-derived Project finances");
    const echoedProject = await request(`/api/projects/${projectId}`, "PUT", { notes: project.notes }, staffCookie);
    check(echoedProject.status === 200 && echoedProject.body.estimatedValue === null &&
      (await request(`/api/projects/${projectId}`)).body.estimatedValue === 1000,
      "ordinary operational edits redact financial echoes; authorized admins retain operational value");
    await db.update(projects).set({ estimatedValue: 1234 }).where(eq(projects.id, unrelated.id));
    check((await request(`/api/projects/${unrelated.id}`, "GET", undefined, staffCookie)).body.estimatedValue === 1234,
      "redaction leaves unrelated native Project financial policy unchanged");
    check((await request(`/api/opportunities/${pending.id}/status`, "POST", { status: "awarded" }, deniedCookie)).status === 403, "unapproved user cannot award");
    const closed = await createBid("lost");
    await request(`/api/opportunities/${closed.id}/status`, "POST", { status: "lost", lostReason: "other" });
    check((await request(`/api/opportunities/${closed.id}/status`, "POST", { status: "awarded" })).status === 409, "Lost bids must reopen before award");
    const rollback = await createBid("rollback");
    // An invalid computed rule date fails AFTER Project/contract insertion.
    await db.update(workflowRules).set({ dueOffsetType: "days", dueOffsetDays: 1000000000 }).where(eq(workflowRules.id, rule.id));
    check((await request(`/api/opportunities/${rollback.id}/status`, "POST", { status: "awarded", awardDate: "2026-10-07" })).status === 500, "in-transaction workflow failure surfaces explicitly");
    check((await db.select().from(projects).where(eq(projects.name, rollback.name))).length === 0 &&
      (await db.select().from(projectContracts).where(eq(projectContracts.opportunityId, rollback.id))).length === 0 &&
      (await db.select().from(opportunities).where(eq(opportunities.id, rollback.id)))[0].status === "new", "failure rolls back Project, contract, status and workflow claim");
    await db.update(workflowRules).set({ dueOffsetType: "immediately", dueOffsetDays: null }).where(eq(workflowRules.id, rule.id));
    const retry = await request(`/api/opportunities/${rollback.id}/status`, "POST", { status: "awarded" }); projectIds.push(retry.body.convertedProjectId);
    check(retry.status === 200, "failed award can safely retry");
    const historic = await createBid("historic");
    const [source] = await db.insert(projects).values({ name: `${prefix}-retired`, customerId: customerIds[0], status: "bidding", notes: "Original retired notes", deletedAt: new Date() }).returning(); projectIds.push(source.id);
    await db.insert(projectContacts).values({ projectId: source.id, contactId: contact.id, roleLabel: "Original PM role" });
    await db.insert(photos).values({ projectId: source.id, name: "Retained historical photo", objectPath: `/objects/${token}/historical-photo` });
    await db.insert(rfis).values({ projectId: source.id, rfiNumber: 1, subject: "Retained RFI", question: "Original question", directedTo: "Fixture", directedToEmail: "fixture@example.invalid", createdBy: userIds[0] });
    await db.update(opportunities).set({ status: "awarded", awardDate: "2026-09-20", migratedFromProjectId: source.id, migratedFromProjectNumber: "S-OLD" }).where(eq(opportunities.id, historic.id));
    const preview = (await request("/api/opportunities/award-catch-up")).body;
    check(preview.some((b: any) => b.id === historic.id && b.action === "create" && b.migratedFromProjectId === source.id), "catch-up preview retains original provenance without modifying old awards");
    check((await request("/api/opportunities/award-catch-up", "POST", { opportunityIds: [historic.id], confirm: true }, staffCookie)).status === 403 &&
      (await request("/api/opportunities/award-catch-up", "POST", { opportunityIds: [historic.id], confirm: false })).status === 400, "catch-up requires explicit admin confirmation");
    const catchup = (await request("/api/opportunities/award-catch-up", "POST", { opportunityIds: [historic.id], confirm: true })).body.results[0]; projectIds.push(catchup.projectId);
    check(catchup.success && catchup.projectId !== source.id, "approved catch-up creates a new Project, never restores retired source");
    const again = (await request("/api/opportunities/award-catch-up", "POST", { opportunityIds: [historic.id], confirm: true })).body.results[0];
    const historicContract = (await db.select().from(projectContracts).where(eq(projectContracts.opportunityId, historic.id)))[0];
    check(again.projectId === catchup.projectId && historicContract.awardDate === "2026-09-20" &&
      (await db.select().from(workflowExecutions).where(eq(workflowExecutions.opportunityId, historic.id))).length === 0,
      "catch-up retry preserves original award date and does not replay workflows");
    const migration = (await request(`/api/opportunities/${historic.id}/migration-history`)).body;
    check(migration.project.deletedAt && migration.project.notes === "Original retired notes" && migration.contacts[0].link.roleLabel === "Original PM role", "historical source terms/roles accessible without overwriting or restoring source");
    check(migration.retainedWork.photos[0].name === "Retained historical photo" && migration.retainedWork.rfis[0].question === "Original question", "residual photos/RFIs and original operational terms explicitly reconciled into read-only history");
    const broken = await createBid("broken");
    await db.update(opportunities).set({ status: "awarded", awardDate: "2026-09-20", convertedProjectId: source.id }).where(eq(opportunities.id, broken.id));
    check((await request("/api/opportunities/award-catch-up")).body.some((b: any) => b.id === broken.id && b.action === "conflict"), "deleted/broken links are conflicts, never silently replaced");
    const rejectedCatchup = (await request("/api/opportunities/award-catch-up", "POST", { opportunityIds: [broken.id], confirm: true })).body.results[0];
    check(!rejectedCatchup.success && (await db.select().from(projects).where(eq(projects.name, broken.name))).length === 0, "explicit catch-up cannot replace a broken association either");
    const pipeline = (await request("/api/opportunities/dashboard")).body;
    check(!pipeline.items.some((b: any) => b.id === bid.id), "awarded bid excluded from active pipeline by status, not deletion/archive");
    await db.update(workflowRules).set({ isActive: false }).where(eq(workflowRules.id, rule.id));
    if (process.env.SKIP_AWARD_BROWSER !== "1") await checkAwardBrowser(base, adminCookie, projectId, bid.id, pending.id, staffCookie);
    console.log(`Award lifecycle: ${passed} API checks passed.`);
  } finally {
    // Include partially observed fixture outputs if an assertion failed mid-request.
    const fixtureProjects = await db.select({ id: projects.id }).from(projects).where(sql`${projects.name} like ${prefix + "%"}`);
    const pids = [...new Set([...projectIds, ...fixtureProjects.map(p => p.id)])].filter(Number.isFinite);
    const fixtureBids = await db.select({ id: opportunities.id }).from(opportunities).where(sql`${opportunities.name} like ${prefix + "%"}`);
    const bids = [...new Set([...bidIds, ...fixtureBids.map(b => b.id)])];
    const fixtureTodos = await db.select({ id: todos.id }).from(todos).where(inArray(todos.assignedToUserId, userIds));
    if (fixtureTodos.length) {
      await db.delete(todoUpdates).where(inArray(todoUpdates.todoId, fixtureTodos.map(t => t.id)));
      await db.delete(files).where(and(eq(files.relatedEntityType, "todo"), inArray(files.relatedEntityId, fixtureTodos.map(t => t.id))));
    }
    await db.delete(notifications).where(inArray(notifications.userId, userIds));
    await db.delete(todos).where(inArray(todos.assignedToUserId, userIds));
    if (bids.length) {
      await db.delete(workflowExecutions).where(inArray(workflowExecutions.opportunityId, bids));
      await db.delete(projectContracts).where(inArray(projectContracts.opportunityId, bids));
      await db.delete(opportunityStatusHistory).where(inArray(opportunityStatusHistory.opportunityId, bids));
      await db.delete(opportunityContacts).where(inArray(opportunityContacts.opportunityId, bids));
      await db.delete(opportunityScopeItems).where(inArray(opportunityScopeItems.opportunityId, bids));
      await db.delete(communications).where(inArray(communications.opportunityId, bids));
      await db.delete(files).where(and(eq(files.relatedEntityType, "opportunity"), inArray(files.relatedEntityId, bids)));
      await db.delete(folders).where(inArray(folders.opportunityId, bids));
      await db.delete(opportunities).where(inArray(opportunities.id, bids));
    }
    if (pids.length) {
      await db.delete(projectStatusHistory).where(inArray(projectStatusHistory.projectId, pids));
      await db.delete(projectContacts).where(inArray(projectContacts.projectId, pids));
      await db.delete(photos).where(inArray(photos.projectId, pids));
      await db.delete(rfis).where(inArray(rfis.projectId, pids));
      await db.delete(folders).where(inArray(folders.projectId, pids));
      await db.delete(files).where(inArray(files.projectId, pids));
      await db.delete(activityLogs).where(inArray(activityLogs.projectId, pids));
      await db.delete(projects).where(inArray(projects.id, pids));
    }
    if (bids.length) await db.delete(activityLogs).where(sql`${activityLogs.metadata}->>'opportunityId' in (${sql.join(bids.map(b => sql`${String(b)}`), sql`, `)})`);
    await db.delete(activityLogs).where(inArray(activityLogs.actorUserId, userIds));
    if (ruleId) await db.delete(workflowRules).where(eq(workflowRules.id, ruleId));
    if (customerIds.length) {
      await db.delete(contacts).where(inArray(contacts.customerId, customerIds));
      await db.delete(customers).where(inArray(customers.id, customerIds));
    }
    for (const sid of sessions) await db.execute(sql`delete from sessions where sid=${sid}`);
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
