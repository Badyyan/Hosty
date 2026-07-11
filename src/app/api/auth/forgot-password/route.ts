import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, json } from "@/lib/api";
import { randomToken, sha256 } from "@/lib/security";
import { sendMail, emailShell } from "@/lib/mailer";
import { config } from "@/lib/config";

const schema = z.object({ email: z.string().email() });

export const POST = apiHandler(
  async (req) => {
    const { email } = schema.parse(await req.json());
    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Always return 200 — never reveal whether an email exists.
    if (user) {
      const token = randomToken();
      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const url = `${config.appUrl}/reset-password?token=${token}`;
      await sendMail(
        user.email,
        "Reset your Hosty password",
        emailShell(
          "Reset your password",
          `<p>Click the link below to choose a new password. This link expires in 1 hour.</p>
           <p><a href="${url}">${url}</a></p>
           <p>If you didn't request this, you can safely ignore this email.</p>`
        )
      );
    }
    return json({ ok: true });
  },
  { limit: { n: 5, windowSeconds: 300, key: "forgot" } }
);
