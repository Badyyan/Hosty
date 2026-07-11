import type { PlanTier } from "@prisma/client";
import { db } from "./db";

export interface PlanQuota {
  tier: PlanTier;
  label: string;
  priceMonthly: number; // USD
  maxProjects: number;
  maxUploadBytes: number;
  maxStorageBytes: number;
  maxVersionsKept: number;
  customDomains: boolean;
  passwordProtection: boolean;
  removeBranding: boolean;
  teams: boolean;
  emailCapture: boolean;
  analyticsRetentionDays: number;
}

export const PLANS: Record<PlanTier, PlanQuota> = {
  FREE: {
    tier: "FREE",
    label: "Free",
    priceMonthly: 0,
    maxProjects: 3,
    maxUploadBytes: 25 * 1024 * 1024,
    maxStorageBytes: 100 * 1024 * 1024,
    maxVersionsKept: 3,
    customDomains: false,
    passwordProtection: false,
    removeBranding: false,
    teams: false,
    emailCapture: false,
    analyticsRetentionDays: 30,
  },
  PRO: {
    tier: "PRO",
    label: "Pro",
    priceMonthly: 12,
    maxProjects: 25,
    maxUploadBytes: 100 * 1024 * 1024,
    maxStorageBytes: 5 * 1024 * 1024 * 1024,
    maxVersionsKept: 25,
    customDomains: true,
    passwordProtection: true,
    removeBranding: true,
    teams: false,
    emailCapture: true,
    analyticsRetentionDays: 365,
  },
  BUSINESS: {
    tier: "BUSINESS",
    label: "Business",
    priceMonthly: 49,
    maxProjects: 200,
    maxUploadBytes: 1024 * 1024 * 1024,
    maxStorageBytes: 50 * 1024 * 1024 * 1024,
    maxVersionsKept: 100,
    customDomains: true,
    passwordProtection: true,
    removeBranding: true,
    teams: true,
    emailCapture: true,
    analyticsRetentionDays: 730,
  },
};

/** Resolve the effective plan for a user from their subscription row. */
export async function getUserPlan(userId: string): Promise<PlanQuota> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status === "canceled") return PLANS.FREE;
  return PLANS[sub.plan];
}

export class QuotaError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "project_limit"
      | "upload_size"
      | "storage_limit"
      | "feature_locked"
  ) {
    super(message);
    this.name = "QuotaError";
  }
}

export function formatBytes(bytes: number | bigint): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
