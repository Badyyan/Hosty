import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { getUserPlan } from "@/lib/plans";
import { randomToken } from "@/lib/security";
import { config } from "@/lib/config";

export const GET = apiHandler(async () => {
  const userId = await requireUserId();
  const domains = await db.customDomain.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { project: { select: { name: true, slug: true } } },
  });
  return json({
    domains: domains.map((d) => ({
      id: d.id,
      domain: d.domain,
      status: d.status,
      verificationToken: d.verificationToken,
      cnameTarget: `domains.${config.rootDomain.split(":")[0]}`,
      project: d.project,
      createdAt: d.createdAt,
    })),
  });
});

const createSchema = z.object({
  domain: z
    .string()
    .max(253)
    .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i, "Invalid domain"),
  projectId: z.string(),
});

export const POST = apiHandler(async (req) => {
  const userId = await requireUserId();
  const plan = await getUserPlan(userId);
  if (!plan.customDomains) {
    throw new ApiError(402, "Custom domains require a paid plan.");
  }
  const input = createSchema.parse(await req.json());
  await assertProjectAccess(userId, input.projectId, "ADMIN");

  const domain = input.domain.toLowerCase();
  const rootHost = config.rootDomain.split(":")[0];
  if (domain === rootHost || domain.endsWith(`.${rootHost}`)) {
    throw new ApiError(422, "That domain is managed by Hosty already.");
  }

  const existing = await db.customDomain.findUnique({ where: { domain } });
  if (existing) throw new ApiError(409, "This domain is already connected.");

  const record = await db.customDomain.create({
    data: {
      domain,
      projectId: input.projectId,
      userId,
      verificationToken: `hosty-verify=${randomToken(16)}`,
    },
  });
  return json(
    {
      id: record.id,
      domain: record.domain,
      status: record.status,
      instructions: {
        txt: { host: `_hosty.${domain}`, value: record.verificationToken },
        cname: { host: domain, value: `domains.${rootHost}` },
      },
    },
    { status: 201 }
  );
});
