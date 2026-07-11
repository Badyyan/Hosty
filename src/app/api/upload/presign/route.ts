import { z } from "zod";
import { nanoid } from "nanoid";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { getUserPlan, formatBytes } from "@/lib/plans";
import { createMultipartUpload, presignUploadPart } from "@/lib/storage";
import { isAllowedFile, contentTypeFor } from "@/lib/mime";

export const runtime = "nodejs";

const schema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  parts: z.number().int().min(1).max(1000),
});

/**
 * Multi-GB upload path: issue presigned multipart URLs so the browser
 * uploads directly to S3, bypassing the app tier. The client then calls
 * /api/upload/complete to finalize and register the deployment.
 */
export const POST = apiHandler(
  async (req) => {
    const userId = await requireUserId();
    const input = schema.parse(await req.json());

    if (!isAllowedFile(input.filename)) {
      throw new ApiError(422, "File type not supported.");
    }
    const plan = await getUserPlan(userId);
    if (input.size > plan.maxUploadBytes) {
      throw new ApiError(
        402,
        `File exceeds the ${formatBytes(plan.maxUploadBytes)} limit on the ${plan.label} plan.`
      );
    }

    const stagingKey = `staging/${userId}/${nanoid()}/${input.filename.split(/[\\/]/).pop()}`;
    const uploadId = await createMultipartUpload(stagingKey, contentTypeFor(input.filename));
    const urls = await Promise.all(
      Array.from({ length: input.parts }, (_, i) => presignUploadPart(stagingKey, uploadId, i + 1))
    );
    return json({ stagingKey, uploadId, urls, partSize: 64 * 1024 * 1024 });
  },
  { limit: { n: 10, windowSeconds: 60, key: "presign" } }
);
