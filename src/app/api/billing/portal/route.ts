import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { config } from "@/lib/config";

/** Stripe customer portal (manage payment method, cancel, invoices). */
export const POST = apiHandler(async () => {
  const userId = await requireUserId();
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeCustomerId) throw new ApiError(400, "No billing account yet.");

  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${config.appUrl}/dashboard/billing`,
  });
  return json({ url: session.url });
});
