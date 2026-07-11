import { createHmac } from "crypto";
import { db } from "./db";
import { logger } from "./logger";

/**
 * Webhook dispatcher: HMAC-signed deliveries with 3 retries (exponential
 * backoff). Fire-and-forget from request handlers; a dedicated queue
 * (SQS/BullMQ) is the drop-in upgrade at scale — the interface stays the same.
 */

export type WebhookEvent =
  | "project.created"
  | "project.deployed"
  | "project.deleted"
  | "lead.captured"
  | "comment.created";

export async function dispatchWebhooks(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const endpoints = await db.webhookEndpoint.findMany({
      where: { userId, active: true, events: { has: event } },
    });
    await Promise.allSettled(endpoints.map((ep) => deliver(ep.id, ep.url, ep.secret, event, data)));
  } catch (err) {
    logger.warn("webhook dispatch failed", { event, err: String(err) });
  }
}

async function deliver(
  endpointId: string,
  url: string,
  secret: string,
  event: WebhookEvent,
  data: Record<string, unknown>
) {
  const payload = { event, data, timestamp: new Date().toISOString() };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  let statusCode: number | null = null;
  let error: string | null = null;
  let attempts = 0;

  for (const delayMs of [0, 2000, 8000]) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    attempts++;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hosty-Event": event,
          "X-Hosty-Signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = res.status;
      if (res.ok) {
        error = null;
        break;
      }
      error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  await db.webhookDelivery.create({
    data: { endpointId, event, payload, statusCode, error, attempts },
  });
}
