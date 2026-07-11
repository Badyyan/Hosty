import { test, expect } from "@playwright/test";
import { siteZip, uploadViaUi, ROOT_DOMAIN } from "./helpers";
import { setPlan, testCreds } from "./db";

/**
 * Password & email gates, exercised through a real browser on the actual
 * site origin (Chromium resolves *.localhost to 127.0.0.1).
 */
test.describe("access gates", () => {
  test.beforeAll(async () => {
    // gates are paid features; simulate a completed Stripe upgrade
    await setPlan(testCreds().email, "PRO");
  });

  test("password gate: lock, unlock, rotate", async ({ page, context }) => {
    const projectId = await uploadViaUi(page, "E2E Gate", siteZip(), "gate.zip");
    const siteUrl = (await page
      .locator(`a[href*=".${ROOT_DOMAIN.split(":")[0]}"]`)
      .first()
      .getAttribute("href"))!;

    // set a password via the settings UI
    await page.goto(`/dashboard/projects/${projectId}/settings`);
    await page.getByPlaceholder("Set a password").fill("hunter2secret");
    await page.click("button:has-text('Set')");
    await expect(page.getByText("✓ Saved")).toBeVisible();

    // site is now gated
    const visitor = await context.newPage();
    await visitor.goto(siteUrl);
    await expect(visitor.getByText("password protected")).toBeVisible();

    // wrong password rejected
    await visitor.fill('input[name="password"]', "nope");
    await visitor.click("button:has-text('Unlock')");
    await expect(visitor.getByText("Incorrect password.")).toBeVisible();

    // correct password unlocks and redirects to the site
    await visitor.fill('input[name="password"]', "hunter2secret");
    await visitor.click("button:has-text('Unlock')");
    await expect(visitor.locator("#hello")).toHaveText("Hello E2E");

    // rotating the password invalidates the visitor's unlock cookie
    await page.goto(`/dashboard/projects/${projectId}/settings`);
    await page.getByPlaceholder("New password").fill("rotated-pw");
    await page.click("button:has-text('Set')");
    await expect(page.getByText("✓ Saved")).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText("password protected")).toBeVisible();
    await visitor.close();
  });

  test("email gate captures a lead before showing content", async ({ page, context }) => {
    const projectId = await uploadViaUi(page, "E2E Lead", siteZip(), "lead.zip");
    const siteUrl = (await page
      .locator(`a[href*=".${ROOT_DOMAIN.split(":")[0]}"]`)
      .first()
      .getAttribute("href"))!;

    await page.goto(`/dashboard/projects/${projectId}/settings`);
    await page.getByRole("switch").first().click(); // "Email gate" toggle
    await expect(page.getByText("✓ Saved")).toBeVisible();

    const visitor = await context.newPage();
    await visitor.goto(siteUrl);
    await expect(visitor.getByText("Enter your email")).toBeVisible();
    await visitor.fill('input[name="email"]', "lead-e2e@example.com");
    await visitor.click("button:has-text('Continue')");
    await expect(visitor.locator("#hello")).toHaveText("Hello E2E");
    await visitor.close();

    // the lead shows up in the dashboard
    await page.goto(`/dashboard/projects/${projectId}/leads`);
    await expect(page.getByText("lead-e2e@example.com")).toBeVisible();
  });
});
