import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

/** Version history: every deployment ever made (within retention). */
export const GET = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "VIEWER");
  const deployments = await db.deployment.findMany({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
    take: 100,
  });
  return json({
    activeDeploymentId: project.activeDeploymentId,
    versions: deployments.map((d) => ({
      id: d.id,
      version: d.version,
      source: d.source,
      files: d.fileCount,
      bytes: Number(d.totalBytes),
      createdAt: d.createdAt,
      active: d.id === project.activeDeploymentId,
    })),
  });
});
