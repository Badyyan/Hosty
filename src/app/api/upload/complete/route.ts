import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { completeMultipartUpload } from "@/lib/storage";
import { deployStagedFile } from "@/lib/deployments";
import { siteUrl } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  stagingKey: z.string().min(1).max(1024),
  uploadId: z.string().min(1).max(256),
  parts: z
    .array(z.object({ ETag: z.string().max(256), PartNumber: z.number().int().min(1).max(10000) }))
    .min(1)
    .max(10000),
  filename: z.string().min(1).max(255),
  name: z.string().max(120).optional(),
  slug: z.string().max(63).optional(),
  projectId: z.string().max(64).optional(),
});

/**
 * Finalize a presigned multipart upload (multi-GB path): the browser has
 * PUT all parts directly to S3; this completes the multipart upload,
 * re-validates quotas against the *actual* size, and registers the
 * deployment by server-side copy — bytes never touch the app tier.
 */
export const POST = apiHandler(
  async (req) => {
    const userId = await requireUserId();
    const input = schema.parse(await req.json());

    // The staging prefix embeds the uploader's id — refuse to finalize
    // objects staged by anyone else.
    if (!input.stagingKey.startsWith(`staging/${userId}/`)) {
      throw new ApiError(403, "This staged upload belongs to a different account.");
    }
    if (input.projectId) await assertProjectAccess(userId, input.projectId, "EDITOR");

    await completeMultipartUpload(input.stagingKey, input.uploadId, input.parts);

    const result = await deployStagedFile({
      userId,
      stagingKey: input.stagingKey,
      filename: input.filename,
      projectId: input.projectId,
      name: input.name,
      slug: input.slug,
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
      { status: input.projectId ? 200 : 201 }
    );
  },
  { limit: { n: 10, windowSeconds: 60, key: "complete" } }
);
