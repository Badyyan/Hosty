import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserPlan } from "@/lib/plans";
import { slugify, slugWithSuffix } from "@/lib/slugs";
import { logActivity } from "@/lib/activity";

export const GET = apiHandler(async () => {
  const userId = await requireUserId();
  const memberships = await db.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: {
          members: { include: { user: { select: { name: true, email: true, image: true } } } },
          _count: { select: { projects: true } },
        },
      },
    },
  });
  return json({
    teams: memberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      slug: m.team.slug,
      role: m.role,
      projects: m.team._count.projects,
      members: m.team.members.map((mm) => ({
        id: mm.id,
        role: mm.role,
        name: mm.user.name,
        email: mm.user.email,
        image: mm.user.image,
      })),
    })),
  });
});

const createSchema = z.object({ name: z.string().min(2).max(80) });

export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const plan = await getUserPlan(userId);
  if (!plan.teams) throw new ApiError(402, "Teams require the Business plan.");

  const { name } = createSchema.parse(await req.json());
  const base = slugify(name) || "team";
  const team = await db.team.create({
    data: {
      name: name.trim(),
      slug: slugWithSuffix(base),
      members: { create: { userId, role: "OWNER" } },
    },
  });
  void logActivity({ userId, teamId: team.id, action: "team.created" });
  return json({ id: team.id, slug: team.slug }, { status: 201 });
});
