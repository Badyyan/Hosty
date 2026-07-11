import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = apiHandler(async () => {
  const userId = await requireUserId();
  const notifications = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return json({
    notifications,
    unread: notifications.filter((n) => !n.readAt).length,
  });
});

/** Mark all as read. */
export const POST = apiHandler(async () => {
  const userId = await requireUserId();
  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return json({ ok: true });
});
