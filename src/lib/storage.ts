import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";

/**
 * Object storage service. Works against AWS S3, Cloudflare R2 or MinIO
 * (docker-compose ships MinIO for local dev).
 *
 * Layout: sites/{projectId}/{deploymentId}/{path} — immutable per deployment.
 */

const globalForS3 = globalThis as unknown as { s3?: S3Client };

export function s3(): S3Client {
  if (!globalForS3.s3) {
    globalForS3.s3 = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: process.env.S3_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
          }
        : undefined, // fall back to IAM role in production
    });
  }
  return globalForS3.s3;
}

export const BUCKET = process.env.S3_BUCKET ?? "hosty-sites";

export function deploymentKey(projectId: string, deploymentId: string, path: string) {
  return `sites/${projectId}/${deploymentId}/${path}`;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  );
}

export interface StoredObject {
  body: Readable;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  contentRange?: string;
  statusCode: 200 | 206;
}

/** GET an object, with optional HTTP Range passthrough for large files/video. */
export async function getObject(key: string, range?: string): Promise<StoredObject | null> {
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: range })
    );
    return {
      body: res.Body as Readable,
      contentLength: res.ContentLength,
      contentType: res.ContentType,
      etag: res.ETag,
      contentRange: res.ContentRange,
      statusCode: res.ContentRange ? 206 : 200,
    };
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw err;
  }
}

/** Delete every object under a prefix (used by deployment GC / project delete). */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let token: string | undefined;
  do {
    const list = await s3().send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
      await s3().send(
        new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys } })
      );
      deleted += keys.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

/** Object size in bytes, or null if it doesn't exist. */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return res.ContentLength ?? 0;
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * Server-side copy (staging → deployment prefix). S3 CopyObject supports
 * objects up to 5 GB; beyond that multipart copy (UploadPartCopy) is
 * required — the per-file plan limits keep us under that today.
 */
export async function copyObject(fromKey: string, toKey: string, contentType: string) {
  await s3().send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: encodeURIComponent(`${BUCKET}/${fromKey}`),
      Key: toKey,
      ContentType: contentType,
      MetadataDirective: "REPLACE",
    })
  );
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
}

// ---------------------------------------------------------------------------
// Presigned multipart uploads (multi-GB files go browser → S3 directly)
// ---------------------------------------------------------------------------

export async function createMultipartUpload(key: string, contentType: string) {
  const res = await s3().send(
    new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType })
  );
  return res.UploadId!;
}

export async function presignUploadPart(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(
    s3(),
    new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: 3600 }
  );
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
) {
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  );
}
