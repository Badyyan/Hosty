import QRCode from "qrcode";
import { apiHandler } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { siteUrl } from "@/lib/config";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/** QR code (PNG) for the project's public URL. */
export const GET = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "VIEWER");
  const size = Math.min(1024, Math.max(128, Number(new URL(req.url).searchParams.get("size") ?? 320)));
  const png = await QRCode.toBuffer(siteUrl(project.slug), {
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${project.slug}-qr.png"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
