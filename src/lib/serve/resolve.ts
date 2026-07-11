import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

/**
 * Site resolution for the serving path: slug (or custom domain) → the
 * minimal metadata needed to serve a request. Cached in Redis for 30s and
 * invalidated on publish (see deployments.invalidateSiteCache).
 */

export interface SiteMeta {
  projectId: string;
  slug: string;
  type: string;
  activeDeploymentId: string | null;
  hasPassword: boolean;
  passwordVersion: number;
  emailGate: boolean;
  feedbackEnabled: boolean;
  pdfDownloadable: boolean;
  removeBranding: boolean;
  spaFallback: boolean;
  name: string;
  ownerUserId: string | null;
}

const CACHE_TTL = 30;

export async function resolveSite(siteParam: string): Promise<SiteMeta | null> {
  const isDomain = siteParam.startsWith("@");
  const cacheKey = `site:${isDomain ? siteParam : siteParam.toLowerCase()}`;
  const redis = getRedis();

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return cached === "null" ? null : (JSON.parse(cached) as SiteMeta);
    } catch {
      /* cache miss path below */
    }
  }

  const project = isDomain
    ? (
        await db.customDomain.findFirst({
          where: { domain: siteParam.slice(1).toLowerCase(), status: "VERIFIED" },
          include: { project: true },
        })
      )?.project ?? null
    : await db.project.findUnique({ where: { slug: siteParam.toLowerCase() } });

  const meta: SiteMeta | null = project
    ? {
        projectId: project.id,
        slug: project.slug,
        type: project.type,
        activeDeploymentId: project.activeDeploymentId,
        hasPassword: Boolean(project.passwordHash),
        passwordVersion: project.passwordVersion,
        emailGate: project.emailGate,
        feedbackEnabled: project.feedbackEnabled,
        pdfDownloadable: project.pdfDownloadable,
        removeBranding: project.removeBranding,
        spaFallback: project.spaFallback,
        name: project.name,
        ownerUserId: project.userId,
      }
    : null;

  if (redis) {
    redis.set(cacheKey, meta ? JSON.stringify(meta) : "null", "EX", CACHE_TTL).catch(() => {});
  }
  return meta;
}

export interface ResolvedFile {
  path: string;
  storageKey: string;
  contentType: string;
  size: number;
  hash: string | null;
}

/**
 * Resolve a request path within a deployment:
 * exact → directory index → clean URL (.html) → single-file root → SPA fallback.
 */
export async function resolveFile(
  deploymentId: string,
  rawPath: string,
  spaFallback: boolean
): Promise<ResolvedFile | null> {
  const path = normalizeRequestPath(rawPath);
  if (path === null) return null; // traversal attempt

  const candidates: string[] = [];
  if (path === "") {
    candidates.push("index.html", "index.htm");
  } else {
    candidates.push(path, `${path}/index.html`, `${path}.html`);
  }

  for (const candidate of candidates) {
    const file = await db.projectFile.findUnique({
      where: { deploymentId_path: { deploymentId, path: candidate } },
      select: { path: true, storageKey: true, contentType: true, size: true, hash: true },
    });
    if (file) return file;
  }

  // Single-file projects (a lone PDF/image/doc) serve their file at "/".
  if (path === "") {
    const files = await db.projectFile.findMany({
      where: { deploymentId },
      select: { path: true, storageKey: true, contentType: true, size: true, hash: true },
      take: 2,
    });
    if (files.length === 1) return files[0];
    const anyIndex = await db.projectFile.findFirst({
      where: { deploymentId, path: { endsWith: "index.html" } },
      orderBy: { path: "asc" },
      select: { path: true, storageKey: true, contentType: true, size: true, hash: true },
    });
    if (anyIndex) return anyIndex;
  }

  if (spaFallback) {
    const index = await db.projectFile.findUnique({
      where: { deploymentId_path: { deploymentId, path: "index.html" } },
      select: { path: true, storageKey: true, contentType: true, size: true, hash: true },
    });
    if (index) return index;
  }
  return null;
}

/** Strip leading/trailing slashes, decode, and reject traversal (null). */
export function normalizeRequestPath(raw: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(raw);
  } catch {
    p = raw;
  }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
  if (p.split("/").some((seg) => seg === "..")) return null;
  if (p.includes("\0")) return null;
  return p;
}
