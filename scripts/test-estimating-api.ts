/**
 * Self-cleaning development HTTP tests for estimates, role boundaries and
 * optimistic revisions. Run against the app with npx tsx scripts/test-estimating-api.ts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { customers, opportunities, estimateRevisions, estimatingCompanyRates, estimatingRateHistory } from "../shared/schema";
import { lockEstimateRevision } from "../server/services/estimating";
import { emptyJob, newCategory, newLine } from "../shared/estimating/model";

const BASE = process.env.TEST_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
if (!new URL(BASE).hostname.endsWith(".replit.dev") && !["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Development database tests only");
const tag = `__estimate-test-${crypto.randomBytes(8).toString("hex")}`;
const ids: string[] = [], sessions: string[] = [], oppIds: number[] = [];
let customerId: number | undefined;
async function actor(role: string, approved = true) {
  const id = `${tag}-${role}-${approved}`; ids.push(id);
  await db.execute(sql`INSERT INTO users (id,email,role,is_authorized) VALUES (${id},${`${id}@test.local`},${role},${approved ? "approved" : "pending"})`);
  const sid = crypto.randomBytes(24).toString("hex"); sessions.push(sid);
  const sess = { cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: "/" },
    passport: { user: { claims: { sub: id }, expires_at: Math.floor(Date.now() / 1000) + 3600, access_token: "test", refresh_token: "test" } } };
  await db.execute(sql`INSERT INTO sessions(sid,sess,expire) VALUES(${sid},${JSON.stringify(sess)}::jsonb,NOW()+interval '1 hour')`);
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
  return { id, Cookie: `connect.sid=${encodeURIComponent(`s:${sid}.${sig}`)}` };
}
async function main() {
  let originalCompany: typeof estimatingCompanyRates.$inferSelect | undefined;
  let companyChanged = false, lastCompanyWriter = "";
  try {
    const admin = await actor("admin"), manager = await actor("manager"), estimator = await actor("estimator"), user = await actor("user"), pending = await actor("estimator", false);
    const request = async (who: { Cookie: string } | null, path: string, method = "GET", body?: unknown) => {
      const res = await fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", ...(who ? { Cookie: who.Cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
    const [cust] = await db.insert(customers).values({ name: tag }).returning(); customerId = cust.id;
    for (let i = 0; i < 2; i++) {
      const [o] = await db.insert(opportunities).values({ opportunityNumber: `${tag}-${i}`, name: tag, customerId, streetAddress: "1 Test Street", city: "Test", state: "NJ", zip: "00000" }).returning();
      oppIds.push(o.id);
    }
    const root = `/api/opportunities/${oppIds[0]}/estimates`;
    for (const who of [admin, manager, estimator]) {
      assert.equal((await request(who, "/api/estimating-rates")).status, 200);
      assert.equal((await request(who, root)).status, 200);
      assert.equal((await request(who, "/api/takeoff-playbook")).status, 200);
      assert.equal((await request(who, `/api/opportunities/${oppIds[0]}/takeoff/runs`)).status, 200);
    }
    assert.equal((await request(admin, "/api/admin/estimating-ai")).status, 200);
    assert.equal((await request(estimator, "/api/admin/estimating-ai")).status, 403);
    assert.equal((await request(manager, "/api/admin/estimating-ai", "PUT", {})).status, 403);
    for (const who of [user, pending, null]) {
      const status = who ? 403 : 401;
      for (const [path, method, body] of [
        ["/api/estimating-rates", "GET", undefined], ["/api/estimating-rates", "PUT", {}],
        ["/api/estimating-rates/preview", "POST", {}], ["/api/estimating-rates/apply", "POST", {}],
        ["/api/estimating-rates/history", "GET", undefined], ["/api/estimating-rates/history/1", "GET", undefined],
        [root, "GET", undefined], [root, "POST", { start: true }],
        [`${root}/1`, "GET", undefined], [`${root}/1`, "PUT", {}],
        ["/api/takeoff-playbook", "GET", undefined], ["/api/takeoff-playbook", "POST", {}],
        ["/api/admin/estimating-ai", "GET", undefined],
        [`/api/opportunities/${oppIds[0]}/takeoff/runs`, "POST", {}],
        [`/api/opportunities/${oppIds[0]}/takeoff/documents`, "GET", undefined],
      ] as const) assert.equal((await request(who, path, method, body)).status, status);
    }
    console.log("PASS all estimate/rate endpoints deny regular, pending and anonymous users");
    [originalCompany] = await db.select().from(estimatingCompanyRates).where(eq(estimatingCompanyRates.id, 1));
    let company = (await request(admin, "/api/estimating-rates")).body;
    for (const who of [admin, manager, estimator]) {
      company = (await request(who, "/api/estimating-rates", "PUT", { rates: company.rates, version: company.version })).body;
      assert.ok(company.version);
      companyChanged = true; lastCompanyWriter = who.id;
    }
    assert.equal((await request(admin, "/api/estimating-rates", "PUT", { rates: company.rates, version: 0 })).status, 409);
    let start = await request(estimator, root, "POST", { start: true });
    assert.equal(start.status, 201); assert.equal(start.body.revisionNumber, 0);
    assert.deepEqual(start.body.job.laborRates, company.rates.laborRates);
    assert.equal((await request(manager, root, "POST", { start: true })).status, 409);
    const modified = structuredClone(company.rates); modified.defaults.profit = "99";
    const ratesUpdate = await request(estimator, "/api/estimating-rates", "PUT", { rates: modified, version: company.version });
    assert.equal(ratesUpdate.status, 200);
    const history = await request(estimator, "/api/estimating-rates/history");
    assert.equal(history.status, 200);
    assert.equal(history.body[0].version, ratesUpdate.body.version);
    assert.equal(history.body[0].savedBy, estimator.id);
    const detail = await request(manager, `/api/estimating-rates/history/${history.body[0].id}`);
    assert.deepEqual(detail.body.rates, ratesUpdate.body.rates);
    const input = { source: "estimate", rates: company.rates, replaceDefaultMarkups: false };
    const preview = await request(estimator, "/api/estimating-rates/preview", "POST", input);
    assert.equal(preview.status, 200);
    // Even an empty company table can preview its markups explicitly.
    const confirmInput = { ...input, replaceDefaultMarkups: true };
    const ready = (await request(estimator, "/api/estimating-rates/preview", "POST", confirmInput)).body;
    assert.deepEqual(ready.errors, []); assert.ok(ready.token);
    const unchangedBeforeConfirm = (await request(estimator, "/api/estimating-rates")).body;
    assert.equal(unchangedBeforeConfirm.version, ratesUpdate.body.version);
    assert.equal((await request(manager, "/api/estimating-rates/apply", "POST", { token: ready.token })).status, 403);
    assert.equal((await request(estimator, "/api/estimating-rates/apply", "POST", { token: `${ready.token}x` })).status, 400);
    const applied = await request(estimator, "/api/estimating-rates/apply", "POST", { token: ready.token });
    assert.equal(applied.status, 200);
    assert.deepEqual(applied.body.rates.defaults, company.rates.defaults);
    assert.equal((await request(estimator, "/api/estimating-rates/apply", "POST", { token: ready.token })).status, 409);
    const csv = "Category,Key,Description,Unit,Price,Source / notes\nStone,test_rate_for_import,Test,TON,,No quote\n";
    const spreadsheet = (await request(admin, "/api/estimating-rates/preview", "POST", {
      source: "spreadsheet", files: [{ name: "materials.csv", tab: "Materials", data: Buffer.from(csv).toString("base64") }],
    })).body;
    assert.deepEqual(spreadsheet.errors, []);
    assert.ok(spreadsheet.warnings.some((s: string) => s.includes("no price")));
    const importResult = await request(admin, "/api/estimating-rates/apply", "POST", { token: spreadsheet.token });
    assert.equal(importResult.status, 200); lastCompanyWriter = admin.id;
    assert.ok(importResult.body.rates.rates.some((r: any) => r.key === "test_rate_for_import" && r.value === "" && r.category === "Stone"));
    const stale = await request(estimator, "/api/estimating-rates/apply", "POST", { token: ready.token });
    assert.equal(stale.status, 409);
    console.log("PASS rate preview cancellation, confirmation, history, owner binding, stale and tampered previews");
    const snapshot = (await request(admin, `${root}/${start.body.id}`)).body;
    assert.deepEqual(snapshot.job.defaults, company.rates.defaults);
    console.log("PASS company rates writable by three roles, conflicts detected, old snapshots preserved");
    const file = JSON.parse(fs.readFileSync("attached_assets/1_Eyes_on_9_—_Site_Work_-_takeoff_file_1794871558100.json", "utf8"));
    const imported = await request(estimator, root, "POST", { importFile: file });
    assert.equal(imported.status, 201);
    assert.equal(imported.body.name, "Imported from takeoff form");
    assert.equal(imported.body.revisionNumber, 1);
    assert.equal(imported.body.summary.sell.toFixed(2), "765591.76");
    assert.equal(Object.keys(imported.body.summary.warnings).length, 15);
    let opportunity = (await request(estimator, `/api/opportunities/${oppIds[0]}`)).body;
    assert.equal(opportunity.expectedValue, 765592); assert.equal(opportunity.expectedValueEstimateRevision, 1);
    assert.equal((await request(user, `/api/opportunities/${oppIds[0]}`)).body.expectedValue, null);
    assert.equal((await request(manager, `/api/opportunities/${oppIds[0]}`)).body.expectedValue, 765592);
    assert.equal((await request(admin, `/api/opportunities/${oppIds[1]}/estimates/${imported.body.id}`)).status, 404);
    assert.equal((await request(admin, `/api/opportunities/${oppIds[1]}/estimates/${imported.body.id}`, "PUT", { version: 1, job: imported.body.job })).status, 404);
    console.log("PASS full-size JSON import, exact parity, whole-dollar value, cross-opportunity isolation");
    const simple = emptyJob(), category = newCategory(), line = newLine();
    line.qty = "2"; line.priceOverride = "10.255"; category.items = [line]; simple.categories = [category];
    const oldSave = await request(admin, `${root}/${start.body.id}`, "PUT", { version: start.body.version, job: simple, summary: { sell: 1 } });
    assert.equal(oldSave.status, 200); assert.equal(oldSave.body.summary.sell, 20.51);
    opportunity = (await request(admin, `/api/opportunities/${oppIds[0]}`)).body;
    assert.equal(opportunity.expectedValue, 765592);
    const conflict = await request(manager, `${root}/${start.body.id}`, "PUT", { version: start.body.version, job: simple });
    assert.equal(conflict.status, 409); assert.equal(conflict.body.current.version, 2);
    const copies = await Promise.all([admin, manager].map(who => request(who, root, "POST", { job: simple, name: "Concurrent copy" })));
    assert.ok(copies.every(r => r.status === 201));
    assert.deepEqual(copies.map(r => r.body.revisionNumber).sort(), [2, 3]);
    const latest = copies.find(r => r.body.revisionNumber === 3)!.body;
    const duplicateSave = await Promise.all([admin, estimator].map(who => request(who, `${root}/${latest.id}`, "PUT", { version: latest.version, job: simple })));
    assert.deepEqual(duplicateSave.map(r => r.status).sort(), [200, 409]);
    const current = duplicateSave.find(r => r.status === 200)!.body;
    await db.transaction(tx => lockEstimateRevision(tx, oppIds[0], current.id, current.version, "Test future proposal snapshot"));
    assert.equal((await request(admin, `${root}/${current.id}`, "PUT", { version: current.version, job: simple })).status, 423);
    assert.equal((await request(admin, root, "POST", { job: simple, name: "Copy of locked revision" })).status, 201);
    const locked = (await request(admin, `${root}/${current.id}`)).body;
    assert.deepEqual(locked.job, current.job); assert.equal(locked.locked, true);
    console.log("PASS optimistic conflicts, concurrent numbering, immutable locked revision and save-as");
    const invalid = structuredClone(simple); invalid.categories[0].items[0].qty = "1/0";
    const draft = await request(admin, root, "POST", { job: invalid });
    assert.equal(draft.status, 201);
    assert.equal(draft.body.job.categories[0].items[0].qty, "1/0");
    assert.ok(Number.isFinite(draft.body.summary.sell));
    assert.equal((await request(admin, `${root}/${draft.body.id}`, "PUT", { job: invalid, version: draft.body.version })).status, 200);
    const overflow = structuredClone(simple);
    overflow.categories[0].items[0].qty = "10^200";
    overflow.categories[0].items[0].priceOverride = "10^200";
    assert.equal((await request(admin, root, "POST", { job: overflow })).status, 422);
    assert.equal((await request(admin, root, "POST", { importFile: { format: "nuchem-takeoff", formatVersion: 2, job: {} } })).status, 400);
    assert.equal((await request(admin, root, "POST", { importFile: { format: "nuchem-takeoff", formatVersion: 1, job: { categories: {} } } })).status, 400);
    const list = (await request(admin, root)).body;
    assert.ok(list.every((r: any) => r.job === undefined));
    assert.equal(list[0].revisionNumber, 5);
    console.log("PASS validation, lightweight revision list, server-authoritative totals; ALL ESTIMATING API TESTS PASSED");
  } finally {
    for (const id of oppIds) { await db.delete(estimateRevisions).where(eq(estimateRevisions.opportunityId, id)); await db.delete(opportunities).where(eq(opportunities.id, id)); }
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    if (companyChanged) {
      const owned = and(eq(estimatingCompanyRates.id, 1), eq(estimatingCompanyRates.savedBy, lastCompanyWriter));
      if (originalCompany) await db.update(estimatingCompanyRates).set(originalCompany).where(owned);
      else await db.delete(estimatingCompanyRates).where(owned);
    }
    for (const id of ids) await db.delete(estimatingRateHistory).where(eq(estimatingRateHistory.savedBy, id));
    for (const sid of sessions) await db.execute(sql`DELETE FROM sessions WHERE sid=${sid}`);
    for (const id of ids) await db.execute(sql`DELETE FROM users WHERE id=${id}`);
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
