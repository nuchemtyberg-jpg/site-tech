/**
 * One-off authenticated HTTP verification for Task 11 (Project Contacts).
 * Forges a session like scripts/test-http-api.ts. Self-cleaning.
 * Run: npx tsx scripts/test-project-contacts-api.ts
 */
import crypto from "node:crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

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
  let projId: number | null = null;
  let projNoCustId: number | null = null;

  try {
    // ---- setup: two customers, contacts, a project ----
    const cA = await j(await fetch(`${BASE}/api/customers`, { method: "POST", headers: H, body: JSON.stringify({ name: "__PC Test Customer A" }) }));
    const cB = await j(await fetch(`${BASE}/api/customers`, { method: "POST", headers: H, body: JSON.stringify({ name: "__PC Test Customer B" }) }));
    custAId = cA.body?.id; custBId = cB.body?.id;
    check("setup customers", cA.status === 201 && cB.status === 201, [cA.status, cB.status]);

    const ctA1 = await j(await fetch(`${BASE}/api/customers/${custAId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ firstName: "Pat", lastName: "Super", mobilePhone: "555-2000", email: "pat@pc.local" }) }));
    const ctA2 = await j(await fetch(`${BASE}/api/customers/${custAId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ firstName: "Ann", lastName: "AP", officePhone: "555-3000" }) }));
    const ctB1 = await j(await fetch(`${BASE}/api/customers/${custBId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ firstName: "Other", lastName: "Guy" }) }));
    check("setup contacts", ctA1.status === 201 && ctA2.status === 201 && ctB1.status === 201);

    const p = await j(await fetch(`${BASE}/api/projects`, { method: "POST", headers: H, body: JSON.stringify({ name: "__PC Test Project", customerId: custAId }) }));
    projId = p.body?.id;
    check("setup project", p.status === 201 || p.status === 200, p);

    const pNo = await j(await fetch(`${BASE}/api/projects`, { method: "POST", headers: H, body: JSON.stringify({ name: "__PC Test Project NoCust" }) }));
    projNoCustId = pNo.body?.id;

    // ---- link contact ----
    console.log("\nProject contacts:");
    const l1 = await j(await fetch(`${BASE}/api/projects/${projId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctA1.body.id, roleLabel: "Site Super" }) }));
    check("link contact 201 with role", l1.status === 201 && l1.body?.roleLabel === "Site Super" && l1.body?.contact?.firstName === "Pat", l1);

    const l2 = await j(await fetch(`${BASE}/api/projects/${projId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctA2.body.id }) }));
    check("link 2nd contact no role", l2.status === 201 && (l2.body?.roleLabel ?? null) === null, l2.status);

    // duplicate
    const dup = await j(await fetch(`${BASE}/api/projects/${projId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctA1.body.id }) }));
    check("duplicate link 409", dup.status === 409, dup);

    // wrong customer's contact
    const wrong = await j(await fetch(`${BASE}/api/projects/${projId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctB1.body.id }) }));
    check("cross-customer contact rejected 400", wrong.status === 400, wrong);

    // project without customer
    const noCust = await j(await fetch(`${BASE}/api/projects/${projNoCustId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: ctA1.body.id }) }));
    check("project without customer rejected 400", noCust.status === 400, noCust);

    // nonexistent contact
    const missing = await j(await fetch(`${BASE}/api/projects/${projId}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ contactId: 99999999 }) }));
    check("missing contact 404", missing.status === 404, missing);

    // list
    const list = await j(await fetch(`${BASE}/api/projects/${projId}/contacts`, { headers: H }));
    check("list returns 2 with contact detail", list.status === 200 && list.body?.length === 2 && list.body.every((r: any) => r.contact?.id), list.body);

    // patch role
    const patch = await j(await fetch(`${BASE}/api/project-contacts/${l2.body.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ roleLabel: "Billing (AP)" }) }));
    check("patch role label", patch.status === 200 && patch.body?.roleLabel === "Billing (AP)", patch);

    // patch with omitted roleLabel is a no-op
    const noop = await j(await fetch(`${BASE}/api/project-contacts/${l2.body.id}`, { method: "PATCH", headers: H, body: JSON.stringify({}) }));
    check("patch omitted roleLabel is no-op", noop.status === 200 && noop.body?.roleLabel === "Billing (AP)", noop);

    // patch explicit null clears
    const clear = await j(await fetch(`${BASE}/api/project-contacts/${l2.body.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ roleLabel: null }) }));
    check("patch null clears role", clear.status === 200 && clear.body?.roleLabel === null, clear);

    // deleting a project-linked contact is blocked
    const delLinked = await j(await fetch(`${BASE}/api/contacts/${ctA2.body.id}`, { method: "DELETE", headers: H }));
    check("delete linked contact 409", delLinked.status === 409, delLinked);

    // unlink
    const del = await fetch(`${BASE}/api/project-contacts/${l1.body.id}`, { method: "DELETE", headers: H });
    check("unlink 204", del.status === 204, del.status);
    const list2 = await j(await fetch(`${BASE}/api/projects/${projId}/contacts`, { headers: H }));
    check("list after unlink has 1", list2.body?.length === 1);

    // after unlinking, the contact can be deleted normally
    const delUnlinked = await j(await fetch(`${BASE}/api/contacts/${ctA1.body.id}`, { method: "DELETE", headers: H }));
    check("delete unlinked contact 204", delUnlinked.status === 204, delUnlinked);

    // delete missing link
    const delMissing = await fetch(`${BASE}/api/project-contacts/99999999`, { method: "DELETE", headers: H });
    check("delete missing link 404", delMissing.status === 404, delMissing.status);

    // unauthenticated
    const unauth = await fetch(`${BASE}/api/projects/${projId}/contacts`);
    check("unauthenticated 401", unauth.status === 401, unauth.status);
  } finally {
    // cleanup (hard delete straight in DB to remove all traces incl. activity logs / project rows)
    if (projId) await db.execute(sql`DELETE FROM project_contacts WHERE project_id = ${projId}`);
    for (const pid of [projId, projNoCustId]) if (pid) await db.execute(sql`DELETE FROM projects WHERE id = ${pid}`);
    for (const cid of [custAId, custBId]) if (cid) {
      await db.execute(sql`DELETE FROM contacts WHERE customer_id = ${cid}`);
      await db.execute(sql`DELETE FROM customers WHERE id = ${cid}`);
    }
    await db.execute(sql`DELETE FROM activity_logs WHERE description LIKE '%__PC Test%'`);
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid}`);
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
