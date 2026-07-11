import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/config";

/** List the current user's projects (own + team), with search. */
export const GET = apiHandler(async (req) => {
  const userId = await requireUserId();
  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim();
  const teamIds = (
    await db.teamMember.findMany({ where: { userId }, select: { teamId: true } })
  ).map((m) => m.teamId);

  const projects = await db.project.findMany({
    where: {
      OR: [{ userId }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])],
      ...(search
        ? {
            AND: {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { slug: { contains: search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      activeDeployment: { select: { version: true, totalBytes: true, fileCount: true, createdAt: true } },
      _count: { select: { leads: true, comments: true } },
    },
  });

  return json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      type: p.type,
      url: siteUrl(p.slug),
      updatedAt: p.updatedAt,
      hasPassword: Boolean(p.passwordHash),
      version: p.activeDeployment?.version ?? 0,
      bytes: Number(p.activeDeployment?.totalBytes ?? 0),
      files: p.activeDeployment?.fileCount ?? 0,
      leads: p._count.leads,
      comments: p._count.comments,
    })),
  });
});
