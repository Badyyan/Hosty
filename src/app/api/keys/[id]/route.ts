import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const key = await db.apiKey.findFirst({ where: { id: params.id, userId } });
  if (!key) throw new ApiError(404, "Key not found");
  await db.apiKey.delete({ where: { id: key.id } });
  return json({ deleted: true });
});
