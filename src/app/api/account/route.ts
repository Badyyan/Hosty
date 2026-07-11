import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserPlan } from "@/lib/plans";

/** Current account: profile, plan, usage — powers the usage dashboard. */
export const GET = apiHandler(async () => {
  const userId = await requireUserId();
  const [user, plan, projectCount] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { subscription: true },
    }),
    getUserPlan(userId),
    db.project.count({ where: { userId } }),
  ]);
  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      twoFactorEnabled: user.twoFactorEnabled,
    },
    plan: {
      tier: plan.tier,
      label: plan.label,
      maxProjects: plan.maxProjects,
      maxUploadBytes: plan.maxUploadBytes,
      maxStorageBytes: plan.maxStorageBytes,
      customDomains: plan.customDomains,
      passwordProtection: plan.passwordProtection,
      removeBranding: plan.removeBranding,
      teams: plan.teams,
      status: user.subscription?.status ?? "active",
      currentPeriodEnd: user.subscription?.currentPeriodEnd ?? null,
    },
    usage: {
      projects: projectCount,
      storageBytes: Number(user.storageUsed),
    },
  });
});
