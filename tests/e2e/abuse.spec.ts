import { test, expect, request as pwRequest } from "@playwright/test";
import AdmZip from "adm-zip";
import { siteZip, uploadViaUi } from "./helpers";
import { setPlan, testCreds } from "./db";

/**
 * Security & abuse-resistance: cross-account isolation (IDOR), plan quota
 * enforcement, hostile uploads, and platform headers. Named "abuse" so it
 * runs first alphabetically — the shared account is still on FREE here,
 * which the quota tests rely on.
 */

test.describe("quota enforcement (FREE plan)", () => {
  test.beforeAll(async () => {
    await setPlan(testCreds().email, "FREE");
  });
  test.afterAll(async () => {
    await setPlan(testCreds().email, "FREE"); // leave a known state
  });

  test("uploads over the plan size limit are rejected with an upgrade hint", async ({
    request,
  }) => {
    // FREE allows 25 MB — declare a 30 MB presigned upload
    const res = await request.post("/api/upload/presign", {
      data: { filename: "big.mp4", size: 30 * 1024 * 1024, parts: 1 },
    });
    expect(res.status()).toBe(402);

    // inline path enforces the same limit on actual bytes
    const inline = await request.post("/api/upload", {
      multipart: {
        file: {
          name: "big.bin.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(26 * 1024 * 1024),
        },
      },
    });
    expect(inline.status()).toBe(402);
    expect((await inline.json()).upgrade).toBeTruthy();
  });

  test("paid features are locked on FREE", async ({ request, page }) => {
    const projectId = await uploadViaUi(page, "Free Proj", siteZip(), "free-proj.zip");
    const pw = await request.patch(`/api/projects/${projectId}`, {
      data: { password: "nope" },
    });
    expect(pw.status()).toBe(402);
    const gate = await request.patch(`/api/projects/${projectId}`, {
      data: { emailGate: true },
    });
    expect(gate.status()).toBe(402);
    await request.delete(`/api/projects/${projectId}`);
  });
});

test.describe("cross-account isolation (IDOR)", () => {
  test("another account cannot read, modify or delete my project", async ({
    page,
    baseURL,
  }) => {
    const projectId = await uploadViaUi(page, "IDOR Target", siteZip(), "idor.zip");

    // second, freshly-registered account
    const attacker = await pwRequest.newContext({ baseURL: baseURL! });
    const email = `attacker-${Date.now()}@test.hosty.site`;
    await attacker.post("/api/auth/register", {
      data: { name: "Attacker", email, password: "attacker-pw-123" },
      headers: { Origin: baseURL! },
    });
    const csrf = (await (await attacker.get("/api/auth/csrf")).json()).csrfToken;
    await attacker.post("/api/auth/callback/credentials", {
      form: { csrfToken: csrf, email, password: "attacker-pw-123", json: "true" },
      headers: { Origin: baseURL! },
    });

    // project IDs must not be readable/modifiable/deletable across accounts —
    // and must 404 (not 403) so IDs can't be enumerated
    expect((await attacker.get(`/api/projects/${projectId}`)).status()).toBe(404);
    expect(
      (await attacker.patch(`/api/projects/${projectId}`, { data: { name: "pwned" } })).status()
    ).toBe(404);
    expect((await attacker.delete(`/api/projects/${projectId}`)).status()).toBe(404);
    expect((await attacker.get(`/api/projects/${projectId}/leads`)).status()).toBe(404);
    expect(
      (await attacker.get(`/api/projects/${projectId}/files/content?path=index.html`)).status()
    ).toBe(404);

    // still intact and readable for the owner
    const mine = await page.request.get(`/api/projects/${projectId}`);
    expect(mine.ok()).toBe(true);
    expect((await mine.json()).project.id).toBe(projectId);

    await attacker.dispose();
    await page.request.delete(`/api/projects/${projectId}`);
  });
});

test.describe("hostile uploads", () => {
  test("an archive of only disallowed files is rejected", async ({ request }) => {
    // zip-slip (../) path traversal is covered exhaustively in the unit suite
    // (src/lib/__tests__/zip.test.ts); here we assert the API contract that an
    // archive with nothing hostable is refused rather than yielding an empty site.
    const evil = new AdmZip();
    evil.addFile("run.exe", Buffer.from("MZ"));
    evil.addFile("hack.sh", Buffer.from("#!/bin/sh"));
    const res = await request.post("/api/upload", {
      multipart: {
        file: { name: "evil.zip", mimeType: "application/zip", buffer: evil.toBuffer() },
      },
    });
    expect(res.status()).toBe(422);
  });

  test("disallowed single files are rejected", async ({ request }) => {
    for (const name of ["malware.exe", "script.sh", "binary"]) {
      const res = await request.post("/api/upload", {
        multipart: {
          file: { name, mimeType: "application/octet-stream", buffer: Buffer.from("data") },
        },
      });
      expect(res.status(), name).toBe(422);
    }
  });

  test("php uploads are hosted but never served as executable/html", async ({ request }) => {
    const res = await request.post("/api/upload", {
      multipart: {
        file: {
          name: "app.php",
          mimeType: "text/plain",
          buffer: Buffer.from("<?php echo 'hi'; ?>"),
        },
        name: "PHP Test",
      },
    });
    expect(res.ok()).toBe(true);
    const { project } = await res.json();
    const served = await request.get(`/sites/${project.slug}/app.php?raw=1`);
    expect(served.headers()["content-type"]).toContain("application/octet-stream");
    expect(served.headers()["x-content-type-options"]).toBe("nosniff");
    await request.delete(`/api/projects/${project.id}`);
  });
});

test.describe("platform headers", () => {
  test("dashboard responses carry the security headers", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
  });
});
