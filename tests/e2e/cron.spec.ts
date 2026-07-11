import { test, expect } from "@playwright/test";
import { db, testCreds } from "./db";

const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-secret";

test.describe("scheduled maintenance", () => {
  test("rejects a missing or wrong secret", async ({ request }) => {
    expect((await request.post("/api/cron/daily")).status()).toBe(401);
    expect(
      (
        await request.post("/api/cron/daily", {
          headers: { Authorization: "Bearer wrong-secret" },
        })
      ).status()
    ).toBe(401);
  });

  test("purges expired analytics and reconciles storage drift", async ({ request }) => {
    const user = await db().user.findUniqueOrThrow({ where: { email: testCreds().email } });

    // arrange: a project with one ancient analytics event (past FREE's 30d
    // retention — the e2e account is PRO in-suite, so use 400 days to beat
    // every tier) and a deliberately drifted storage counter
    const project = await db().project.create({
      data: { name: "Cron Fixture", slug: `cron-fx-${Date.now()}`, userId: user.id },
    });
    await db().analyticsEvent.create({
      data: {
        projectId: project.id,
        type: "pageview",
        path: "/",
        visitorId: "cron-test-visitor",
        createdAt: new Date(Date.now() - 800 * 86400_000),
      },
    });
    await db().user.update({
      where: { id: user.id },
      data: { storageUsed: BigInt(999_999_999) },
    });

    const res = await request.post("/api/cron/daily", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.ok()).toBe(true);
    const { report } = await res.json();
    expect(report.analyticsEventsPurged).toBeGreaterThanOrEqual(1);
    expect(report.storageAccountsReconciled).toBeGreaterThanOrEqual(1);

    // the ancient event is gone; the counter matches ground truth again
    const remaining = await db().analyticsEvent.count({
      where: { projectId: project.id, visitorId: "cron-test-visitor" },
    });
    expect(remaining).toBe(0);
    const after = await db().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.storageUsed).not.toBe(BigInt(999_999_999));

    // idempotent: a second run reports nothing new for our fixtures
    const again = await request.post("/api/cron/daily", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(again.ok()).toBe(true);

    await db().project.delete({ where: { id: project.id } });
  });
});
