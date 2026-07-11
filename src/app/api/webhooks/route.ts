import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSafeExternalUrl, randomToken } from "@/lib/security";

const EVENTS = [
  "project.created",
  "project.deployed",
  "project.deleted",
  "lead.captured",
  "comment.created",
] as const;

export const GET = apiHandler(async () => {
  const userId = await requireUserId();
  const endpoints = await db.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      deliveries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  return json({
    endpoints: endpoints.map((e) => ({
      id: e.id,
      url: e.url,
      events: e.events,
      active: e.active,
      createdAt: e.createdAt,
      recentDeliveries: e.deliveries.map((d) => ({
        event: d.event,
        statusCode: d.statusCode,
        error: d.error,
        createdAt: d.createdAt,
      })),
    })),
  });
});

const createSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(EVENTS)).min(1),
});

export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const input = createSchema.parse(await req.json());
  if (!isSafeExternalUrl(input.url)) {
    throw new ApiError(422, "Webhook URL must be a public https endpoint.");
  }
  const secret = `whsec_${randomToken(24)}`;
  const endpoint = await db.webhookEndpoint.create({
    data: { userId, url: input.url, events: input.events, secret },
  });
  // secret shown once, used to verify X-Hosty-Signature
  return json({ id: endpoint.id, secret }, { status: 201 });
});
