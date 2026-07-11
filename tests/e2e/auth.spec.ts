import { test, expect } from "@playwright/test";
import { testCreds } from "./db";

test.describe("authentication", () => {
  test("authenticated user sees the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Drag & drop to publish")).toBeVisible();
    await expect(page.getByText(testCreds().email)).toBeVisible();
  });

  test.describe("logged out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("wrong password shows an error and no session", async ({ page }) => {
      await page.goto("/login");
      await page.fill("#email", testCreds().email);
      await page.fill("#password", "definitely-wrong");
      await page.click("button:has-text('Sign in')");
      await expect(page.getByText("Invalid email or password.")).toBeVisible();
    });

    test("dashboard redirects to login", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForURL(/\/login/);
      await expect(page.locator("#email")).toBeVisible();
    });

    test("login works end-to-end", async ({ page }) => {
      const { email, password } = testCreds();
      await page.goto("/login");
      await page.fill("#email", email);
      await page.fill("#password", password);
      await page.click("button:has-text('Sign in')");
      await page.waitForURL(/\/dashboard/);
      await expect(page.getByText("Your projects")).toBeVisible();
    });
  });
});
