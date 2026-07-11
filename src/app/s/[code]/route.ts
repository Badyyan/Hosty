import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/config";

export const runtime = "nodejs";

/** Short link redirect: /s/{code} → the project's public URL. */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const link = await db.shortLink.findUnique({
    where: { code: params.code },
    include: { project: { select: { slug: true } } },
  });
  if (!link) return new NextResponse("Not found", { status: 404 });

  db.shortLink
    .update({ where: { id: link.id }, data: { clicks: { increment: 1 } } })
    .catch(() => {});

  const target = new URL(link.targetPath, siteUrl(link.project.slug));
  return NextResponse.redirect(target, 302);
}
