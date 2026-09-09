/**
 * Authenticated HTTP verification for Task 21 (Opportunity documents:
 * categorized, versioned bidding documents on the files table).
 * Forges a session like scripts/test-http-api.ts. Self-cleaning.
 * Run: npx tsx scripts/test-opportunity-documents-api.ts
 */
import crypto from "node:crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5000";
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
  const outsiderSid = crypto.randomBytes(16).toString("hex");
  const outsiderUserId = "__opp-doc-outsider";
  const expiresAtSec = Math.floor(Date.now() / 1000) + 6 * 3600;
  const sess = {
    cookie: { originalMaxAge: 604800000, expires: new Date(Date.now() + 6 * 3600_000).toISOString(), httpOnly: true, path: "/" },
    passport: { user: { claims: { sub: USER_ID, email: "admin@test.com" }, expires_at: expiresAtSec, access_token: "test", refresh_token: "test" } },
  };
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}::jsonb, NOW() + interval '6 hours')`);

  // "Unauthorized" (not-yet-approved) user, to prove doc routes require approval
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, is_authorized)
    VALUES (${outsiderUserId}, ${"__opp-doc-outsider@test.local"}, 'Doc', 'Outsider', 'user', 'pending')
    ON CONFLICT (id) DO UPDATE SET role = 'user', is_authorized = 'pending'`);
  const outsiderSess = { ...sess, passport: { user: { ...sess.passport.user, claims: { sub: outsiderUserId, email: "__opp-doc-outsider@test.local" } } } };
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${outsiderSid}, ${JSON.stringify(outsiderSess)}::jsonb, NOW() + interval '6 hours')`);

  const H = { Cookie: makeCookie(sid), "Content-Type": "application/json" };
  const HO = { Cookie: makeCookie(outsiderSid), "Content-Type": "application/json" };
  const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });

  let custId: number | null = null;
  let oppId: number | null = null;
  let opp2Id: number | null = null;
  let projectId: number | null = null;
  let rfpCategory: { id: number; name: string; isActive: boolean } | null = null;

  try {
    console.log("== Setup ==");
    const cust = await j(await fetch(`${BASE}/api/customers`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPPDOC Test Customer" }) }));
    custId = cust.body?.id;
    check("setup customer", cust.status === 201, cust);

    const opp = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPPDOC Test Bid", customerId: custId }) }));
    oppId = opp.body?.id;
    check("setup opportunity", opp.status === 201, opp);
    const opp2 = await j(await fetch(`${BASE}/api/opportunities`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPPDOC Test Bid 2", customerId: custId }) }));
    opp2Id = opp2.body?.id;
    check("setup second opportunity", opp2.status === 201, opp2);

    console.log("== Regression: project files still project-scoped ==");
    const proj = await j(await fetch(`${BASE}/api/projects`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPPDOC Test Project", customerId: custId, status: "active" }) }));
    projectId = proj.body?.id;
    check("setup project", proj.status === 201, proj);
    const projFile = await j(await fetch(`${BASE}/api/projects/${projectId}/files`, { method: "POST", headers: H, body: JSON.stringify({ name: "__OPPDOC Project File.pdf", objectPath: "/objects/uploads/__test-project-file" }) }));
    check("project file create still works (unrelated to opportunity docs)", projFile.status === 201 && projFile.body?.projectId === projectId, projFile);
    const projList = await j(await fetch(`${BASE}/api/projects/${projectId}/files`, { headers: H }));
    check("project file list still works", projList.status === 200 && projList.body?.length === 1 && projList.body[0].id === projFile.body?.id, projList.body);

    console.log("== Documents: empty list ==");
    const emptyDocs = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: H }));
    check("no documents initially", emptyDocs.status === 200 && emptyDocs.body?.length === 0, emptyDocs.body);
    const notFoundDocs = await j(await fetch(`${BASE}/api/opportunities/999999999/documents`, { headers: H }));
    check("documents for missing opportunity 404", notFoundDocs.status === 404, notFoundDocs);

    console.log("== Upload v1 ==");
    const v1 = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "RFP Package.pdf", objectPath: "/objects/uploads/__test-rfp-v1", contentType: "application/pdf", size: 1024, category: "rfp", description: "Initial RFP" }),
    }));
    check("upload v1 201", v1.status === 201 && v1.body?.documentVersion === 1 && v1.body?.documentStatus === "current", v1);
    check("v1 has projectId null, opportunity link set", v1.body?.projectId === null && v1.body?.relatedEntityType === "opportunity" && v1.body?.relatedEntityId === oppId, v1.body);
    check("v1 documentGroupId defaults to its own id", v1.body?.documentGroupId === v1.body?.id, v1.body);
    check("v1 tracks uploader", v1.body?.uploadedByUserId === USER_ID, v1.body);
    const docId1 = v1.body?.id;

    console.log("== Category configuration preserves existing documents ==");
    const categoryList = await j(await fetch(`${BASE}/api/document-categories`, { headers: H }));
    rfpCategory = categoryList.body?.find((category: any) => category.key === "rfp") ?? null;
    check("RFP category is configured", categoryList.status === 200 && !!rfpCategory, categoryList);
    const renamedInactive = await j(await fetch(`${BASE}/api/document-categories/${rfpCategory?.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: "__Renamed RFP", isActive: false }),
    }));
    check("category can be renamed and deactivated", renamedInactive.status === 200 && renamedInactive.body?.name === "__Renamed RFP" && renamedInactive.body?.isActive === false, renamedInactive);
    const existingAfterCategoryChange = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: H }));
    check("existing document keeps its stable category key", existingAfterCategoryChange.body?.[0]?.category === "rfp", existingAfterCategoryChange.body?.[0]);
    const inactiveUpload = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "Inactive.pdf", objectPath: "/objects/uploads/__test-inactive", category: "rfp" }),
    }));
    check("inactive category rejected for a new document", inactiveUpload.status === 400, inactiveUpload);

    const badCategory = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "Bad.pdf", objectPath: "/objects/uploads/__test-bad", category: "not_a_real_category" }),
    }));
    check("invalid category rejected 400", badCategory.status === 400, badCategory);

    console.log("== List + uploader enrichment ==");
    const list1 = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: H }));
    check("list has 1 document", list1.status === 200 && list1.body?.length === 1, list1.body);
    check("list enriches uploader name", (list1.body?.[0]?.uploaderName ?? "").length > 0, list1.body?.[0]);

    console.log("== Upload v2 (new version, supersedes v1) ==");
    const v2 = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "RFP Package v2.pdf", objectPath: "/objects/uploads/__test-rfp-v2", category: "rfp", supersedesId: docId1 }),
    }));
    check("upload v2 201", v2.status === 201 && v2.body?.documentVersion === 2 && v2.body?.documentStatus === "current", v2);
    check("v2 shares v1's group id", v2.body?.documentGroupId === docId1, v2.body);
    check("inactive category remains valid for a new version", v2.body?.category === "rfp", v2.body);
    await fetch(`${BASE}/api/document-categories/${rfpCategory?.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: rfpCategory?.name, isActive: rfpCategory?.isActive }),
    });
    rfpCategory = null;

    const v1After = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: H }));
    const v1Row = v1After.body?.find((d: any) => d.id === docId1);
    const v2Row = v1After.body?.find((d: any) => d.id === v2.body?.id);
    check("v1 flipped to superseded and remains listed (not deleted)", v1Row?.documentStatus === "superseded", v1Row);
    check("v2 present as current", v2Row?.documentStatus === "current", v2Row);
    check("exactly 2 versions in the group", v1After.body?.filter((d: any) => d.documentGroupId === docId1).length === 2, v1After.body);

    console.log("== Cross-opportunity supersede rejected ==");
    const crossSupersede = await j(await fetch(`${BASE}/api/opportunities/${opp2Id}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "Sneaky.pdf", objectPath: "/objects/uploads/__test-sneaky", category: "rfp", supersedesId: docId1 }),
    }));
    check("supersedesId from a different opportunity rejected 400", crossSupersede.status === 400, crossSupersede);

    console.log("== Stale supersede rejected (docId1 is already superseded by v2) ==");
    const staleSupersede = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "RFP Package v3-stale.pdf", objectPath: "/objects/uploads/__test-rfp-v3-stale", category: "rfp", supersedesId: docId1 }),
    }));
    check("superseding a non-current version rejected 400", staleSupersede.status === 400, staleSupersede);
    const afterStale = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: H }));
    const groupAfterStale = (afterStale.body ?? []).filter((d: any) => d.documentGroupId === docId1);
    check("stale supersede attempt left exactly one current version", groupAfterStale.filter((d: any) => d.documentStatus === "current").length === 1, groupAfterStale);
    check("stale supersede attempt did not create a new row", groupAfterStale.length === 2, groupAfterStale);

    console.log("== Category is inherited from the document being versioned, ignoring client-sent category ==");
    const v3 = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "RFP Package v3.pdf", objectPath: "/objects/uploads/__test-rfp-v3", category: "plans", supersedesId: v2.body?.id }),
    }));
    check("v3 upload 201", v3.status === 201 && v3.body?.documentVersion === 3, v3);
    check("v3 category inherited as 'rfp' despite client sending 'plans'", v3.body?.category === "rfp", v3.body);

    console.log("== Category grouping across opportunity ==");
    const plans = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "Site Plans.pdf", objectPath: "/objects/uploads/__test-plans", category: "plans" }),
    }));
    check("second category upload 201", plans.status === 201, plans);
    const fullList = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: H }));
    const categories = new Set((fullList.body ?? []).map((d: any) => d.category));
    check("documents span multiple categories", categories.has("rfp") && categories.has("plans"), Array.from(categories));

    console.log("== Activity feed integration ==");
    const activity = await j(await fetch(`${BASE}/api/opportunities/${oppId}/activity`, { headers: H }));
    const actions = (activity.body ?? []).map((a: any) => a.action);
    check("activity has document_uploaded and document_version_added", actions.includes("document_uploaded") && actions.includes("document_version_added"), actions);

    console.log("== Cross-opportunity isolation (a user can't fetch another opportunity's docs by opp id) ==");
    const otherOppDocs = await j(await fetch(`${BASE}/api/opportunities/${opp2Id}/documents`, { headers: H }));
    check("opportunity 2 has no documents from opportunity 1", otherOppDocs.status === 200 && otherOppDocs.body?.length === 0, otherOppDocs.body);

    console.log("== Auth ==");
    const unauth = await fetch(`${BASE}/api/opportunities/${oppId}/documents`);
    check("unauthenticated list 401", unauth.status === 401, unauth.status);
    const unapproved = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: HO }));
    check("unapproved user forbidden 403", unapproved.status === 403, unapproved);
    const unapprovedUpload = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: HO,
      body: JSON.stringify({ name: "x.pdf", objectPath: "/objects/uploads/__test-x", category: "other" }),
    }));
    check("unapproved user cannot upload 403", unapprovedUpload.status === 403, unapprovedUpload);

    console.log("== Delete (soft) of a standalone document ==");
    const del = await fetch(`${BASE}/api/opportunities/${oppId}/documents/${plans.body?.id}`, { method: "DELETE", headers: H });
    check("delete document 204", del.status === 204, del.status);
    const afterDelete = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: H }));
    check("deleted document no longer listed", !(afterDelete.body ?? []).some((d: any) => d.id === plans.body?.id), afterDelete.body);
    const activityAfterDelete = await j(await fetch(`${BASE}/api/opportunities/${oppId}/activity`, { headers: H }));
    check("activity records document_deleted", (activityAfterDelete.body ?? []).some((a: any) => a.action === "document_deleted"), activityAfterDelete.body?.map((a: any) => a.action));
    const deleteWrongOpp = await fetch(`${BASE}/api/opportunities/${opp2Id}/documents/${docId1}`, { method: "DELETE", headers: H });
    check("delete via wrong opportunity id 404", deleteWrongOpp.status === 404, deleteWrongOpp.status);

    console.log("== Deleting the current version of a versioned group promotes the next-latest version ==");
    // Group docId1 currently holds v1 (superseded), v2 (superseded), v3 (current).
    const deleteCurrent = await fetch(`${BASE}/api/opportunities/${oppId}/documents/${v3.body?.id}`, { method: "DELETE", headers: H });
    check("delete current version 204", deleteCurrent.status === 204, deleteCurrent.status);
    const afterPromote = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, { headers: H }));
    const groupAfterPromote = (afterPromote.body ?? []).filter((d: any) => d.documentGroupId === docId1);
    check("deleted current version no longer listed", !groupAfterPromote.some((d: any) => d.id === v3.body?.id), groupAfterPromote);
    check("exactly one current version remains after deleting the current one", groupAfterPromote.filter((d: any) => d.documentStatus === "current").length === 1, groupAfterPromote);
    const promoted = groupAfterPromote.find((d: any) => d.documentStatus === "current");
    check("the newest remaining (non-deleted) version was promoted to current", promoted?.id === v2.body?.id && promoted?.documentVersion === 2, promoted);
    const newVersionAfterPromotion = await j(await fetch(`${BASE}/api/opportunities/${oppId}/documents`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "RFP Package v4.pdf", objectPath: "/objects/uploads/__test-rfp-v4", category: "rfp", supersedesId: promoted?.id }),
    }));
    check("new version can still be uploaded against the promoted current version", newVersionAfterPromotion.status === 201 && newVersionAfterPromotion.body?.documentVersion === 4, newVersionAfterPromotion);

    console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  } finally {
    console.log("Cleaning up temp data...");
    if (rfpCategory) {
      await db.execute(sql`UPDATE document_categories SET name = ${rfpCategory.name}, is_active = ${rfpCategory.isActive}, updated_at = NOW() WHERE id = ${rfpCategory.id}`);
    }
    if (oppId || opp2Id) {
      const ids = [oppId, opp2Id].filter(Boolean) as number[];
      await db.execute(sql`DELETE FROM files WHERE related_entity_type = 'opportunity' AND related_entity_id = ANY(ARRAY[${sql.join(ids, sql`, `)}]::int[])`);
      await db.execute(sql`DELETE FROM opportunity_status_history WHERE opportunity_id = ANY(ARRAY[${sql.join(ids, sql`, `)}]::int[])`);
      await db.execute(sql`DELETE FROM activity_logs WHERE entity_type = 'opportunity_document' AND (metadata->>'opportunityId')::int = ANY(ARRAY[${sql.join(ids, sql`, `)}]::int[])`);
      await db.execute(sql`DELETE FROM opportunities WHERE id = ANY(ARRAY[${sql.join(ids, sql`, `)}]::int[])`);
    }
    if (projectId) {
      await db.execute(sql`DELETE FROM files WHERE project_id = ${projectId}`);
      await db.execute(sql`DELETE FROM projects WHERE id = ${projectId}`);
    }
    if (custId) {
      await db.execute(sql`DELETE FROM customers WHERE id = ${custId}`);
    }
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid} OR sid = ${outsiderSid}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${outsiderUserId}`);
    console.log("Cleanup done.");
  }

  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
