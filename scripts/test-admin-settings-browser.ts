/**
 * Live-browser regression for Admin Settings. Uses temporary development users
 * and records only, cleaned in finally. Never run against production.
 * Requires Chromium (CHROMIUM_PATH or `chromium`) and the running app.
 * Run: npx tsx scripts/test-admin-settings-browser.ts
 */
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium, expect, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

const base = process.env.TEST_BASE_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
if (!new URL(base).hostname.endsWith(".replit.dev") && !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("This self-cleaning test is restricted to a development host.");
}
const tag = `__admin-settings-${crypto.randomBytes(6).toString("hex")}`;
const categoryName = `${tag} Documents`;
const scopeName = `${tag} Scope`;
const userIds = [`${tag}-admin`, `${tag}-member`];
const sessions: string[] = [];

async function session(userId: string, role: string) {
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, is_authorized)
    VALUES (${userId}, ${`${userId}@test.local`}, 'Settings', 'Tester', ${role}, 'approved')`);
  const sid = crypto.randomBytes(20).toString("hex");
  sessions.push(sid);
  const sess = {
    cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: "/" },
    passport: { user: { claims: { sub: userId }, expires_at: Math.floor(Date.now() / 1000) + 3600, access_token: "test", refresh_token: "test" } },
  };
  await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}::jsonb, NOW() + interval '1 hour')`);
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
  return { name: "connect.sid", value: `s:${sid}.${sig}`, url: base, httpOnly: true };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function main() {
  const executablePath = process.env.CHROMIUM_PATH ?? execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Dismiss the development-only banner as a user would. It overlays the
    // mobile menu outside the preview iframe and is absent from production.
    await context.addInitScript(() => localStorage.setItem(`replitDevBannerClosed-${location.hostname}`, "true"));
    await context.addCookies([await session(userIds[0], "admin")]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/admin/settings`);
    await expect(page.getByRole("heading", { name: "Admin Settings", exact: true })).toBeVisible();
    const directory = page.getByRole("navigation", { name: "Available admin settings" });
    await expect(directory.getByRole("link")).toHaveCount(4);
    await expect(page.locator("form")).toHaveCount(0);
    await mkdir(".local/screenshots", { recursive: true });
    await page.screenshot({ path: ".local/screenshots/admin-settings-desktop.png", fullPage: true });
    for (const [title, slug, testId] of [
      ["Document Categories", "document-categories", "card-document-categories"],
      ["User Management", "users", "button-add-user"],
      ["Workflows", "workflows", "button-new-rule"],
      ["Bidding Scope Items", "scope-items", "card-scope-catalog"],
    ]) {
      await directory.getByRole("link", { name: title, exact: true }).click();
      await expect(page).toHaveURL(`${base}/admin/settings/${slug}`);
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page.locator('aside a[href="/admin/settings"]')).toHaveAttribute("aria-current", "page");
      await page.getByRole("link", { name: "Back to Admin Settings" }).click();
    }
    console.log("PASS desktop directory, all four child pages, sidebar state and return links");

    for (const slug of ["users", "workflows"]) {
      await page.goto(`${base}/admin/${slug}?legacy=1`);
      await expect(page).toHaveURL(`${base}/admin/settings/${slug}?legacy=1`);
    }
    await page.goto(`${base}/settings`);
    await expect(page.getByTestId("card-profile")).toBeVisible();
    await expect(page.getByTestId("card-outlook-connection")).toBeVisible();
    await expect(page.getByTestId("card-document-categories")).toHaveCount(0);
    await expect(page.getByTestId("card-scope-catalog")).toHaveCount(0);
    console.log("PASS legacy redirects and personal settings separation");

    await page.goto(`${base}/admin/settings/document-categories`);
    await page.getByPlaceholder("New category name").fill(categoryName);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: `Rename ${categoryName}`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Rename ${categoryName}`, exact: true }).click();
    await page.getByRole("textbox", { name: `Category name for ${categoryName}`, exact: true }).fill(`${categoryName} Revised`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: `Rename ${categoryName} Revised`, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: `Rename ${categoryName} Revised`, exact: true })).toBeVisible();
    console.log("PASS document-category create, rename and refresh persistence");

    await page.goto(`${base}/admin/settings/scope-items`);
    await page.getByPlaceholder("New category name").fill(scopeName);
    await page.getByRole("button", { name: "Add category", exact: true }).click();
    const scopeSection = page.locator("section").filter({ has: page.getByRole("heading", { name: scopeName, exact: true }) });
    await expect(scopeSection).toBeVisible();
    await scopeSection.getByPlaceholder("New scope item").fill(`${tag} Scope Item`);
    await scopeSection.getByRole("button", { name: "Add item", exact: true }).click();
    await expect(scopeSection.getByText(`${tag} Scope Item`, { exact: true })).toBeVisible();
    await page.reload();
    await expect(scopeSection.getByText(`${tag} Scope Item`, { exact: true })).toBeVisible();
    console.log("PASS scope category/item creation and refresh persistence");

    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`${base}/admin/settings`);
      await expect(directory).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: `.local/screenshots/admin-settings-${width}.png`, fullPage: true });
      for (const slug of ["document-categories", "scope-items", "users", "workflows"]) {
        await page.goto(`${base}/admin/settings/${slug}`);
        await expect(page.getByRole("link", { name: "Back to Admin Settings" })).toBeVisible();
        await noOverflow(page);
        if (slug === "document-categories") {
          await page.getByRole("button", { name: `Rename ${categoryName} Revised`, exact: true }).click();
          await noOverflow(page);
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
        }
        if (slug === "users") {
          await page.getByTestId("button-add-user").click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await noOverflow(page);
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
        }
        if (slug === "workflows") {
          await page.getByTestId("button-new-rule").click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await noOverflow(page);
          await page.getByTestId("button-rule-cancel").click();
        }
      }
      await page.getByTestId("button-mobile-menu").click();
      const mobileSettingsLink = page.getByRole("link", { name: "Admin Settings", exact: true }).filter({ visible: true });
      await expect(mobileSettingsLink).toHaveAttribute("aria-current", "page");
      await mobileSettingsLink.click();
      await expect(directory).toBeVisible();
      console.log(`PASS ${width}px directory, child pages, dialogs and mobile menu`);
    }
    const memberContext = await browser.newContext();
    await memberContext.addCookies([await session(userIds[1], "user")]);
    const member = await memberContext.newPage();
    for (const path of ["/admin/settings", "/admin/settings/document-categories", "/admin/settings/users", "/admin/settings/workflows", "/admin/settings/scope-items"]) {
      await member.goto(`${base}${path}`);
      await expect(member.getByRole("heading", { name: "404 Page Not Found" })).toBeVisible();
    }
    expect(errors).toEqual([]);
    console.log("PASS non-admin direct URL denial and no browser runtime errors");
  } finally {
    await browser.close();
    await db.execute(sql`DELETE FROM activity_logs WHERE actor_user_id = ${userIds[0]}`);
    await db.execute(sql`DELETE FROM scope_item_templates WHERE category_id IN (SELECT id FROM scope_categories WHERE name = ${scopeName})`);
    await db.execute(sql`DELETE FROM scope_categories WHERE name = ${scopeName}`);
    await db.execute(sql`DELETE FROM document_categories WHERE name IN (${categoryName}, ${`${categoryName} Revised`})`);
    for (const sid of sessions) await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid}`);
    for (const id of userIds) await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });