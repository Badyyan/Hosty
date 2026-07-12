import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSite, resolveFile, type SiteMeta } from "@/lib/serve/resolve";
import {
  injectIntoHtml,
  passwordGatePage,
  emailGatePage,
  notFoundPage,
  pdfViewerPage,
  docViewerPage,
  imageViewerPage,
  encodePath,
} from "@/lib/serve/html";
import { getObject } from "@/lib/storage";
import { verifyUnlockCookie, unlockCookieName, sign } from "@/lib/security";
import { isHtml, isOfficeDoc, extensionOf } from "@/lib/mime";
import { recordEvent } from "@/lib/analytics";
import { clientIp } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/config";
import { reportError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The hosted-site serving engine.
 * Requests arrive here rewritten by middleware:
 *   my-site.hosty.site/about  →  /sites/my-site/about
 *   docs.acme.com/x           →  /sites/@docs.acme.com/x
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { site: string; path?: string[] } }
) {
  try {
    const site = await resolveSite(params.site);
    if (!site || !site.activeDeploymentId) return html(notFoundPage(), 404);

    const rawPath = (params.path ?? []).join("/");
    const search = req.nextUrl.searchParams;

    // --- Gates -------------------------------------------------------------
    const jar = cookies();
    if (site.hasPassword) {
      const cookie = jar.get(unlockCookieName(site.projectId))?.value;
      if (!verifyUnlockCookie(site.projectId, site.passwordVersion, cookie)) {
        return html(passwordGatePage(site.projectId, site.name), 401);
      }
    }
    if (site.emailGate) {
      const cookie = jar.get(`hosty_lead_${site.projectId}`)?.value;
      if (cookie !== sign(`lead:${site.projectId}`)) {
        return html(emailGatePage(site.projectId, site.name), 200);
      }
    }

    // --- File resolution ----------------------------------------------------
    const file = await resolveFile(site.activeDeploymentId, rawPath, site.spaFallback);
    if (!file) return html(notFoundPage(), 404);

    const wantsRaw = search.get("raw") === "1";
    const wantsDownload = search.get("download") === "1";

    // --- Wrapped viewers for single-file document projects -------------------
    if (!wantsRaw) {
      const ext = extensionOf(file.path);
      if (ext === "pdf") {
        void track(req, site, "file_view", `/${file.path}`);
        return html(pdfViewerPage(site, file.path), 200, viewerHeaders());
      }
      if (isOfficeDoc(file.path)) {
        void track(req, site, "file_view", `/${file.path}`);
        const publicUrl = `${siteUrl(site.slug)}/${encodePath(file.path)}?raw=1`;
        return html(docViewerPage(site, file.path, publicUrl), 200, viewerHeaders());
      }
      if (site.type === "IMAGE" && rawPath === "") {
        void track(req, site, "file_view", `/${file.path}`);
        return html(imageViewerPage(site, file.path), 200, viewerHeaders());
      }
    }

    // --- Stream the object ---------------------------------------------------
    const range = req.headers.get("range") ?? undefined;
    const object = await getObject(file.storageKey, range);
    if (!object) return html(notFoundPage(), 404);

    const headers = new Headers();
    const contentType = file.contentType || object.contentType || "application/octet-stream";
    headers.set("Content-Type", contentType);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Accept-Ranges", "bytes");
    if (object.etag) headers.set("ETag", object.etag);
    if (object.contentRange) headers.set("Content-Range", object.contentRange);
    headers.set("Cache-Control", cacheControlFor(file.path, contentType));

    if (wantsDownload) {
      if (extensionOf(file.path) === "pdf" && !site.pdfDownloadable) {
        return html(pdfViewerPage(site, file.path), 403);
      }
      headers.set(
        "Content-Disposition",
        `attachment; filename="${file.path.split("/").pop()?.replace(/"/g, "") ?? "file"}"`
      );
      void track(req, site, "download", `/${file.path}`);
    }

    // HTML gets the analytics beacon / widgets injected (and is never cached
    // at the edge, so re-deploys are instant).
    if (isHtml(contentType) && !wantsRaw) {
      const text = await object.body.transformToString("utf-8");
      return new NextResponse(injectIntoHtml(text, site), { status: 200, headers });
    }

    // Non-HTML entry views (images/downloads hit via direct link) are
    // tracked server-side since no beacon runs.
    if (!isHtml(contentType) && rawPath === "" && !wantsRaw) {
      void track(req, site, "file_view", `/${file.path}`);
    }

    if (object.contentLength !== undefined && !object.contentRange) {
      headers.set("Content-Length", String(object.contentLength));
    }
    // transformToWebStream() yields a web ReadableStream on both Node and
    // workerd — never assume a Node Readable here.
    return new NextResponse(object.body.transformToWebStream(), {
      status: object.statusCode,
      headers,
    });
  } catch (err) {
    reportError(err, { site: params.site });
    return html("<h1>Something went wrong</h1>", 500);
  }
}

function cacheControlFor(path: string, contentType: string): string {
  if (isHtml(contentType)) return "no-cache";
  // fingerprinted assets (app.3f2a91.js) are immutable
  if (/\.[0-9a-f]{6,}\./i.test(path)) return "public, max-age=31536000, immutable";
  return "public, max-age=300, stale-while-revalidate=600";
}

function viewerHeaders(): HeadersInit {
  return { "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" };
}

function html(body: string, status: number, extra?: HeadersInit): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...Object.fromEntries(new Headers(extra ?? {})),
    },
  });
}

async function track(req: NextRequest, site: SiteMeta, type: "file_view" | "download", path: string) {
  try {
    await recordEvent({
      projectId: site.projectId,
      type,
      path,
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? "",
      referrer: req.headers.get("referer"),
      country:
        req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country"),
    });
  } catch {
    /* analytics must never break serving */
  }
}

