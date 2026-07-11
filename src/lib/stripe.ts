import Stripe from "stripe";
import type { PlanTier } from "@prisma/client";
import { ApiError } from "./auth";

const globalForStripe = globalThis as unknown as { stripe?: Stripe };

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ApiError(503, "Billing is not configured on this instance.");
  if (!globalForStripe.stripe) {
    globalForStripe.stripe = new Stripe(key, { apiVersion: "2024-04-10" });
  }
  return globalForStripe.stripe;
}

export function priceIdForPlan(plan: PlanTier): string {
  const id =
    plan === "PRO"
      ? process.env.STRIPE_PRICE_PRO_MONTHLY
      : plan === "BUSINESS"
        ? process.env.STRIPE_PRICE_BUSINESS_MONTHLY
        : null;
  if (!id) throw new ApiError(400, "Unknown plan");
  return id;
}

export function planForPriceId(priceId: string): PlanTier {
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return "PRO";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS_MONTHLY) return "BUSINESS";
  return "FREE";
}
