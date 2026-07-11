import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/security";
import { logActivity } from "@/lib/activity";

const schema = z.object({ token: z.string().min(10) });

export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const { token } = schema.parse(await req.json());

  const invite = await db.teamInvite.findUnique({ where: { tokenHash: sha256(token) } });
  if (!invite || invite.expiresAt < new Date()) {
    throw new ApiError(400, "This invitation is invalid or has expired.");
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new ApiError(403, "This invitation was sent to a different email address.");
  }

  await db.$transaction([
    db.teamMember.upsert({
      where: { teamId_userId: { teamId: invite.teamId, userId } },
      update: { role: invite.role },
      create: { teamId: invite.teamId, userId, role: invite.role },
    }),
    db.teamInvite.delete({ where: { id: invite.id } }),
  ]);
  void logActivity({ userId, teamId: invite.teamId, action: "team.joined" });
  return json({ teamId: invite.teamId });
});
