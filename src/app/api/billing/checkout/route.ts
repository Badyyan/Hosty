import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, priceIdForPlan } from "@/lib/stripe";
import { config } from "@/lib/config";

const schema = z.object({ plan: z.enum(["PRO", "BUSINESS"]) });

/** Create a Stripe Checkout session for a plan upgrade. */
export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const { plan } = schema.parse(await req.json());
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { subscription: true },
  });

  let customerId = user.subscription?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: user.email,
      metadata: { userId },
    });
    customerId = customer.id;
    await db.subscription.upsert({
      where: { userId },
      update: { stripeCustomerId: customerId },
      create: { userId, stripeCustomerId: customerId, plan: "FREE" },
    });
  }

  const session = await stripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
    success_url: `${config.appUrl}/dashboard/billing?upgraded=1`,
    cancel_url: `${config.appUrl}/dashboard/billing`,
    metadata: { userId },
    subscription_data: { metadata: { userId } },
  });
  return json({ url: session.url });
});
