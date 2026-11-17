/** Development-only, self-cleaning authenticated rates UI verification. */
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { customers, opportunities, estimateRevisions, estimatingCompanyRates, estimatingRateHistory } from "../shared/schema";
import { emptyJob } from "../shared/estimating/model";

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
if (!new URL(base).hostname.endsWith(".replit.dev")) throw new Error("Development only");
const tag = `__rates-browser-${crypto.randomBytes(6).toString("hex")}`, key = `test_${crypto.randomBytes(6).toString("hex")}`;
const sid = crypto.randomBytes(24).toString("hex");
async function main() {
  const browser = await chromium.launch({ executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(), args: ["--no-sandbox"] });
  let original: typeof estimatingCompanyRates.$inferSelect | undefined, changed = false;
  let customerId: number | undefined, opportunityId: number | undefined;
  try {
    await db.execute(sql`INSERT INTO users(id,email,role,is_authorized) VALUES(${tag},${`${tag}@test.local`},'estimator','approved')`);
    const sess = { cookie: { originalMaxAge: 3600000, httpOnly: true, path: "/", expires: new Date(Date.now() + 3600000).toISOString() },
      passport: { user: { claims: { sub: tag }, expires_at: Math.floor(Date.now() / 1000) + 3600, access_token: "test", refresh_token: "test" } } };
    await db.execute(sql`INSERT INTO sessions(sid,sess,expire) VALUES(${sid},${JSON.stringify(sess)}::jsonb,NOW()+interval '1 hour')`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
    await context.addCookies([{ name: "connect.sid", value: `s:${sid}.${sig}`, url: base, httpOnly: true }]);
    await context.addInitScript(() => localStorage.setItem(`replitDevBannerClosed-${location.hostname}`, "true"));
    const page = await context.newPage(), errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    [original] = await db.select().from(estimatingCompanyRates).where(eq(estimatingCompanyRates.id, 1));
    const starting = await (await context.request.get(`${base}/api/estimating-rates`)).json();
    await page.goto(`${base}/admin/settings/estimating-rates`);
    await expect(page.getByRole("heading", { name: "Estimating Rates", exact: true })).toBeVisible();
    const csv = Buffer.from(`Category,Key,Description,Unit,Price,Source / notes\nConcrete,${key}_conc,Concrete,CY,100,Quote C100\nDrainage,${key}_stone,Stone,TON,,Awaiting quote\n,${key}_other,Other,EA,${key}_conc*2,Formula pricing\n`);
    const preview = async () => {
      await page.getByRole("button", { name: "Import spreadsheet", exact: true }).click();
      await page.getByLabel("Rate spreadsheet files").setInputFiles({ name: "Materials.csv", mimeType: "text/csv", buffer: csv });
      await page.getByRole("button", { name: "Preview changes", exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText("Review warnings");
      await expect(page.getByRole("button", { name: "Confirm company rate changes" })).toBeEnabled();
    };
    await preview();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await (await context.request.get(`${base}/api/estimating-rates`)).json()).version).toBe(starting.version);
    await preview();
    changed = true;
    await page.getByRole("button", { name: "Confirm company rate changes" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/Company rate import applied/)).toBeVisible();
    await page.getByLabel("Search material rates").fill(key);
    await expect(page.getByText("No price set", { exact: true })).toBeVisible();
    expect(await page.locator(".rate-group > summary").last().innerText()).toContain("Uncategorized");
    await page.getByLabel("Material category", { exact: true }).selectOption("Concrete");
    await expect(page.getByLabel("Key", { exact: true })).toHaveCount(1);
    await page.getByLabel("Source / notes", { exact: true }).fill("Unsaved quote");
    await expect(page.getByRole("button", { name: "Import spreadsheet", exact: true })).toBeDisabled();
    page.once("dialog", d => d.accept());
    await page.getByRole("button", { name: "Reload saved rates", exact: true }).click();
    await expect(page.getByRole("button", { name: "Import spreadsheet", exact: true })).toBeEnabled();
    await page.getByLabel("Material category", { exact: true }).selectOption("");
    await mkdir(".local/screenshots", { recursive: true });
    await page.screenshot({ path: ".local/screenshots/company-rates-desktop.png" });
    await page.getByRole("button", { name: "View history", exact: true }).click();
    await page.getByRole("button", { name: /View snapshot version/ }).first().click();
    await expect(page.getByRole("dialog")).toContainText("Read-only");
    await expect(page.getByRole("dialog").getByLabel("Material tax %", { exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    for (const width of [375, 767]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    await page.screenshot({ path: ".local/screenshots/company-rates-mobile.png" });
    await page.getByRole("button", { name: "Import spreadsheet", exact: true }).click();
    await page.getByLabel("Rate spreadsheet files").setInputFiles({ name: "Materials.csv", mimeType: "text/csv", buffer: csv });
    await page.getByRole("button", { name: "Preview changes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm company rate changes" })).toBeEnabled();
    expect(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: ".local/screenshots/rate-import-mobile.png" });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const [customer] = await db.insert(customers).values({ name: tag }).returning(); customerId = customer.id;
    const [opp] = await db.insert(opportunities).values({ name: "Rate sharing verification", opportunityNumber: tag, customerId }).returning(); opportunityId = opp.id;
    const job = emptyJob(); job.name = "Rate sharing verification"; job.defaults.profit = "37";
    job.rates = [{ id: crypto.randomUUID(), key: `${key}_shared`, desc: "Estimate material", unit: "EA", value: "45", category: "Test", notes: "Estimate quote" }];
    const created = await context.request.post(`${base}/api/opportunities/${opp.id}/estimates`, { data: { job } });
    expect(created.status()).toBe(201);
    const revision = await created.json();
    const before = await (await context.request.get(`${base}/api/estimating-rates`)).json();
    await page.goto(`${base}/bidding/${opp.id}`);
    await page.getByRole("tab", { name: "Estimate", exact: true }).click();
    await page.getByRole("button", { name: "Estimate-local rates", exact: true }).click();
    await page.getByRole("button", { name: "Save as company rates", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /Also replace default markups/ })).not.toBeChecked();
    await page.getByRole("button", { name: "Preview changes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm company rate changes" })).toBeEnabled();
    await page.getByRole("button", { name: "Confirm company rate changes" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/This estimate draft and its saved revisions were not changed/)).toBeVisible();
    const after = await (await context.request.get(`${base}/api/estimating-rates`)).json();
    expect(after.rates.defaults).toEqual(before.rates.defaults);
    expect(after.rates.rates.some((r: any) => r.key === `${key}_shared`)).toBe(true);
    const savedRevision = await (await context.request.get(`${base}/api/opportunities/${opp.id}/estimates/${revision.id}`)).json();
    expect(savedRevision.job).toEqual(revision.job); expect(savedRevision.version).toBe(revision.version);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    console.log("PASS authenticated CSV preview/cancel/apply, grouped metadata, draft protection, history, mobile fit, estimate sharing and snapshot preservation");
  } finally {
    await browser.close();
    if (changed) {
      const owned = and(eq(estimatingCompanyRates.id, 1), eq(estimatingCompanyRates.savedBy, tag));
      if (original) await db.update(estimatingCompanyRates).set(original).where(owned);
      else await db.delete(estimatingCompanyRates).where(owned);
    }
    await db.delete(estimatingRateHistory).where(eq(estimatingRateHistory.savedBy, tag));
    if (opportunityId) { await db.delete(estimateRevisions).where(eq(estimateRevisions.opportunityId, opportunityId)); await db.delete(opportunities).where(eq(opportunities.id, opportunityId)); }
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    await db.execute(sql`DELETE FROM sessions WHERE sid=${sid}`);
    await db.execute(sql`DELETE FROM users WHERE id=${tag}`);
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
