import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { assertTeamRole } from "@/lib/access";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

type Ctx = { params: { id: string; memberId: string } };

const patchSchema = z.object({ role: z.enum(["ADMIN", "EDITOR", "VIEWER"]) });

export const PATCH = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  await assertTeamRole(userId, params.id, "ADMIN");
  const { role } = patchSchema.parse(await req.json());

  const member = await db.teamMember.findFirst({
    where: { id: params.memberId, teamId: params.id },
  });
  if (!member) throw new ApiError(404, "Member not found");
  if (member.role === "OWNER") throw new ApiError(403, "The owner's role can't be changed.");

  await db.teamMember.update({ where: { id: member.id }, data: { role } });
  void logActivity({ userId, teamId: params.id, action: "team.role_changed", targetId: member.userId });
  return json({ ok: true });
});

export const DELETE = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const member = await db.teamMember.findFirst({
    where: { id: params.memberId, teamId: params.id },
  });
  if (!member) throw new ApiError(404, "Member not found");

  // Members may remove themselves; otherwise admin required.
  if (member.userId !== userId) await assertTeamRole(userId, params.id, "ADMIN");
  if (member.role === "OWNER") throw new ApiError(403, "The owner can't be removed.");

  await db.teamMember.delete({ where: { id: member.id } });
  void logActivity({ userId, teamId: params.id, action: "team.member_removed", targetId: member.userId });
  return json({ deleted: true });
});
