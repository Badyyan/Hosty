import { apiHandler, json } from "@/lib/api";
import { authenticateApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { getUserPlan } from "@/lib/plans";

export const GET = apiHandler(
  async (req) => {
    const ctx = await authenticateApiKey(req, "read");
    const [user, plan, projects] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
      getUserPlan(ctx.userId),
      db.project.count({ where: { userId: ctx.userId } }),
    ]);
    return json({
      email: user.email,
      name: user.name,
      plan: plan.tier,
      usage: {
        projects,
        maxProjects: plan.maxProjects,
        storageBytes: Number(user.storageUsed),
        maxStorageBytes: plan.maxStorageBytes,
      },
    });
  },
  { public: true }
);
