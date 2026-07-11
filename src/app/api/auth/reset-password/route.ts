import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { apiHandler, json } from "@/lib/api";
import { sha256 } from "@/lib/security";
import { ApiError } from "@/lib/auth";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export const POST = apiHandler(
  async (req) => {
    const { token, password } = schema.parse(await req.json());
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ApiError(400, "This reset link is invalid or has expired.");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      db.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // invalidate any other outstanding tokens
      db.passwordResetToken.deleteMany({
        where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      }),
    ]);
    return json({ ok: true });
  },
  { limit: { n: 5, windowSeconds: 300, key: "reset" } }
);
