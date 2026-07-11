import { db } from "./db";
import { decryptSecret } from "./crypto";
import { logger } from "./logger";
import { dispatchWebhooks } from "./webhooks";

/**
 * Lead forwarding: whenever a lead is captured we forward it to the owner's
 * connected email marketing tools (Mailchimp / ConvertKit) and fire the
 * `lead.captured` webhook. All forwarding is best-effort and async.
 */

export async function forwardLead(
  ownerUserId: string,
  lead: { email: string; name?: string | null; projectId: string; projectName?: string }
): Promise<void> {
  void dispatchWebhooks(ownerUserId, "lead.captured", {
    email: lead.email,
    name: lead.name ?? null,
    projectId: lead.projectId,
  });

  const integrations = await db.emailIntegration.findMany({ where: { userId: ownerUserId } });
  await Promise.allSettled(
    integrations.map(async (integration) => {
      const apiKey = decryptSecret(integration.apiKey);
      try {
        if (integration.provider === "mailchimp") {
          await pushToMailchimp(apiKey, integration.listId, lead);
        } else if (integration.provider === "convertkit") {
          await pushToConvertKit(apiKey, integration.listId, lead);
        }
      } catch (err) {
        logger.warn("lead forwarding failed", {
          provider: integration.provider,
          err: String(err),
        });
      }
    })
  );
}

async function pushToMailchimp(
  apiKey: string,
  listId: string | null,
  lead: { email: string; name?: string | null }
) {
  if (!listId) return;
  const dc = apiKey.split("-").pop(); // mailchimp keys end in the datacenter
  await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: lead.email,
      status: "subscribed",
      merge_fields: lead.name ? { FNAME: lead.name } : undefined,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

async function pushToConvertKit(
  apiKey: string,
  formId: string | null,
  lead: { email: string; name?: string | null }
) {
  if (!formId) return;
  await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, email: lead.email, first_name: lead.name }),
    signal: AbortSignal.timeout(10_000),
  });
}
