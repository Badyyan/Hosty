import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { deploy } from "@/lib/deployments";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

const EDITABLE = /\.(html?|css|m?js|json|txt|md|markdown|svg|xml|webmanifest)$/i;
const MAX_EDITABLE_BYTES = 2 * 1024 * 1024;

/** Editor: read a file's text content from the active deployment. */
export const GET = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "VIEWER");
  if (!project.activeDeploymentId) throw new ApiError(404, "No deployment");

  const path = new URL(req.url).searchParams.get("path") ?? "";
  const file = await db.projectFile.findUnique({
    where: { deploymentId_path: { deploymentId: project.activeDeploymentId, path } },
  });
  if (!file) throw new ApiError(404, "File not found");
  if (!EDITABLE.test(path) || file.size > MAX_EDITABLE_BYTES) {
    throw new ApiError(422, "This file can't be edited in the browser.");
  }

  const object = await getObject(file.storageKey);
  if (!object) throw new ApiError(404, "File content missing");
  const chunks: Buffer[] = [];
  for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
  return json({ path, content: Buffer.concat(chunks).toString("utf8") });
});

const saveSchema = z.object({
  path: z.string().min(1).max(512),
  content: z.string().max(MAX_EDITABLE_BYTES),
});

/**
 * Editor save: creates a NEW deployment where the edited file replaces the
 * old one and all other files are carried over (copy-on-write versioning).
 */
export const PUT = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "EDITOR");
  if (!project.activeDeploymentId) throw new ApiError(404, "No deployment");
  const input = saveSchema.parse(await req.json());
  if (!EDITABLE.test(input.path)) throw new ApiError(422, "Not an editable file type.");

  const files = await db.projectFile.findMany({
    where: { deploymentId: project.activeDeploymentId },
  });
  const exists = files.some((f) => f.path === input.path);
  if (!exists) throw new ApiError(404, "File not found in the current version.");

  // Load every file's bytes; swap in the edited content.
  const nextFiles = await Promise.all(
    files.map(async (f) => {
      if (f.path === input.path) {
        return { path: f.path, data: Buffer.from(input.content, "utf8") };
      }
      const obj = await getObject(f.storageKey);
      if (!obj) throw new ApiError(500, `Missing object for ${f.path}`);
      const chunks: Buffer[] = [];
      for await (const chunk of obj.body) chunks.push(Buffer.from(chunk));
      return { path: f.path, data: Buffer.concat(chunks) };
    })
  );

  const result = await deploy({
    userId,
    projectId: project.id,
    files: nextFiles,
    source: "editor",
  });
  return json({ deploymentId: result.deploymentId, saved: input.path });
});
