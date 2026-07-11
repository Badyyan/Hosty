import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { rollback } from "@/lib/deployments";

type Ctx = { params: { id: string; deploymentId: string } };

export const POST = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "EDITOR");
  const target = await rollback(project.id, params.deploymentId, userId);
  return json({ activeDeploymentId: target.id, version: target.version });
});
