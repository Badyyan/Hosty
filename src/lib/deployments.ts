import { createHash } from "crypto";
import type { Project, ProjectType } from "@prisma/client";
import { db } from "./db";
import {
  deploymentKey,
  putObject,
  deletePrefix,
  copyObject,
  deleteObject,
  headObjectSize,
} from "./storage";
import { contentTypeFor, isAllowedFile, projectTypeForFile } from "./mime";
import { extractZip, findIndexPath, type ExtractedFile } from "./zip";
import { scanBuffer } from "./scanner";
import { getUserPlan, QuotaError, formatBytes, type PlanQuota } from "./plans";
import { slugCandidate, slugWithSuffix, isValidSlug } from "./slugs";
import { ApiError } from "./auth";
import { getRedis } from "./redis";
import { dispatchWebhooks } from "./webhooks";
import { logActivity } from "./activity";

/**
 * Deployment service — the heart of the platform.
 *
 * Every publish (upload, editor save, API deploy, rollback) creates an
 * immutable Deployment with its own S3 prefix, then atomically flips
 * `project.activeDeploymentId`. See docs/storage.md.
 */

export interface DeployInput {
  userId: string;
  /** Existing project to re-deploy into; omit to create a new one. */
  projectId?: string;
  name?: string;
  slug?: string;
  teamId?: string | null;
  files: ExtractedFile[];
  type?: ProjectType;
  source?: string;
}

export interface DeployResult {
  project: Project;
  deploymentId: string;
  fileCount: number;
  totalBytes: number;
}

/** Turn a raw upload (zip or single file) into deployable files + type. */
export async function prepareUpload(
  filename: string,
  data: Buffer
): Promise<{ files: ExtractedFile[]; type: ProjectType }> {
  await scanBuffer(data, filename);
  const safeName = filename.split(/[\\/]/).pop() || "file";
  if (!isAllowedFile(safeName)) {
    throw new ApiError(422, `File type not supported: ${safeName}`);
  }
  if (safeName.toLowerCase().endsWith(".zip")) {
    return { files: extractZip(data), type: "SITE" };
  }
  // single-file upload: html/pdf/image/doc served at root
  return {
    files: [{ path: safeName, data }],
    type: projectTypeForFile(safeName),
  };
}

export async function deploy(input: DeployInput): Promise<DeployResult> {
  const plan = await getUserPlan(input.userId);
  const totalBytes = input.files.reduce((sum, f) => sum + f.data.length, 0);
  enforceUploadQuota(plan, totalBytes);

  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (Number(user.storageUsed) + totalBytes > plan.maxStorageBytes) {
    throw new QuotaError(
      `Storage limit reached (${formatBytes(plan.maxStorageBytes)} on the ${plan.label} plan).`,
      "storage_limit"
    );
  }

  let project: Project;
  let isNew = false;
  if (input.projectId) {
    project = await db.project.findUniqueOrThrow({ where: { id: input.projectId } });
  } else {
    const projectCount = await db.project.count({ where: { userId: input.userId } });
    if (projectCount >= plan.maxProjects) {
      throw new QuotaError(
        `Project limit reached (${plan.maxProjects} on the ${plan.label} plan).`,
        "project_limit"
      );
    }
    project = await createProject(input);
    isNew = true;
  }

  // next version number
  const last = await db.deployment.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  const deployment = await db.deployment.create({
    data: {
      projectId: project.id,
      version,
      source: input.source ?? "upload",
      totalBytes: BigInt(totalBytes),
      fileCount: input.files.length,
    },
  });

  // Upload objects first (deployment is invisible until the pointer flips).
  await Promise.all(
    input.files.map((f) =>
      putObject(
        deploymentKey(project.id, deployment.id, f.path),
        f.data,
        contentTypeFor(f.path)
      )
    )
  );

  const fileRows = input.files.map((f) => ({
    deploymentId: deployment.id,
    path: f.path,
    size: f.data.length,
    contentType: contentTypeFor(f.path),
    storageKey: deploymentKey(project.id, deployment.id, f.path),
    hash: createHash("sha256").update(f.data).digest("hex"),
  }));

  const [, updatedProject] = await db.$transaction([
    db.projectFile.createMany({ data: fileRows }),
    db.project.update({
      where: { id: project.id },
      data: { activeDeploymentId: deployment.id },
    }),
    db.user.update({
      where: { id: input.userId },
      data: { storageUsed: { increment: totalBytes } },
    }),
  ]);

  await invalidateSiteCache(updatedProject.slug);
  pruneOldDeployments(project.id, input.userId, plan).catch(() => {});

  void dispatchWebhooks(input.userId, isNew ? "project.created" : "project.deployed", {
    projectId: project.id,
    slug: updatedProject.slug,
    deploymentId: deployment.id,
    version,
    files: input.files.length,
    bytes: totalBytes,
  });
  void logActivity({
    userId: input.userId,
    teamId: project.teamId,
    action: isNew ? "project.created" : "project.deployed",
    targetId: project.id,
    metadata: { version, files: input.files.length },
  });

  return {
    project: updatedProject,
    deploymentId: deployment.id,
    fileCount: input.files.length,
    totalBytes,
  };
}

function enforceUploadQuota(plan: PlanQuota, totalBytes: number) {
  if (totalBytes > plan.maxUploadBytes) {
    throw new QuotaError(
      `Upload exceeds the ${formatBytes(plan.maxUploadBytes)} limit on the ${plan.label} plan.`,
      "upload_size"
    );
  }
}

async function createProject(input: DeployInput): Promise<Project> {
  const requested = input.slug?.trim().toLowerCase();
  if (requested && !isValidSlug(requested)) {
    throw new ApiError(422, "Invalid or reserved subdomain.");
  }
  const type =
    input.type ??
    (input.files.length > 1
      ? "SITE"
      : projectTypeForFile(input.files[0]?.path ?? "index.html"));
  const name = input.name?.trim() || input.files[0]?.path.split("/")[0] || "Untitled";

  const base = requested || slugCandidate(name);
  // retry with a random suffix on slug collision
  for (const candidate of [base, slugWithSuffix(base), slugWithSuffix(base)]) {
    try {
      return await db.project.create({
        data: {
          name,
          slug: candidate,
          type,
          userId: input.userId,
          teamId: input.teamId ?? null,
        },
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== "P2002") throw err; // not a unique violation
      if (requested) throw new ApiError(409, "That subdomain is already taken.");
    }
  }
  throw new ApiError(409, "Could not allocate a subdomain, please retry.");
}

/**
 * Register a large single-file upload that already lives in S3 staging
 * (browser → S3 presigned multipart, finalized by /api/upload/complete).
 * The object is server-side-copied into an immutable deployment prefix —
 * the bytes never pass through the app tier.
 */
export async function deployStagedFile(input: {
  userId: string;
  stagingKey: string;
  filename: string;
  projectId?: string;
  name?: string;
  slug?: string;
}): Promise<DeployResult> {
  const safeName = input.filename.split(/[\\/]/).pop() || "file";
  if (!isAllowedFile(safeName)) {
    throw new ApiError(422, `File type not supported: ${safeName}`);
  }
  if (safeName.toLowerCase().endsWith(".zip")) {
    // Multi-GB archives would need streaming extraction workers; today the
    // large-file path hosts single files (video, PDF, images, datasets).
    throw new ApiError(422, "ZIP archives use the standard upload (size limits apply).");
  }

  const size = await headObjectSize(input.stagingKey);
  if (size === null) throw new ApiError(404, "Staged upload not found or not finalized.");

  const plan = await getUserPlan(input.userId);
  if (size > plan.maxUploadBytes) {
    await deleteObject(input.stagingKey);
    throw new QuotaError(
      `Upload exceeds the ${formatBytes(plan.maxUploadBytes)} limit on the ${plan.label} plan.`,
      "upload_size"
    );
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (Number(user.storageUsed) + size > plan.maxStorageBytes) {
    await deleteObject(input.stagingKey);
    throw new QuotaError(
      `Storage limit reached (${formatBytes(plan.maxStorageBytes)} on the ${plan.label} plan).`,
      "storage_limit"
    );
  }

  let project: Project;
  let isNew = false;
  if (input.projectId) {
    project = await db.project.findUniqueOrThrow({ where: { id: input.projectId } });
  } else {
    const projectCount = await db.project.count({ where: { userId: input.userId } });
    if (projectCount >= plan.maxProjects) {
      throw new QuotaError(
        `Project limit reached (${plan.maxProjects} on the ${plan.label} plan).`,
        "project_limit"
      );
    }
    project = await createProject({
      userId: input.userId,
      name: input.name ?? safeName,
      slug: input.slug,
      files: [{ path: safeName, data: Buffer.alloc(0) }], // type inference only
      type: projectTypeForFile(safeName),
    });
    isNew = true;
  }

  const last = await db.deployment.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;
  const deployment = await db.deployment.create({
    data: {
      projectId: project.id,
      version,
      source: "upload-large",
      totalBytes: BigInt(size),
      fileCount: 1,
    },
  });

  const contentType = contentTypeFor(safeName);
  const targetKey = deploymentKey(project.id, deployment.id, safeName);
  await copyObject(input.stagingKey, targetKey, contentType);
  await deleteObject(input.stagingKey);

  const [, updatedProject] = await db.$transaction([
    db.projectFile.create({
      data: {
        deploymentId: deployment.id,
        path: safeName,
        size,
        contentType,
        storageKey: targetKey,
      },
    }),
    db.project.update({
      where: { id: project.id },
      data: { activeDeploymentId: deployment.id },
    }),
    db.user.update({
      where: { id: input.userId },
      data: { storageUsed: { increment: size } },
    }),
  ]);

  await invalidateSiteCache(updatedProject.slug);
  pruneOldDeployments(project.id, input.userId, plan).catch(() => {});
  void dispatchWebhooks(input.userId, isNew ? "project.created" : "project.deployed", {
    projectId: project.id,
    slug: updatedProject.slug,
    deploymentId: deployment.id,
    version,
    files: 1,
    bytes: size,
  });
  void logActivity({
    userId: input.userId,
    teamId: project.teamId,
    action: isNew ? "project.created" : "project.deployed",
    targetId: project.id,
    metadata: { version, files: 1, large: true },
  });

  return { project: updatedProject, deploymentId: deployment.id, fileCount: 1, totalBytes: size };
}

/** Rollback = create a new deployment that points at a past version's files. */
export async function rollback(projectId: string, deploymentId: string, userId: string) {
  const target = await db.deployment.findFirst({
    where: { id: deploymentId, projectId },
    include: { files: true },
  });
  if (!target) throw new ApiError(404, "Version not found");

  await db.project.update({
    where: { id: projectId },
    data: { activeDeploymentId: target.id },
  });
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  await invalidateSiteCache(project.slug);
  void logActivity({
    userId,
    teamId: project.teamId,
    action: "project.rolledback",
    targetId: projectId,
    metadata: { toVersion: target.version },
  });
  return target;
}

/** Keep at most plan.maxVersionsKept deployments; GC the rest (never the active one). */
async function pruneOldDeployments(projectId: string, userId: string, plan: PlanQuota) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  const deployments = await db.deployment.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const excess = deployments
    .slice(plan.maxVersionsKept)
    .filter((d) => d.id !== project?.activeDeploymentId);
  for (const d of excess) {
    await deletePrefix(`sites/${projectId}/${d.id}/`);
    await db.deployment.delete({ where: { id: d.id } });
    await db.user.update({
      where: { id: userId },
      data: { storageUsed: { decrement: d.totalBytes } },
    });
  }
}

export async function deleteProject(projectId: string, userId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const total = await db.deployment.aggregate({
    where: { projectId },
    _sum: { totalBytes: true },
  });
  await deletePrefix(`sites/${projectId}/`);
  await db.$transaction([
    db.project.delete({ where: { id: projectId } }),
    db.user.update({
      where: { id: userId },
      data: { storageUsed: { decrement: total._sum.totalBytes ?? 0 } },
    }),
  ]);
  await invalidateSiteCache(project.slug);
  void dispatchWebhooks(userId, "project.deleted", { projectId, slug: project.slug });
  void logActivity({
    userId,
    teamId: project.teamId,
    action: "project.deleted",
    targetId: projectId,
    metadata: { slug: project.slug },
  });
}

/** Redis cache of slug → serving metadata, invalidated on publish. */
export async function invalidateSiteCache(slug: string) {
  await getRedis()?.del(`site:${slug}`).catch(() => {});
}

export { findIndexPath };
