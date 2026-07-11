import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateApiKey } from "@/lib/api-keys";

export const GET = apiHandler(async () => {
  const userId = await requireUserId();
  const keys = await db.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, createdAt: true },
  });
  return json({ keys });
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(["read", "write"])).min(1).default(["read", "write"]),
});

export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const input = createSchema.parse(await req.json());
  const { key, hash, prefix } = generateApiKey();
  const record = await db.apiKey.create({
    data: { userId, name: input.name.trim(), keyHash: hash, prefix, scopes: input.scopes },
  });
  // The full key is returned exactly once.
  return json({ id: record.id, key, prefix }, { status: 201 });
});
