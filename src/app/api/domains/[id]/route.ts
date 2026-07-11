import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const record = await db.customDomain.findFirst({ where: { id: params.id, userId } });
  if (!record) throw new ApiError(404, "Domain not found");
  await db.customDomain.delete({ where: { id: record.id } });
  await getRedis()?.del(`site:@${record.domain}`).catch(() => {});
  return json({ deleted: true });
});
