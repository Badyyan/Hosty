import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { db, testCreds, setPlan } from "./db";

/**
 * Billing integration: exercises the real /api/stripe/webhook handler with
 * properly-signed payloads (Stripe's t=…,v1=hmac(secret, `${t}.${body}`)
 * scheme) — no Stripe account needed.
 */

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_test_secret";
const PRICE_PRO = process.env.STRIPE_PRICE_PRO_MONTHLY ?? "price_e2e_pro";

function signedHeaders(body: string) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${body}`).digest("hex");
  return { "Stripe-Signature": `t=${t},v1=${v1}`, "Content-Type": "application/json" };
}

function subscriptionEvent(userId: string, opts: { deleted?: boolean } = {}) {
  return JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: "event",
    type: opts.deleted ? "customer.subscription.deleted" : "customer.subscription.updated",
    data: {
      object: {
        id: "sub_e2e_1",
        object: "subscription",
        customer: "cus_e2e_1",
        status: opts.deleted ? "canceled" : "active",
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        metadata: { userId },
        items: { data: [{ price: { id: PRICE_PRO } }] },
      },
    },
  });
}

test.describe("Stripe billing webhook", () => {
  test.beforeAll(async () => {
    await setPlan(testCreds().email, "FREE"); // start from the free tier
  });

  test("rejects an unsigned or badly-signed payload", async ({ request }) => {
    const user = await db().user.findUniqueOrThrow({ where: { email: testCreds().email } });
    const body = subscriptionEvent(user.id);

    const unsigned = await request.post("/api/stripe/webhook", {
      headers: { "Content-Type": "application/json" },
      data: body,
    });
    expect(unsigned.status()).toBe(400);

    const badSig = await request.post("/api/stripe/webhook", {
      headers: { "Stripe-Signature": "t=1,v1=deadbeef", "Content-Type": "application/json" },
      data: body,
    });
    expect(badSig.status()).toBe(400);
  });

  test("signed subscription.updated upgrades the plan; deleted downgrades", async ({
    request,
    page,
  }) => {
    const user = await db().user.findUniqueOrThrow({ where: { email: testCreds().email } });

    // upgrade
    const body = subscriptionEvent(user.id);
    const res = await request.post("/api/stripe/webhook", {
      headers: signedHeaders(body),
      data: body,
    });
    expect(res.ok()).toBe(true);

    const account = await (await request.get("/api/account")).json();
    expect(account.plan.tier).toBe("PRO");

    // billing page reflects it
    await page.goto("/dashboard/billing");
    await expect(page.getByText("Current plan: Pro")).toBeVisible();

    // cancellation downgrades back to FREE
    const delBody = subscriptionEvent(user.id, { deleted: true });
    const del = await request.post("/api/stripe/webhook", {
      headers: signedHeaders(delBody),
      data: delBody,
    });
    expect(del.ok()).toBe(true);
    const after = await (await request.get("/api/account")).json();
    expect(after.plan.tier).toBe("FREE");
  });
});
