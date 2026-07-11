import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { shortCode } from "@/lib/slugs";
import { config } from "@/lib/config";

type Ctx = { params: { id: string } };

/** One-click URL shortener: {appUrl}/s/{code} → project. */
export const POST = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "EDITOR");

  const existing = await db.shortLink.findFirst({ where: { projectId: project.id } });
  if (existing) {
    return json({ code: existing.code, url: `${config.appUrl}/s/${existing.code}` });
  }
  const link = await db.shortLink.create({
    data: { projectId: project.id, code: shortCode() },
  });
  return json({ code: link.code, url: `${config.appUrl}/s/${link.code}` }, { status: 201 });
});
