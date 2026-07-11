import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

export const DELETE = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const endpoint = await db.webhookEndpoint.findFirst({ where: { id: params.id, userId } });
  if (!endpoint) throw new ApiError(404, "Webhook not found");
  await db.webhookEndpoint.delete({ where: { id: endpoint.id } });
  return json({ deleted: true });
});
