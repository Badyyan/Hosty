import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { deploy, prepareUpload } from "@/lib/deployments";
import { siteUrl } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Inline upload (≤ plan limit). Accepts one or many files:
 * - single .zip            → extracted into a multi-file site
 * - single html/pdf/image  → single-file project with viewer
 * - multiple files         → treated as a folder upload (site)
 * Optional fields: name, slug, projectId (re-deploy), teamId.
 */
export const POST = apiHandler(
  async (req) => {
    const userId = await requireUserId();
    const form = await req.formData();

    const uploads = form.getAll("file").filter((f): f is File => f instanceof File);
    if (uploads.length === 0) throw new ApiError(400, "No file provided.");

    const projectId = str(form.get("projectId"));
    if (projectId) await assertProjectAccess(userId, projectId, "EDITOR");

    let files;
    let type;
    if (uploads.length === 1) {
      const buf = Buffer.from(await uploads[0].arrayBuffer());
      ({ files, type } = await prepareUpload(uploads[0].name, buf));
    } else {
      // folder upload: preserve relative paths sent by the client
      files = [];
      for (const f of uploads) {
        const rel = (f as File & { webkitRelativePath?: string }).name;
        const prepared = await prepareUpload(rel, Buffer.from(await f.arrayBuffer()));
        files.push(...prepared.files);
      }
      type = "SITE" as const;
    }

    const result = await deploy({
      userId,
      projectId: projectId ?? undefined,
      name: str(form.get("name")) ?? undefined,
      slug: str(form.get("slug")) ?? undefined,
      teamId: str(form.get("teamId")),
      files,
      type,
      source: str(form.get("source")) ?? "upload",
    });

    return json(
      {
        project: {
          id: result.project.id,
          slug: result.project.slug,
          name: result.project.name,
          type: result.project.type,
          url: siteUrl(result.project.slug),
          deployment: {
            id: result.deploymentId,
            files: result.fileCount,
            bytes: result.totalBytes,
          },
        },
      },
      { status: projectId ? 200 : 201 }
    );
  },
  { limit: { n: 20, windowSeconds: 60, key: "upload" } }
);

function str(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
