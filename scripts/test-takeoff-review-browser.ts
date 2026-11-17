/** Self-cleaning dev test. Uses a completed synthetic run; no model calls. */
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { customers, opportunities, estimateRevisions, takeoffRuns } from "../shared/schema";
import { emptyJob, newCategory, newLine, ratesSchema } from "../shared/estimating/model";
import { computeJob, summarize } from "../shared/estimating/engine";
import { aiSettingsSchema, type TakeoffState } from "../shared/estimating/takeoff";

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
if (!new URL(base).hostname.endsWith(".replit.dev")) throw new Error("Development only");
const tag = `__takeoff-review-${crypto.randomBytes(6).toString("hex")}`, sid = crypto.randomBytes(24).toString("hex");
async function main() {
  const browser = await chromium.launch({ executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(), args: ["--no-sandbox"] });
  let customerId: number | undefined, opportunityId: number | undefined;
  try {
    await db.execute(sql`INSERT INTO users(id,email,role,is_authorized) VALUES(${tag},${`${tag}@test.local`},'estimator','approved')`);
    const sess = { cookie: { originalMaxAge: 3600000, httpOnly: true, path: "/", expires: new Date(Date.now() + 3600000).toISOString() },
      passport: { user: { claims: { sub: tag }, expires_at: Math.floor(Date.now() / 1000) + 3600, access_token: "test", refresh_token: "test" } } };
    await db.execute(sql`INSERT INTO sessions(sid,sess,expire) VALUES(${sid},${JSON.stringify(sess)}::jsonb,NOW()+interval '1 hour')`);
    const [customer] = await db.insert(customers).values({ name: tag }).returning(); customerId = customer.id;
    const [opp] = await db.insert(opportunities).values({ name: "Claude rate review verification", opportunityNumber: tag, customerId }).returning(); opportunityId = opp.id;
    const job = emptyJob(); job.name = "Claude rate review verification";
    job.rates = [{ id: "stone", key: "stone", desc: "Quoted stone", unit: "TON", value: "20" }];
    const originalRates = structuredClone(ratesSchema.parse(job));
    job.rates.push({ id: "delivered", key: "delivered_stone", desc: "Delivered aggregate — verify supplier quote", unit: "TON", value: "stone*1.9", category: "Stone", notes: "Synthetic test" });
    const cat = newCategory(), line = newLine(); cat.name = "Site work";
    line.desc = "Aggregate"; line.qty = "2"; line.ref = "C1: stated quantity 2 TON"; line.flag = "VERIFY material quote";
    line.res.sub = [{ id: "cost", desc: "Aggregate", qty: "qty", unit: "TON", cost: "delivered_stone" }];
    cat.items = [line]; job.categories = [cat];
    const [rev] = await db.insert(estimateRevisions).values({ opportunityId, revisionNumber: 0, name: "Synthetic Claude review", job, summary: summarize(job, computeJob(job)), createdBy: tag, savedBy: tag }).returning();
    const state: TakeoffState = { documents: [], instructions: "", trades: ["Site work"], settings: aiSettingsSchema.parse({}),
      playbook: { id: null, version: 0, markdown: "" }, rules: [], job, originalRates, sheetIndexes: {}, messages: [], scales: {},
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0, steps: 2, budget: 25, stepLimit: 150,
      progress: [{ at: new Date().toISOString(), message: "Synthetic takeoff ready for review" }], summary: "Verify the added aggregate rate.", questions: [] };
    const [run] = await db.insert(takeoffRuns).values({ opportunityId, createdBy: tag, status: "needs_review", state, revisionId: rev.id, startedAt: new Date(), finishedAt: new Date() }).returning();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
    await context.addCookies([{ name: "connect.sid", value: `s:${sid}.${sig}`, url: base, httpOnly: true }]);
    await context.addInitScript(() => localStorage.setItem(`replitDevBannerClosed-${location.hostname}`, "true"));
    const page = await context.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${base}/bidding/${opportunityId}`);
    await page.getByRole("tab", { name: "Estimate", exact: true }).click();
    const rates = page.getByRole("region", { name: "Rates added by Claude — verify", exact: true });
    await expect(rates).toBeVisible();
    await expect(rates).toContainText("delivered_stone"); await expect(rates).toContainText("stone*1.9"); await expect(rates).toContainText("$38.00");
    await rates.scrollIntoViewIfNeeded();
    await mkdir(".local/screenshots", { recursive: true });
    await page.screenshot({ path: ".local/screenshots/claude-added-rates-desktop.png" });
    for (const width of [375, 767]) {
      await page.setViewportSize({ width, height: 900 }); await rates.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await rates.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 375, height: 900 }); await rates.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".local/screenshots/claude-added-rates-mobile.png" });
    const response = await context.request.get(`${base}/api/opportunities/${opportunityId}/takeoff/runs`);
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload[0].addedRates[0].computedValue).toBe(38);
    expect(payload[0].originalRates).toBeUndefined(); expect(payload[0].messages).toBeUndefined(); expect(payload[0].sheetIndexes).toBeUndefined();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Mark takeoff reviewed", exact: true }).click();
    await expect(page.getByRole("button", { name: "Mark takeoff reviewed", exact: true })).toHaveCount(0);
    const [reviewed] = await db.select().from(takeoffRuns).where(eq(takeoffRuns.id, run.id));
    expect(reviewed.status).toBe("completed"); expect(reviewed.state.originalRates).toEqual(originalRates);
    expect(errors).toEqual([]);
    console.log("PASS added-rate review through authenticated API/UI, computed formula, mobile fit and review approval; no model requests");
  } finally {
    await browser.close();
    if (opportunityId) { await db.delete(takeoffRuns).where(eq(takeoffRuns.opportunityId, opportunityId)); await db.delete(estimateRevisions).where(eq(estimateRevisions.opportunityId, opportunityId)); await db.delete(opportunities).where(eq(opportunities.id, opportunityId)); }
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    await db.execute(sql`DELETE FROM sessions WHERE sid=${sid}`);
    await db.execute(sql`DELETE FROM users WHERE id=${tag}`);
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
