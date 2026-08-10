/**
 * One-off authenticated HTTP verification for Task 9 (Customer Company & Contacts).
 * Forges a session like scripts/test-http-api.ts. Self-cleaning.
 * Run: npx tsx scripts/test-customers-api.ts
 */
import crypto from "node:crypto";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { backfillCustomerContacts, createContactsForNoCompanyCustomers, removeFabricatedNoCompanyContacts, runDataMigrations } from "../server/dataMigrations";

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

  let custId: number | null = null;
  let cust2Id: number | null = null;
  let cust3Id: number | null = null;
  let projId: number | null = null;

  try {
    // ---- create customer (company) ----
    console.log("Customer create + duplicate check:");
    const c1 = await j(await fetch(`${BASE}/api/customers`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "__HTTP Test Construction LLC", customerType: "general_contractor", phone: "555-000-1111", email: "info@httptest.local", website: "www.httptest.local", address: "1 Test Way", city: "Testville", state: "NJ", zip: "08701" }),
    }));
    check("create customer 201", c1.status === 201 && c1.body?.id > 0 && c1.body?.status === "active", c1);
    custId = c1.body?.id;

    const dup = await j(await fetch(`${BASE}/api/customers/duplicate-check?name=${encodeURIComponent("HTTP Test Construction")}`, { headers: H }));
    check("duplicate-check finds similar name", dup.status === 200 && dup.body?.some((d: any) => d.id === custId), dup.body);

    // ---- contacts CRUD + primary swap ----
    console.log("\nContacts:");
    const ct1 = await j(await fetch(`${BASE}/api/customers/${custId}/contacts`, {
      method: "POST", headers: H,
      body: JSON.stringify({ firstName: "Alice", lastName: "Alpha", jobTitle: "Estimator", roles: ["estimating", "purchasing"], email: "alice@httptest.local", officePhone: "555-1", extension: "12", isPrimary: true, isActive: true }),
    }));
    check("create contact (primary)", ct1.status === 201 && ct1.body?.isPrimary === true && ct1.body?.roles?.length === 2, ct1);

    const ct2 = await j(await fetch(`${BASE}/api/customers/${custId}/contacts`, {
      method: "POST", headers: H,
      body: JSON.stringify({ firstName: "Bob", lastName: "Beta", email: "bob@httptest.local", isPrimary: true, isActive: true }),
    }));
    check("create 2nd primary contact", ct2.status === 201 && ct2.body?.isPrimary === true, ct2.status);

    let list = await j(await fetch(`${BASE}/api/customers/${custId}/contacts`, { headers: H }));
    const alice = list.body?.find((c: any) => c.id === ct1.body.id);
    const bob = list.body?.find((c: any) => c.id === ct2.body.id);
    check("old primary auto-demoted", alice?.isPrimary === false && bob?.isPrimary === true, list.body?.map((c: any) => [c.firstName, c.isPrimary]));
    check("only one primary", list.body?.filter((c: any) => c.isPrimary).length === 1);

    // swap primary back via PUT
    const swap = await j(await fetch(`${BASE}/api/contacts/${ct1.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ isPrimary: true }) }));
    check("PUT primary swap", swap.status === 200 && swap.body?.isPrimary === true, swap.status);
    list = await j(await fetch(`${BASE}/api/customers/${custId}/contacts`, { headers: H }));
    check("swap demotes other", list.body?.find((c: any) => c.id === ct2.body.id)?.isPrimary === false);

    // duplicate email check
    const dupEmail = await j(await fetch(`${BASE}/api/customers/${custId}/contacts/duplicate-check?email=ALICE@httptest.local`, { headers: H }));
    check("contact duplicate-email check (case-insensitive)", dupEmail.status === 200 && dupEmail.body?.some((c: any) => c.id === ct1.body.id), dupEmail.body);

    // missing-customer guards
    const missList = await fetch(`${BASE}/api/customers/999999999/contacts`, { headers: H });
    check("contacts list for missing customer -> 404", missList.status === 404, missList.status);
    const missDup = await fetch(`${BASE}/api/customers/999999999/contacts/duplicate-check?email=a@b.c`, { headers: H });
    check("duplicate-check for missing customer -> 404", missDup.status === 404, missDup.status);

    // edit persists
    const edit = await j(await fetch(`${BASE}/api/contacts/${ct2.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ jobTitle: "PM", mobilePhone: "555-2" }) }));
    check("edit contact persists", edit.status === 200 && edit.body?.jobTitle === "PM" && edit.body?.mobilePhone === "555-2", edit.body);

    // deactivate / reactivate
    const deact = await j(await fetch(`${BASE}/api/contacts/${ct2.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ isActive: false }) }));
    check("deactivate contact", deact.status === 200 && deact.body?.isActive === false, deact.status);
    const react = await j(await fetch(`${BASE}/api/contacts/${ct2.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ isActive: true }) }));
    check("reactivate contact", react.status === 200 && react.body?.isActive === true, react.status);

    // deactivating the current primary must clear isPrimary server-side
    const rePrim = await j(await fetch(`${BASE}/api/contacts/${ct2.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ isPrimary: true }) }));
    check("promote ct2 to primary", rePrim.status === 200 && rePrim.body?.isPrimary === true, rePrim.body);
    const deactPrim = await j(await fetch(`${BASE}/api/contacts/${ct2.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ isActive: false }) }));
    check("deactivating primary clears isPrimary", deactPrim.status === 200 && deactPrim.body?.isActive === false && deactPrim.body?.isPrimary === false, deactPrim.body);
    const reactAgain = await j(await fetch(`${BASE}/api/contacts/${ct2.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ isActive: true }) }));
    check("reactivate ct2 (non-primary)", reactAgain.status === 200 && reactAgain.body?.isActive === true && reactAgain.body?.isPrimary === false, reactAgain.body);
    const restorePrim = await j(await fetch(`${BASE}/api/contacts/${ct1.body.id}`, { method: "PUT", headers: H, body: JSON.stringify({ isPrimary: true }) }));
    check("restore ct1 as primary", restorePrim.status === 200 && restorePrim.body?.isPrimary === true, restorePrim.body);

    // ---- search ----
    console.log("\nSearch:");
    const s1 = await j(await fetch(`${BASE}/api/customers?status=all&search=${encodeURIComponent("Alice Alpha")}`, { headers: H }));
    const hit = s1.body?.find((c: any) => c.id === custId);
    check("search by contact name finds company", !!hit, s1.body?.map((c: any) => c.name));
    check("match reason mentions contact", hit?.matchReason?.includes("Alice"), hit?.matchReason);
    check("list includes primaryContact", hit?.primaryContact?.firstName === "Alice", hit?.primaryContact);

    const s2 = await j(await fetch(`${BASE}/api/customers?status=all&search=555-000-1111`, { headers: H }));
    check("search by company phone", s2.body?.some((c: any) => c.id === custId), s2.body?.length);

    // ---- communications with contact/project links ----
    console.log("\nCommunications:");
    const proj = await j(await fetch(`${BASE}/api/projects`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "__HTTP_CUST_TEST_PROJECT__", customerId: custId, streetAddress: "1 Test Way", city: "Testville", state: "NJ", status: "new" }),
    }));
    projId = proj.body?.id ?? null;
    check("temp project created", !!projId, proj.status);

    const custProjects = await j(await fetch(`${BASE}/api/customers/${custId}/projects`, { headers: H }));
    check("customer projects endpoint lists the project", custProjects.status === 200 && custProjects.body?.some((p: any) => p.id === projId), custProjects);
    const custProjects404 = await fetch(`${BASE}/api/customers/999999999/projects`, { headers: H });
    check("customer projects for missing customer -> 404", custProjects404.status === 404, custProjects404.status);

    const comm = await j(await fetch(`${BASE}/api/customers/${custId}/communications`, {
      method: "POST", headers: H,
      body: JSON.stringify({ type: "phone", subject: "Test call", notes: "n", contactDate: new Date().toISOString(), contactId: ct1.body.id, projectId: projId }),
    }));
    check("log communication with contact+project", comm.status === 201 && comm.body?.contactId === ct1.body.id && comm.body?.projectId === projId, comm);

    // wrong-customer contact rejected
    const c2 = await j(await fetch(`${BASE}/api/customers`, { method: "POST", headers: H, body: JSON.stringify({ name: "__HTTP Other Co" }) }));
    cust2Id = c2.body?.id;
    const badComm = await j(await fetch(`${BASE}/api/customers/${cust2Id}/communications`, {
      method: "POST", headers: H,
      body: JSON.stringify({ type: "phone", contactDate: new Date().toISOString(), contactId: ct1.body.id }),
    }));
    check("contact from other customer -> 400", badComm.status === 400, badComm.status);

    // contact with history cannot be hard-deleted
    const delGuard = await j(await fetch(`${BASE}/api/contacts/${ct1.body.id}`, { method: "DELETE", headers: H }));
    check("delete contact w/ communications -> 409", delGuard.status === 409 && delGuard.body?.message?.includes("Deactivate"), delGuard);
    // contact without history can
    const delOk = await fetch(`${BASE}/api/contacts/${ct2.body.id}`, { method: "DELETE", headers: H });
    check("delete contact w/o history -> 204", delOk.status === 204, delOk.status);

    // ---- archive + delete guards ----
    console.log("\nArchive & delete:");
    const arch = await j(await fetch(`${BASE}/api/customers/${custId}/archive`, { method: "POST", headers: H }));
    check("archive customer", arch.status === 200 && arch.body?.status === "archived", arch.status);

    const defaultList = await j(await fetch(`${BASE}/api/customers?status=active`, { headers: H }));
    check("archived hidden from active list", !defaultList.body?.some((c: any) => c.id === custId));
    const archivedList = await j(await fetch(`${BASE}/api/customers?status=archived`, { headers: H }));
    check("archived visible in archived filter", archivedList.body?.some((c: any) => c.id === custId));

    const delBlocked = await j(await fetch(`${BASE}/api/customers/${custId}`, { method: "DELETE", headers: H }));
    check("delete customer w/ deps -> 409 with counts", delBlocked.status === 409 && /1 Project/.test(delBlocked.body?.message || "") && /1 Communication/.test(delBlocked.body?.message || "") && /Archive/.test(delBlocked.body?.message || ""), delBlocked.body);

    // ---- activity ----
    console.log("\nActivity:");
    const act = await j(await fetch(`${BASE}/api/customers/${custId}/activity`, { headers: H }));
    const actions = (act.body || []).map((a: any) => a.action);
    check("activity includes customer_created", actions.includes("customer_created"), actions);
    check("activity includes contact_added", actions.includes("contact_added"));
    check("activity includes primary_contact_changed", actions.includes("primary_contact_changed"));
    check("activity includes contact_deactivated + reactivated", actions.includes("contact_deactivated") && actions.includes("contact_reactivated"));
    check("activity includes communication_logged", actions.includes("communication_logged"));
    check("activity includes customer_archived", actions.includes("customer_archived"));

    // clean delete path: second customer has no deps
    // (storage delete is a soft delete, so cust2Id is still purged in cleanup)
    const orphanCt = await j(await fetch(`${BASE}/api/customers/${cust2Id}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ firstName: "Orphan", isPrimary: false, isActive: true }) }));
    check("add contact to deletable customer", orphanCt.status === 201, orphanCt.status);
    const del2 = await fetch(`${BASE}/api/customers/${cust2Id}`, { method: "DELETE", headers: H });
    check("delete customer w/o deps -> 204", del2.status === 204, del2.status);
    const orphanLeft = await db.execute(sql`SELECT count(*)::int AS n FROM contacts WHERE customer_id = ${cust2Id}`);
    check("customer delete leaves no orphan contacts", (orphanLeft.rows[0] as any).n === 0, orphanLeft.rows[0]);

    // soft-deleted communications still count as history for hard-delete guards
    const c3 = await j(await fetch(`${BASE}/api/customers`, { method: "POST", headers: H, body: JSON.stringify({ name: "__HTTP SoftDel Co" }) }));
    cust3Id = c3.body?.id;
    const ct4 = await j(await fetch(`${BASE}/api/customers/${cust3Id}/contacts`, { method: "POST", headers: H, body: JSON.stringify({ firstName: "Hist", isPrimary: true, isActive: true }) }));
    const comm3 = await j(await fetch(`${BASE}/api/customers/${cust3Id}/communications`, {
      method: "POST", headers: H,
      body: JSON.stringify({ type: "phone", subject: "history", notes: "n", contactDate: new Date().toISOString(), contactId: ct4.body?.id }),
    }));
    check("log communication for soft-delete scenario", comm3.status === 201, { ct4: ct4.status, comm3: comm3.status, msg: comm3.body?.message });
    const softDel = await fetch(`${BASE}/api/communications/${comm3.body?.id}`, { method: "DELETE", headers: H });
    check("soft-delete communication", softDel.status === 204 || softDel.status === 200, softDel.status);
    const delCtHist = await fetch(`${BASE}/api/contacts/${ct4.body?.id}`, { method: "DELETE", headers: H });
    check("contact with soft-deleted communication -> 409", delCtHist.status === 409, delCtHist.status);
    const delC3 = await fetch(`${BASE}/api/customers/${cust3Id}`, { method: "DELETE", headers: H });
    check("customer with soft-deleted communication -> 409", delC3.status === 409, delC3.status);

    // migration integrity spot-check
    console.log("\nMigration integrity:");
    const mig = await db.execute(sql`
      SELECT (SELECT count(*)::int FROM customers cu
              WHERE cu.id < ${custId!} AND cu.deleted_at IS NULL) AS custs,
             (SELECT count(*)::int FROM contacts ct JOIN customers cu ON cu.id = ct.customer_id
              WHERE ct.is_primary AND cu.deleted_at IS NULL AND cu.id < ${custId!}) AS primaries,
             (SELECT count(*)::int FROM (SELECT customer_id FROM contacts WHERE is_primary GROUP BY customer_id HAVING count(*) > 1) d) AS dup_primaries,
             (SELECT count(*)::int FROM projects WHERE deleted_at IS NULL AND customer_id IS NOT NULL AND id <> ${projId!}) AS linked_projects`);
    const m = mig.rows[0] as any;
    check("every migrated customer has a primary contact (incl. flagged no-company rows)", m.custs === m.primaries, m);
    check("no customer has more than one primary", m.dup_primaries === 0, m);

    // ---- backfill logic against representative legacy rows (scoped) ----
    console.log("\nBackfill (representative legacy rows):");
    const legacy = await db.execute(sql`
      INSERT INTO customers (name, company, email, phone)
      VALUES ('John Smith', '__BF Person+Co LLC', 'john@bf.local', '555-9'),
             ('__BF CompanyOnly Inc', '__BF CompanyOnly Inc', 'info@bfco.local', NULL),
             ('Jane Doe', NULL, 'jane@bf.local', '555-8')
      RETURNING id, name`);
    const bfIds = legacy.rows.map((r: any) => r.id as number);
    try {
      await backfillCustomerContacts(db, bfIds);

      const bfCust = await db.execute(sql`SELECT id, name, name_needs_review FROM customers WHERE id IN (${sql.raw(bfIds.join(","))}) ORDER BY id`);
      const bfContacts = await db.execute(sql`SELECT customer_id, first_name, last_name, email, is_primary FROM contacts WHERE customer_id IN (${sql.raw(bfIds.join(","))})`);
      const [a, b, c] = bfCust.rows as any[];
      const contactsFor = (id: number) => (bfContacts.rows as any[]).filter((r) => r.customer_id === id);

      check("person+company: name promoted to company", a.name === "__BF Person+Co LLC" && !a.name_needs_review, a);
      check("person+company: primary contact = person", contactsFor(a.id).length === 1 && contactsFor(a.id)[0].first_name === "John" && contactsFor(a.id)[0].last_name === "Smith" && contactsFor(a.id)[0].is_primary, contactsFor(a.id));
      check("company-only: NO invented contact", contactsFor(b.id).length === 0, contactsFor(b.id));
      check("company-only: name kept, not flagged", b.name === "__BF CompanyOnly Inc" && !b.name_needs_review, b);
      check("no-company (ambiguous): NO invented contact, flagged for review", c.name === "Jane Doe" && c.name_needs_review === true && contactsFor(c.id).length === 0, { c, contacts: contactsFor(c.id) });

      // idempotent re-run: no duplicates, no new contacts
      await backfillCustomerContacts(db, bfIds);
      const bfContacts2 = await db.execute(sql`SELECT count(*)::int AS n FROM contacts WHERE customer_id IN (${sql.raw(bfIds.join(","))})`);
      check("backfill re-run is a no-op", (bfContacts2.rows[0] as any).n === 1, bfContacts2.rows[0]);

      // corrective migration: removes only untouched contacts fabricated by the old
      // faulty rule (no-company rows), never user-created/edited contacts
      await db.execute(sql`
        INSERT INTO contacts (customer_id, first_name, last_name, email, office_phone, is_primary, is_active, roles)
        VALUES (${c.id}, 'Jane', 'Doe', 'jane@bf.local', '555-8', true, true, '{}'::text[]),
               (${c.id}, 'Real', 'Person', 'real@bf.local', NULL, false, true, '{}'::text[])`);
      await removeFabricatedNoCompanyContacts(db, bfIds);
      const afterFix = await db.execute(sql`SELECT first_name FROM contacts WHERE customer_id = ${c.id}`);
      const names = (afterFix.rows as any[]).map((r) => r.first_name);
      check("corrective migration removes fabricated contact", !names.includes("Jane"), names);
      check("corrective migration keeps user-created contact", names.includes("Real"), names);

      // literal-spec restore (user-accepted product decision): flagged
      // no-company rows with NO contacts get a primary contact from the
      // legacy person name; rows that already have any contact are untouched.
      await createContactsForNoCompanyCustomers(db, bfIds);
      const afterRestore = await db.execute(sql`SELECT first_name, last_name, email, is_primary FROM contacts WHERE customer_id = ${c.id}`);
      const restoreNames = (afterRestore.rows as any[]).map((r) => r.first_name);
      check("no-company restore skips customers that already have contacts", !restoreNames.includes("Jane") && restoreNames.includes("Real"), afterRestore.rows);
      await db.execute(sql`DELETE FROM contacts WHERE customer_id = ${c.id}`);
      await createContactsForNoCompanyCustomers(db, bfIds);
      const restored = await db.execute(sql`SELECT first_name, last_name, email, is_primary FROM contacts WHERE customer_id = ${c.id}`);
      const rj = restored.rows[0] as any;
      check("no-company restore creates primary contact from person name", restored.rows.length === 1 && rj.first_name === "Jane" && rj.last_name === "Doe" && rj.email === "jane@bf.local" && rj.is_primary === true, restored.rows);
      const flaggedStill = await db.execute(sql`SELECT name_needs_review FROM customers WHERE id = ${c.id}`);
      check("no-company row stays flagged for review after restore", (flaggedStill.rows[0] as any).name_needs_review === true, flaggedStill.rows[0]);
      await createContactsForNoCompanyCustomers(db, bfIds);
      const restored2 = await db.execute(sql`SELECT count(*)::int AS n FROM contacts WHERE customer_id = ${c.id}`);
      check("no-company restore re-run is a no-op", (restored2.rows[0] as any).n === 1, restored2.rows[0]);

      // concurrent runner execution: advisory lock + tracked keys must keep
      // applied migrations from ever running twice
      const before = await db.execute(sql`SELECT count(*)::int AS n FROM contacts`);
      await Promise.all([runDataMigrations(), runDataMigrations()]);
      const keys = await db.execute(sql`SELECT key, count(*)::int AS n FROM data_migrations GROUP BY key HAVING count(*) > 1`);
      const after = await db.execute(sql`SELECT count(*)::int AS n FROM contacts`);
      check("concurrent migration runs: no duplicate keys", keys.rows.length === 0, keys.rows);
      check("concurrent migration runs: no new contacts", (after.rows[0] as any).n === (before.rows[0] as any).n, { before: before.rows[0], after: after.rows[0] });

      // failure injection: a migration that writes then throws must leave
      // neither its writes nor its tracking key behind
      const failKey = "__test-failure-injection";
      let failErr: unknown = null;
      await runDataMigrations([
        {
          key: failKey,
          run: async (mtx) => {
            await mtx.execute(sql`UPDATE customers SET notes = '__FAIL_INJECT' WHERE id = ${a.id}`);
            throw new Error("injected failure");
          },
        },
      ]).catch((e) => { failErr = e; });
      const failRow = await db.execute(sql`SELECT notes FROM customers WHERE id = ${a.id}`);
      const failKeyRow = await db.execute(sql`SELECT 1 FROM data_migrations WHERE key = ${failKey}`);
      check("failed migration surfaces its error", failErr instanceof Error, String(failErr));
      check("failed migration rolls back its writes", (failRow.rows[0] as any).notes !== "__FAIL_INJECT", failRow.rows[0]);
      check("failed migration records no tracking key (retryable)", failKeyRow.rows.length === 0, failKeyRow.rows);
    } finally {
      await db.execute(sql`DELETE FROM contacts WHERE customer_id IN (${sql.raw(bfIds.join(","))})`);
      await db.execute(sql`DELETE FROM customers WHERE id IN (${sql.raw(bfIds.join(","))})`);
    }
    check("pre-existing project links intact (>0)", m.linked_projects > 0, m);
  } finally {
    console.log("\nCleanup...");
    if (projId) {
      await db.execute(sql`DELETE FROM communications WHERE project_id = ${projId}`);
      await db.execute(sql`DELETE FROM activity_logs WHERE project_id = ${projId}`);
      await db.execute(sql`DELETE FROM project_status_history WHERE project_id = ${projId}`);
      await db.execute(sql`DELETE FROM files WHERE project_id = ${projId}`);
      await db.execute(sql`DELETE FROM folders WHERE project_id = ${projId}`);
      await db.execute(sql`DELETE FROM projects WHERE id = ${projId}`);
    }
    for (const cid of [custId, cust2Id, cust3Id]) {
      if (!cid) continue;
      await db.execute(sql`DELETE FROM communications WHERE customer_id = ${cid}`);
      await db.execute(sql`DELETE FROM contacts WHERE customer_id = ${cid}`);
      await db.execute(sql`DELETE FROM activity_logs WHERE (metadata->>'customerId')::int = ${cid} OR (entity_type = 'customer' AND entity_id = ${cid})`);
      await db.execute(sql`DELETE FROM customers WHERE id = ${cid}`);
    }
    await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid}`);
    console.log("Cleanup done.");
  }

  console.log(failures === 0 ? "\nALL HTTP TESTS PASSED" : `\n${failures} HTTP TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error("Script error:", err); process.exit(1); });
