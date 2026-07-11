import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";

const schema = z.object({ password: z.string().min(1) });

export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const { password } = schema.parse(await req.json());
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash) {
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new ApiError(403, "Incorrect password.");
  }
  await db.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: [] },
  });
  return json({ enabled: false });
});
