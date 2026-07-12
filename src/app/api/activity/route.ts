import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

/** Recent activity: the user's own actions plus their teams' audit trails. */
export const GET = apiHandler(async (req) => {
  const userId = await requireUserId();
  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 50)));

  const teamIds = (
    await db.teamMember.findMany({ where: { userId }, select: { teamId: true } })
  ).map((m) => m.teamId);

  const entries = await db.activityLog.findMany({
    where: {
      OR: [{ userId }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { name: true, email: true } },
      team: { select: { name: true } },
    },
  });

  return json({
    activity: entries.map((e) => ({
      id: e.id,
      action: e.action,
      targetId: e.targetId,
      metadata: e.metadata,
      actor: e.user?.name ?? e.user?.email ?? "System",
      team: e.team?.name ?? null,
      createdAt: e.createdAt,
    })),
  });
});
