import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { assertTeamRole } from "@/lib/access";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security";
import { sendMail, emailShell } from "@/lib/mailer";
import { config } from "@/lib/config";
import { logActivity, notify } from "@/lib/activity";

type Ctx = { params: { id: string } };

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]).default("EDITOR"),
});

export const POST = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  await assertTeamRole(userId, params.id, "ADMIN");
  const input = inviteSchema.parse(await req.json());
  const email = input.email.toLowerCase().trim();

  const token = randomToken();
  await db.teamInvite.create({
    data: {
      teamId: params.id,
      email,
      role: input.role,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });

  const team = await db.team.findUniqueOrThrow({ where: { id: params.id } });
  const url = `${config.appUrl}/invite?token=${token}`;
  await sendMail(
    email,
    `You've been invited to ${team.name} on Hosty`,
    emailShell(
      `Join ${team.name}`,
      `<p>You've been invited to collaborate on <strong>${team.name}</strong> as ${input.role.toLowerCase()}.</p>
       <p><a href="${url}">Accept the invitation</a> (expires in 7 days).</p>`
    )
  );

  // If the invitee already has an account, drop an in-app notification too.
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    void notify(existing.id, "invite", `Invitation to join ${team.name}`, {
      href: `/invite?token=${token}`,
    });
  }
  void logActivity({ userId, teamId: params.id, action: "team.invited", metadata: { email } });
  return json({ ok: true }, { status: 201 });
});
