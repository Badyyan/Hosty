import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe, planForPriceId } from "@/lib/stripe";
import { logger, reportError } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Stripe webhook — the single source of truth for subscription state.
 * Signature-verified; idempotent (state is upserted from the event payload).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const signature = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const priceId = sub.items.data[0]?.price.id ?? "";
        const canceled = event.type === "customer.subscription.deleted" || sub.status === "canceled";

        const where = userId ? { userId } : { stripeCustomerId: customerId };
        const existing = await db.subscription.findFirst({ where });
        if (!existing) {
          logger.warn("stripe webhook for unknown subscription", { customerId });
          break;
        }
        await db.subscription.update({
          where: { id: existing.id },
          data: {
            plan: canceled ? "FREE" : planForPriceId(priceId),
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId,
            status: canceled ? "canceled" : sub.status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await db.subscription.updateMany({
            where: { stripeCustomerId: customerId },
            data: { status: "past_due" },
          });
        }
        break;
      }
      default:
        break; // ignore unhandled events
    }
  } catch (err) {
    reportError(err, { stripeEvent: event.type });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
