import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";

export const GET = apiHandler(async () => {
  const userId = await requireUserId();
  const integrations = await db.emailIntegration.findMany({
    where: { userId },
    select: { id: true, provider: true, listId: true, createdAt: true },
  });
  return json({ integrations });
});

const schema = z.object({
  provider: z.enum(["mailchimp", "convertkit"]),
  apiKey: z.string().min(8).max(200),
  listId: z.string().max(64).optional(),
});

export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const input = schema.parse(await req.json());
  const record = await db.emailIntegration.upsert({
    where: { userId_provider: { userId, provider: input.provider } },
    update: { apiKey: encryptSecret(input.apiKey), listId: input.listId },
    create: {
      userId,
      provider: input.provider,
      apiKey: encryptSecret(input.apiKey),
      listId: input.listId,
    },
  });
  return json({ id: record.id, provider: record.provider }, { status: 201 });
});

export const DELETE = apiHandler(async (req) => {
  const userId = await requireUserId();
  const provider = new URL(req.url).searchParams.get("provider") ?? "";
  await db.emailIntegration.deleteMany({ where: { userId, provider } });
  return json({ deleted: true });
});
