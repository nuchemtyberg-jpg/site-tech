import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";

/** Runs with the isolated API suite's ordinary approved-user session. */
export async function checkDocumentsBrowser(base: string, cookie: string, type: "project" | "opportunity", ownerId: number, folderId: number, currentId: number) {
  const executablePath = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  try {
    for (const width of [1280, 402]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: "connect.sid", value: cookie.slice("connect.sid=".length), url: base }]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/${type === "project" ? "projects" : "bidding"}/${ownerId}?tab=documents&folder=${folderId}`);
      if (type === "opportunity") await page.getByRole("tab", { name: /documents/i }).click();
      const menu = page.getByTestId(`button-file-menu-${currentId}`);
      await menu.waitFor();
      await menu.click();
      await page.getByRole("menuitem", { name: "Version history", exact: true }).click();
      await page.getByRole("dialog").getByText("Version 1", { exact: true }).waitFor();
      await page.getByRole("dialog").getByText("Version 2", { exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Download version 1" }).count(), 1);
      assert.equal(await page.getByRole("link", { name: "Download version 2" }).count(), 1);
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();
      await menu.click();
      await page.getByRole("menuitem", { name: "New version", exact: true }).click();
      await page.getByRole("dialog").getByText(/previous version stays in history/i).waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();
      await page.reload();
      if (type === "opportunity") await page.getByRole("tab", { name: /documents/i }).click();
      await menu.waitFor();
      assert.deepEqual(errors, [], `${type} ${width}: no browser runtime errors`);
      await page.screenshot({ path: `/tmp/documents-${type}-${width}.png`, fullPage: true });
      console.log(`PASS ${type} ${width}px: shared controls, history, new-version dialog and refresh`);
      await context.close();
    }
  } finally { await browser.close(); }
}
