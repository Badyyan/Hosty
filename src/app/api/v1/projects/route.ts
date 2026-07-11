import { apiHandler, json } from "@/lib/api";
import { authenticateApiKey } from "@/lib/api-keys";
import { ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { deploy, prepareUpload } from "@/lib/deployments";
import { siteUrl } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Public API: list projects. */
export const GET = apiHandler(
  async (req) => {
    const ctx = await authenticateApiKey(req, "read");
    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim();
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));

    const projects = await db.project.findMany({
      where: {
        userId: ctx.userId,
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { activeDeployment: { select: { version: true, createdAt: true } } },
    });
    return json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        type: p.type,
        url: siteUrl(p.slug),
        version: p.activeDeployment?.version ?? 0,
        updatedAt: p.updatedAt,
      })),
    });
  },
  { public: true }
);

/** Public API: create + deploy a project (multipart `file`). */
export const POST = apiHandler(
  async (req) => {
    const ctx = await authenticateApiKey(req, "write");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Multipart field `file` is required.");

    const { files, type } = await prepareUpload(file.name, Buffer.from(await file.arrayBuffer()));
    const result = await deploy({
      userId: ctx.userId,
      name: typeof form.get("name") === "string" ? String(form.get("name")) : undefined,
      slug: typeof form.get("slug") === "string" ? String(form.get("slug")) : undefined,
      files,
      type,
      source: "api",
    });
    return json(
      {
        project: {
          id: result.project.id,
          name: result.project.name,
          slug: result.project.slug,
          url: siteUrl(result.project.slug),
          deployment: {
            id: result.deploymentId,
            files: result.fileCount,
            bytes: result.totalBytes,
          },
        },
      },
      { status: 201 }
    );
  },
  { public: true }
);
