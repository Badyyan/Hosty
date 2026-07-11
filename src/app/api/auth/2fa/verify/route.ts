import { z } from "zod";
import { authenticator } from "otplib";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { sha256 } from "@/lib/security";

const schema = z.object({ code: z.string().min(6).max(8) });

/** Confirm enrollment with a valid TOTP code; returns recovery codes once. */
export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const { code } = schema.parse(await req.json());
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorSecret) throw new ApiError(400, "Run 2FA setup first.");

  const ok = authenticator.verify({
    token: code.replace(/\s/g, ""),
    secret: decryptSecret(user.twoFactorSecret),
  });
  if (!ok) throw new ApiError(400, "Invalid code — try again.");

  const recoveryCodes = Array.from({ length: 10 }, () =>
    randomBytes(5).toString("hex")
  );
  await db.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, recoveryCodes: recoveryCodes.map(sha256) },
  });
  return json({ enabled: true, recoveryCodes });
});
