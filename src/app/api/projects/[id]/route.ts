import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { deleteProject, invalidateSiteCache } from "@/lib/deployments";
import { getUserPlan } from "@/lib/plans";
import { isValidSlug } from "@/lib/slugs";
import { siteUrl } from "@/lib/config";

type Ctx = { params: { id: string } };

export const GET = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "VIEWER");
  const full = await db.project.findUniqueOrThrow({
    where: { id: project.id },
    include: {
      activeDeployment: { include: { files: { orderBy: { path: "asc" } } } },
      customDomains: true,
      shortLinks: true,
    },
  });
  return json({
    project: {
      id: full.id,
      name: full.name,
      slug: full.slug,
      type: full.type,
      url: siteUrl(full.slug),
      hasPassword: Boolean(full.passwordHash),
      emailGate: full.emailGate,
      feedbackEnabled: full.feedbackEnabled,
      pdfDownloadable: full.pdfDownloadable,
      removeBranding: full.removeBranding,
      spaFallback: full.spaFallback,
      seoTitle: full.seoTitle,
      seoDescription: full.seoDescription,
      createdAt: full.createdAt,
      updatedAt: full.updatedAt,
      deployment: full.activeDeployment
        ? {
            id: full.activeDeployment.id,
            version: full.activeDeployment.version,
            createdAt: full.activeDeployment.createdAt,
            files: full.activeDeployment.files.map((f) => ({
              path: f.path,
              size: f.size,
              contentType: f.contentType,
            })),
          }
        : null,
      domains: full.customDomains.map((d) => ({
        id: d.id,
        domain: d.domain,
        status: d.status,
      })),
      shortLinks: full.shortLinks.map((s) => ({ code: s.code, clicks: s.clicks })),
    },
  });
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().max(63).optional(),
  password: z.string().max(200).nullish(), // string = set, null = remove
  emailGate: z.boolean().optional(),
  feedbackEnabled: z.boolean().optional(),
  pdfDownloadable: z.boolean().optional(),
  removeBranding: z.boolean().optional(),
  spaFallback: z.boolean().optional(),
  seoTitle: z.string().max(160).nullish(),
  seoDescription: z.string().max(300).nullish(),
});

export const PATCH = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "ADMIN");
  const input = patchSchema.parse(await req.json());
  const plan = await getUserPlan(userId);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();

  if (input.slug !== undefined && input.slug !== project.slug) {
    const slug = input.slug.toLowerCase().trim();
    if (!isValidSlug(slug)) throw new ApiError(422, "Invalid or reserved subdomain.");
    const taken = await db.project.findUnique({ where: { slug } });
    if (taken) throw new ApiError(409, "That subdomain is already taken.");
    data.slug = slug;
  }

  if (input.password !== undefined) {
    if (input.password) {
      if (!plan.passwordProtection) {
        throw new ApiError(402, "Password protection requires a paid plan.");
      }
      data.passwordHash = await bcrypt.hash(input.password, 12);
    } else {
      data.passwordHash = null;
    }
    data.passwordVersion = { increment: 1 };
  }

  if (input.emailGate !== undefined) {
    if (input.emailGate && !plan.emailCapture) {
      throw new ApiError(402, "Email capture requires a paid plan.");
    }
    data.emailGate = input.emailGate;
  }
  if (input.removeBranding !== undefined) {
    if (input.removeBranding && !plan.removeBranding) {
      throw new ApiError(402, "Branding removal requires a paid plan.");
    }
    data.removeBranding = input.removeBranding;
  }
  for (const key of ["feedbackEnabled", "pdfDownloadable", "spaFallback"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;

  const updated = await db.project.update({ where: { id: project.id }, data });
  await invalidateSiteCache(project.slug);
  if (updated.slug !== project.slug) await invalidateSiteCache(updated.slug);
  return json({ project: { id: updated.id, slug: updated.slug, url: siteUrl(updated.slug) } });
});

export const DELETE = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "ADMIN");
  await deleteProject(project.id, project.userId ?? userId);
  return json({ deleted: true });
});
