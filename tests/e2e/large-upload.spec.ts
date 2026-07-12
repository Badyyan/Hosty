import { test, expect } from "@playwright/test";
import { fetchSite } from "./helpers";

/**
 * Multi-GB upload path (scaled down): presigned multipart URLs → direct
 * part PUTs to object storage → /api/upload/complete registers the
 * deployment via server-side copy. Exercises the exact production flow —
 * bytes never pass through the app tier.
 */
test.describe("large-file uploads (presigned multipart)", () => {
  test("presign → part upload → complete → served", async ({ request }) => {
    const filename = "big-video.mp4";
    const content = Buffer.alloc(3 * 1024 * 1024, 7); // 3MB stand-in

    // 1. presign
    const presignRes = await request.post("/api/upload/presign", {
      data: { filename, size: content.length, parts: 2 },
    });
    expect(presignRes.ok()).toBe(true);
    const presign = await presignRes.json();
    expect(presign.stagingKey).toContain("staging/");
    expect(presign.urls).toHaveLength(2);

    // 2. upload two parts directly to storage
    const half = Math.ceil(content.length / 2);
    const parts = [];
    for (let i = 0; i < 2; i++) {
      const res = await fetch(presign.urls[i], {
        method: "PUT",
        body: content.subarray(i * half, (i + 1) * half),
      });
      expect(res.ok).toBe(true);
      parts.push({ ETag: res.headers.get("etag") ?? `"part-${i + 1}"`, PartNumber: i + 1 });
    }

    // 3. complete → project registered by server-side copy
    const completeRes = await request.post("/api/upload/complete", {
      data: {
        stagingKey: presign.stagingKey,
        uploadId: presign.uploadId,
        parts,
        filename,
        name: "Big Video",
      },
    });
    expect(completeRes.status()).toBe(201);
    const { project } = await completeRes.json();
    expect(project.deployment.bytes).toBe(content.length);

    // 4. the file streams from the site with the right type and full length
    const served = await fetchSite(request, project.slug, `/${filename}?raw=1`);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toContain("video/mp4");
    expect((await served.body()).length).toBe(content.length);

    // 5. range requests work (video seeking)
    const range = await fetchSite(request, project.slug, `/${filename}?raw=1`, {
      headers: { Range: "bytes=0-99" },
    });
    expect(range.status()).toBe(206);
    expect((await range.body()).length).toBe(100);

    // cleanup
    await request.delete(`/api/projects/${project.id}`);
  });

  test("cannot finalize another user's staged upload", async ({ request }) => {
    const res = await request.post("/api/upload/complete", {
      data: {
        stagingKey: "staging/someone-else/abc/file.pdf",
        uploadId: "fake",
        parts: [{ ETag: '"x"', PartNumber: 1 }],
        filename: "file.pdf",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("zip archives are rejected on the large path", async ({ request }) => {
    const presignRes = await request.post("/api/upload/presign", {
      data: { filename: "site.zip", size: 1024, parts: 1 },
    });
    const presign = await presignRes.json();
    await fetch(presign.urls[0], { method: "PUT", body: Buffer.from("PK") });
    const completeRes = await request.post("/api/upload/complete", {
      data: {
        stagingKey: presign.stagingKey,
        uploadId: presign.uploadId,
        parts: [{ ETag: '"part-1"', PartNumber: 1 }],
        filename: "site.zip",
      },
    });
    expect(completeRes.status()).toBe(422);
  });
});

test.describe("activity feed", () => {
  test("deployments appear in the activity page", async ({ page, request }) => {
    const res = await request.get("/api/activity");
    expect(res.ok()).toBe(true);
    const { activity } = await res.json();
    // earlier specs in this run deployed projects as this user
    expect(Array.isArray(activity)).toBe(true);

    await page.goto("/dashboard/activity");
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(page.getByText(/published a new project|deployed a new version/).first())
      .toBeVisible();
  });
});
