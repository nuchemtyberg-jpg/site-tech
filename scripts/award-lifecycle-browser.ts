import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";

export async function checkAwardBrowser(base: string, cookie: string, projectId: number, bidId: number, pendingId: number, staffCookie: string) {
  const browser = await chromium.launch({
    executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
    args: ["--no-sandbox"],
  });
  try {
    for (const width of [1280, 402]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: "connect.sid", value: cookie.slice("connect.sid=".length), url: base }]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/projects/${projectId}?tab=bids`);
      await page.getByTestId("project-bids-contracts").waitFor();
      await page.getByTestId("button-expand-project-details").click();
      await page.getByTestId("project-estimated-value").waitFor();
      assert.equal(await page.getByTestId("project-estimated-value").count(), 1, "admin retains award-derived Project value");
      assert.equal(await page.getByRole("button", { name: "View award snapshot" }).count(), 3);
      await page.getByRole("button", { name: "View award snapshot" }).first().click();
      await page.getByRole("dialog").getByText("Original scope", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Add bid to project" }).click();
      await page.getByRole("dialog").getByText("Link to project (optional)", { exact: true }).waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.goto(`${base}/bidding/${bidId}`);
      await page.getByRole("link", { name: "Open project", exact: false }).waitFor();
      const edit = page.getByRole("button", { name: "Edit", exact: true });
      assert.equal(await edit.isEnabled(), true, "awarded bid remains editable");
      await edit.click();
      await page.getByRole("dialog").getByText(/contract.*unchanged|snapshot.*unchanged|contract.*immutable/i).first().waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.goto(`${base}/bidding/${pendingId}`);
      await page.getByRole("button", { name: "Change status", exact: true }).click();
      await page.getByRole("dialog").getByRole("combobox").first().click();
      await page.getByRole("option", { name: "Awarded", exact: true }).click();
      await page.getByRole("dialog").getByText(/Adds a new contract to/i).waitFor();
      // Only the phone pass actually awards; desktop checks confirmation.
      if (width === 402) {
        await page.getByRole("dialog").getByRole("button", { name: "Confirm award", exact: true }).click();
        await page.waitForURL(`**/projects/${projectId}?tab=bids`);
        await page.getByTestId("project-bids-contracts").waitFor();
        assert.equal(await page.getByRole("button", { name: "View award snapshot" }).count(), 4);
      } else await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      assert.deepEqual(errors, [], `No ${width}px browser runtime errors`);
      await page.screenshot({ path: `/tmp/award-project-${width}.png`, fullPage: true });
      console.log(`PASS browser ${width}px: contracts, immutable snapshot, additional-bid form, awarded Edit and award destination`);
      await context.close();
      const staff = await browser.newContext({ viewport: { width, height: 900 } });
      await staff.addCookies([{ name: "connect.sid", value: staffCookie.slice("connect.sid=".length), url: base }]);
      const staffPage = await staff.newPage();
      await staffPage.goto(`${base}/projects/${projectId}?tab=bids`);
      await staffPage.getByTestId("project-bids-contracts").waitFor();
      await staffPage.getByTestId("button-expand-project-details").click();
      assert.equal(await staffPage.getByTestId("project-estimated-value").count(), 0, "non-admin Project Details hides restricted value");
      assert.equal(await staffPage.getByText("$1,000", { exact: true }).count(), 0, "no contract or operational amount leaks to non-admin");
      await staffPage.getByRole("button", { name: "View award snapshot" }).first().click();
      assert.equal(await staffPage.getByRole("dialog").getByText("$1,000", { exact: true }).count(), 0, "non-admin snapshot hides original value");
      console.log(`PASS browser ${width}px: non-admin Project Details, contracts and snapshot cannot reveal award amount`);
      await staff.close();
    }
  } finally { await browser.close(); }
}
