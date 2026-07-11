import { db } from "./db";
import { PLANS } from "./plans";
import { deletePrefix } from "./storage";
import { logger } from "./logger";

/**
 * Scheduled maintenance. Idempotent by design — safe to re-run and safe to
 * run concurrently at low frequency. Triggered by POST /api/cron/daily
 * (EventBridge/Cloud Scheduler/crontab hitting it with CRON_SECRET).
 */

export interface JobReport {
  analyticsEventsPurged: number;
  deploymentsPruned: number;
  storageAccountsReconciled: number;
  expiredTokensDeleted: number;
  expiredInvitesDeleted: number;
}

export async function runDailyMaintenance(): Promise<JobReport> {
  const report: JobReport = {
    analyticsEventsPurged: 0,
    deploymentsPruned: 0,
    storageAccountsReconciled: 0,
    expiredTokensDeleted: 0,
    expiredInvitesDeleted: 0,
  };

  report.analyticsEventsPurged = await purgeExpiredAnalytics();
  report.deploymentsPruned = await pruneExcessDeployments();
  report.storageAccountsReconciled = await reconcileStorageCounters();
  report.expiredTokensDeleted = (
    await db.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
    })
  ).count;
  report.expiredInvitesDeleted = (
    await db.teamInvite.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  ).count;

  logger.info("daily maintenance complete", { ...report });
  return report;
}

/** Delete analytics events past each owner's plan retention window. */
async function purgeExpiredAnalytics(): Promise<number> {
  let purged = 0;
  for (const plan of Object.values(PLANS)) {
    const cutoff = new Date(Date.now() - plan.analyticsRetentionDays * 86400_000);
    // Personal projects owned by users on this plan tier. FREE also covers
    // users with no subscription row (they default to FREE at read time).
    const where =
      plan.tier === "FREE"
        ? {
            OR: [
              { user: { subscription: null } },
              { user: { subscription: { plan: plan.tier } } },
            ],
          }
        : { user: { subscription: { plan: plan.tier, status: { not: "canceled" } } } };

    const result = await db.analyticsEvent.deleteMany({
      where: { createdAt: { lt: cutoff }, project: where },
    });
    purged += result.count;
  }
  return purged;
}

/**
 * Retention safety net: deployments beyond the plan's version cap are pruned
 * eagerly at deploy time, but plan downgrades can leave excess history.
 */
async function pruneExcessDeployments(): Promise<number> {
  let pruned = 0;
  const projects = await db.project.findMany({
    where: { userId: { not: null } },
    select: {
      id: true,
      activeDeploymentId: true,
      userId: true,
      user: { select: { subscription: { select: { plan: true, status: true } } } },
    },
  });

  for (const project of projects) {
    const sub = project.user?.subscription;
    const plan = sub && sub.status !== "canceled" ? PLANS[sub.plan] : PLANS.FREE;
    const deployments = await db.deployment.findMany({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
    });
    const excess = deployments
      .slice(plan.maxVersionsKept)
      .filter((d) => d.id !== project.activeDeploymentId);

    for (const d of excess) {
      await deletePrefix(`sites/${project.id}/${d.id}/`);
      await db.deployment.delete({ where: { id: d.id } });
      if (project.userId) {
        await db.user.update({
          where: { id: project.userId },
          data: { storageUsed: { decrement: d.totalBytes } },
        });
      }
      pruned++;
    }
  }
  return pruned;
}

/**
 * Self-healing storage accounting: recompute each user's storageUsed from
 * the ground truth (sum of their projects' deployment sizes) and fix drift.
 */
async function reconcileStorageCounters(): Promise<number> {
  let fixed = 0;
  const users = await db.user.findMany({ select: { id: true, storageUsed: true } });
  for (const user of users) {
    const actual = await db.deployment.aggregate({
      where: { project: { userId: user.id } },
      _sum: { totalBytes: true },
    });
    const truth = actual._sum.totalBytes ?? BigInt(0);
    if (truth !== user.storageUsed) {
      await db.user.update({ where: { id: user.id }, data: { storageUsed: truth } });
      fixed++;
    }
  }
  return fixed;
}
