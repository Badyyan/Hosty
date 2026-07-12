import AdmZip from "adm-zip";
import type { APIRequestContext, Page } from "@playwright/test";

export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

/** Build an in-memory site zip fixture. */
export function siteZip(overrides: Record<string, string> = {}): Buffer {
  const zip = new AdmZip();
  const files: Record<string, string> = {
    "index.html":
      '<!doctype html><html><head><title>E2E Site</title></head><body><h1 id="hello">Hello E2E</h1><a href="about.html">about</a></body></html>',
    "about.html": "<!doctype html><html><body><h2>About E2E</h2></body></html>",
    "assets/style.css": "body{font-family:sans-serif}",
    ...overrides,
  };
  for (const [p, c] of Object.entries(files)) zip.addFile(p, Buffer.from(c));
  return zip.toBuffer();
}

/** Upload a fixture through the dashboard dropzone's file input. */
export async function uploadViaUi(page: Page, name: string, buffer: Buffer, filename: string) {
  await page.goto("/dashboard");
  const input = page.locator('input[type="file"][multiple]');
  await input.setInputFiles({ name: filename, mimeType: "application/octet-stream", buffer });
  // upload + extraction + deploy can be slow under full-suite contention;
  // the workerd target (per-request client, no Hyperdrive) is slower still
  const uploadTimeout = process.env.E2E_TARGET === "workerd" ? 90_000 : 45_000;
  await page.waitForURL(/\/dashboard\/projects\/[a-z0-9]+/, { timeout: uploadTimeout });
  const projectId = page.url().match(/projects\/([a-z0-9]+)/)![1];
  return projectId;
}

/** GET a hosted-site path by sending the subdomain via the Host header. */
export async function fetchSite(
  api: APIRequestContext,
  slug: string,
  path = "/",
  opts: { headers?: Record<string, string> } = {}
) {
  return api.get(path, {
    headers: { Host: `${slug}.${ROOT_DOMAIN}`, ...opts.headers },
    maxRedirects: 0,
  });
}
