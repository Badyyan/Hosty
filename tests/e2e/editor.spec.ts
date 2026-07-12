import { test, expect } from "@playwright/test";
import { siteZip, uploadViaUi, fetchSite, ROOT_DOMAIN } from "./helpers";

test.describe("in-browser editor & versioning", () => {
  test("edit auto-saves a new version; rollback restores v1", async ({ page, request }) => {
    const projectId = await uploadViaUi(page, "E2E Editor", siteZip(), "editor.zip");
    const slug = (await page
      .locator(`a[href*=".${ROOT_DOMAIN.split(":")[0]}"]`)
      .first()
      .innerText())
      .split(".")[0]
      .trim();

    // open the editor — index.html loads into CodeMirror
    await page.goto(`/dashboard/projects/${projectId}/editor`);
    const cm = page.locator(".cm-content");
    await expect(cm).toBeVisible();
    await expect(cm).toContainText("Hello E2E", { timeout: 10_000 });

    // replace the content and wait for the 2s-debounced auto-save (which then
    // creates a new deployment — allow generous time under suite contention)
    await cm.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("<!doctype html><html><body><h1>Edited by E2E</h1></body></html>");
    await expect(page.getByText("Unsaved changes…")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("✓ Saved (new version created)")).toBeVisible({ timeout: 30_000 });

    // the live site now serves v2
    await expect
      .poll(async () => (await (await fetchSite(request, slug)).text()).includes("Edited by E2E"), {
        timeout: 10_000,
      })
      .toBe(true);

    // roll back to v1 from the overview tab
    await page.goto(`/dashboard/projects/${projectId}`);
    await expect(page.getByText("v2")).toBeVisible();
    await page.click("button:has-text('Restore')");
    await expect
      .poll(async () => (await (await fetchSite(request, slug)).text()).includes("Hello E2E"), {
        timeout: 10_000,
      })
      .toBe(true);
  });
});
