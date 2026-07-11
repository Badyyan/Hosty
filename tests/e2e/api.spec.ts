import { test, expect, request as pwRequest } from "@playwright/test";
import { siteZip, fetchSite } from "./helpers";

test.describe("API keys & public API v1", () => {
  test("create a key in the UI, deploy through the public API", async ({ page, baseURL }) => {
    // create a key via the dashboard (shown exactly once)
    await page.goto("/dashboard/keys");
    await page.getByPlaceholder("Key name (e.g. CI deploys)").fill("e2e key");
    await page.click("button:has-text('Create key')");
    const keyEl = page.locator("code", { hasText: /^hty_/ });
    await expect(keyEl).toBeVisible();
    const apiKey = (await keyEl.innerText()).trim();

    // fresh unauthenticated context — only the bearer key grants access
    const api = await pwRequest.newContext({ baseURL: baseURL! });

    const me = await api.get("/api/v1/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(me.ok()).toBe(true);

    const created = await api.post("/api/v1/projects", {
      headers: { Authorization: `Bearer ${apiKey}` },
      multipart: {
        file: { name: "api-e2e.zip", mimeType: "application/zip", buffer: siteZip() },
        name: "API E2E",
      },
    });
    expect(created.status()).toBe(201);
    const { project } = await created.json();
    expect(project.url).toContain(project.slug);

    // deployed site is live
    const res = await fetchSite(api, project.slug);
    expect(await res.text()).toContain("Hello E2E");

    // re-deploy replaces content but keeps the URL
    const updated = await api.put(`/api/v1/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      multipart: {
        file: {
          name: "v2.html",
          mimeType: "text/html",
          buffer: Buffer.from("<!doctype html><html><body><h1>API v2</h1></body></html>"),
        },
      },
    });
    expect(updated.ok()).toBe(true);
    expect(await (await fetchSite(api, project.slug)).text()).toContain("API v2");

    // invalid key is rejected; delete cleans up
    const bad = await api.get("/api/v1/me", { headers: { Authorization: "Bearer hty_invalid" } });
    expect(bad.status()).toBe(401);
    const del = await api.delete(`/api/v1/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(del.ok()).toBe(true);
    expect((await fetchSite(api, project.slug)).status()).toBe(404);

    await api.dispose();
  });
});
