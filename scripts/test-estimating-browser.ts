import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { sql, eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { customers, opportunities, estimateRevisions } from "../shared/schema";

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const tag = `__estimate-browser-${crypto.randomBytes(6).toString("hex")}`;
const sid = crypto.randomBytes(24).toString("hex");
async function main() {
  let oppId: number | undefined, customerId: number | undefined;
  const browser = await chromium.launch({ executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(), args: ["--no-sandbox"] });
  try {
    await db.execute(sql`INSERT INTO users(id,email,role,is_authorized) VALUES(${tag},${`${tag}@test.local`},'estimator','approved')`);
    const sess = { cookie: { originalMaxAge: 3600000, httpOnly: true, path: "/", expires: new Date(Date.now() + 3600000).toISOString() }, passport: { user: { claims: { sub: tag }, expires_at: Math.floor(Date.now() / 1000) + 3600, access_token: "test", refresh_token: "test" } } };
    await db.execute(sql`INSERT INTO sessions(sid,sess,expire) VALUES(${sid},${JSON.stringify(sess)}::jsonb,NOW()+interval '1 hour')`);
    const [cust] = await db.insert(customers).values({ name: tag }).returning(); customerId = cust.id;
    const [opp] = await db.insert(opportunities).values({ name: "Estimate browser verification", opportunityNumber: tag, customerId, streetAddress: "1 Test Street", city: "Test", state: "NJ", zip: "00000" }).returning(); oppId = opp.id;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem(`replitDevBannerClosed-${location.hostname}`, "true"));
    const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
    await context.addCookies([{ name: "connect.sid", value: `s:${sid}.${sig}`, url: base, httpOnly: true }]);
    const page = await context.newPage(), errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${base}/bidding/${opp.id}`);
    await page.getByRole("tab", { name: "Estimate", exact: true }).click();
    await page.getByLabel("Import takeoff JSON file").setInputFiles("attached_assets/1_Eyes_on_9_—_Site_Work_-_takeoff_file_1794871558100.json");
    await expect(page.getByLabel("Estimate revision")).toContainText("Imported from takeoff form", { timeout: 30000 });
    await expect(page.getByText("$765,591.76").first()).toBeVisible();
    await mkdir(".local/screenshots", { recursive: true });
    await page.screenshot({ path: ".local/screenshots/estimate-desktop.png" });
    await page.getByRole("button", { name: "Save as revision", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Browser revision");
    await dialog.getByRole("button", { name: /save/i }).click();
    await expect(page.getByLabel("Estimate revision")).toContainText("Browser revision");
    await page.reload();
    await page.getByRole("tab", { name: "Estimate", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Estimate revision", exact: true })).toHaveValue(/\d+/);
    await expect(page.getByText("$765,591.76").first()).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: ".local/screenshots/estimate-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(`${base}/admin/settings/estimating-rates`);
    await expect(page.getByRole("heading", { name: "Estimating Rates", exact: true })).toBeVisible();
    await page.goto(`${base}/admin/settings/users`);
    await expect(page.getByRole("heading", { name: "404 Page Not Found" })).toBeVisible();
    expect(errors).toEqual([]);
    console.log("PASS estimator imports exact total, saves named revision, refreshes, mobile fits, rates allowed and user admin denied");
  } finally {
    await browser.close();
    if (oppId) { await db.delete(estimateRevisions).where(eq(estimateRevisions.opportunityId, oppId)); await db.delete(opportunities).where(eq(opportunities.id, oppId)); }
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    await db.execute(sql`DELETE FROM sessions WHERE sid=${sid}`);
    await db.execute(sql`DELETE FROM users WHERE id=${tag}`);
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
