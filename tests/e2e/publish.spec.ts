import { test, expect } from "@playwright/test";
import { siteZip, uploadViaUi, fetchSite, ROOT_DOMAIN } from "./helpers";

test.describe("publishing & serving", () => {
  test("zip upload → live site with analytics beacon", async ({ page, request }) => {
    const projectId = await uploadViaUi(page, "E2E Zip", siteZip(), "e2e-site.zip");

    // project overview shows the public URL
    const urlLink = page.locator(`a[href*=".${ROOT_DOMAIN.split(":")[0]}"]`).first();
    await expect(urlLink).toBeVisible();
    const slug = (await urlLink.innerText()).split(".")[0].trim();

    // root page serves with injected beacon
    const root = await fetchSite(request, slug);
    expect(root.status()).toBe(200);
    const html = await root.text();
    expect(html).toContain("Hello E2E");
    expect(html).toContain("_hosty/event");
    expect(html).toContain("Made with Hosty"); // free plan badge

    // asset content type + clean URLs + 404
    const css = await fetchSite(request, slug, "/assets/style.css");
    expect(css.headers()["content-type"]).toContain("text/css");
    expect((await fetchSite(request, slug, "/about")).status()).toBe(200);
    expect((await fetchSite(request, slug, "/missing")).status()).toBe(404);

    // version history shows v1 live
    await page.goto(`/dashboard/projects/${projectId}`);
    await expect(page.getByText("v1").first()).toBeVisible();
    await expect(page.getByText("Live").first()).toBeVisible();
  });

  test("paste HTML publishes a page", async ({ page, request }) => {
    await page.goto("/dashboard");
    await page.click("button:has-text('Paste HTML')");
    await page.fill("textarea", "<!doctype html><html><body><h1>Pasted E2E</h1></body></html>");
    await page.click("button:has-text('Publish page')");
    await page.waitForURL(/\/dashboard\/projects\/[a-z0-9]+/);

    const urlLink = page.locator(`a[href*=".${ROOT_DOMAIN.split(":")[0]}"]`).first();
    const slug = (await urlLink.innerText()).split(".")[0].trim();
    const res = await fetchSite(request, slug);
    expect(await res.text()).toContain("Pasted E2E");
  });

  test("visiting a site records analytics shown in the dashboard", async ({
    page,
    context,
    request,
  }) => {
    const projectId = await uploadViaUi(page, "E2E Analytics", siteZip(), "analytics.zip");
    const urlLink = page.locator(`a[href*=".${ROOT_DOMAIN.split(":")[0]}"]`).first();
    const siteUrl = await urlLink.getAttribute("href");

    // real browser visit → sendBeacon fires a pageview
    const visitor = await context.newPage();
    await visitor.goto(siteUrl!);
    await expect(visitor.locator("#hello")).toHaveText("Hello E2E");
    await visitor.waitForTimeout(500);
    await visitor.close();

    // the event lands asynchronously — poll the analytics API
    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/projects/${projectId}/analytics?days=1`);
          return (await res.json()).pageViews as number;
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);

    await page.goto(`/dashboard/projects/${projectId}/analytics`);
    await expect(page.getByText("Visitors").first()).toBeVisible();
    await expect(page.getByText("Traffic")).toBeVisible();
  });
});
