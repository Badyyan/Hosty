import { apiHandler, json } from "@/lib/api";
import { authenticateApiKey } from "@/lib/api-keys";
import { ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { deploy, prepareUpload, deleteProject } from "@/lib/deployments";
import { siteUrl } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: { id: string } };

async function ownedProject(userId: string, id: string) {
  const project = await db.project.findFirst({ where: { id, userId } });
  if (!project) throw new ApiError(404, "Project not found");
  return project;
}

export const GET = apiHandler<Ctx>(
  async (req, { params }) => {
    const ctx = await authenticateApiKey(req, "read");
    const project = await ownedProject(ctx.userId, params.id);
    const deployment = project.activeDeploymentId
      ? await db.deployment.findUnique({
          where: { id: project.activeDeploymentId },
          include: { files: { select: { path: true, size: true }, orderBy: { path: "asc" } } },
        })
      : null;
    return json({
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        type: project.type,
        url: siteUrl(project.slug),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        deployment: deployment && {
          id: deployment.id,
          version: deployment.version,
          files: deployment.files,
          createdAt: deployment.createdAt,
        },
      },
    });
  },
  { public: true }
);

/** Re-deploy: replace content, keep the URL. */
export const PUT = apiHandler<Ctx>(
  async (req, { params }) => {
    const ctx = await authenticateApiKey(req, "write");
    const project = await ownedProject(ctx.userId, params.id);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Multipart field `file` is required.");

    const { files } = await prepareUpload(file.name, Buffer.from(await file.arrayBuffer()));
    const result = await deploy({
      userId: ctx.userId,
      projectId: project.id,
      files,
      source: "api",
    });
    return json({
      project: {
        id: project.id,
        slug: project.slug,
        url: siteUrl(project.slug),
        deployment: { id: result.deploymentId, files: result.fileCount, bytes: result.totalBytes },
      },
    });
  },
  { public: true }
);

export const DELETE = apiHandler<Ctx>(
  async (req, { params }) => {
    const ctx = await authenticateApiKey(req, "write");
    const project = await ownedProject(ctx.userId, params.id);
    await deleteProject(project.id, ctx.userId);
    return json({ deleted: true });
  },
  { public: true }
);
