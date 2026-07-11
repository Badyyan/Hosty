import { authenticator } from "otplib";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

/** Begin 2FA enrollment: generate a TOTP secret + QR code (not yet enabled). */
export const POST = apiHandler(async () => {
  const userId = await requireUserId();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.email, "Hosty", secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });

  // Stored encrypted but NOT enabled until the user confirms a valid code.
  await db.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false },
  });
  return json({ qrDataUrl, secret });
});
