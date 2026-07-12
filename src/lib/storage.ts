import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage service. Works against AWS S3, Cloudflare R2 or MinIO
 * (docker-compose ships MinIO for local dev).
 *
 * Layout: sites/{projectId}/{deploymentId}/{path} — immutable per deployment.
 */

const globalForS3 = globalThis as unknown as { s3?: S3Client };
const perRequestS3 = new WeakMap<object, S3Client>();

function onWorkers(): boolean {
  return process.env.DB_ADAPTER === "pg";
}

function workerRequestCtx(): object | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    return getCloudflareContext().ctx as object;
  } catch {
    return undefined;
  }
}

function buildS3Client(): S3Client {
  // On Cloudflare Workers (nodejs_compat) the SDK otherwise auto-selects
  // Node's http handler, whose sockets hang in workerd. Force the native
  // fetch handler there — fetch is fully implemented in workerd.
  let requestHandler: unknown;
  if (onWorkers()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FetchHttpHandler } =
      require("@smithy/fetch-http-handler") as typeof import("@smithy/fetch-http-handler");
    requestHandler = new FetchHttpHandler();
  }
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    // Disable the SDK's default CRC32 flexible-checksum on uploads: the
    // streaming checksum implementation hangs under workerd and is also
    // rejected by Cloudflare R2. "WHEN_REQUIRED" keeps checksums only where
    // an operation mandates them. Harmless on AWS S3.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(requestHandler ? { requestHandler } : {}),
    credentials: process.env.S3_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
        }
      : undefined, // fall back to IAM role in production
  });
}

/**
 * S3 client. On Node it's a process-global singleton. On workerd it is cached
 * **per request** — a client built in one request holds fetch/handler state
 * that workerd forbids reusing in another request (it hangs). The client has
 * no persistent connection to close, so no disposal is needed.
 */
export function s3(): S3Client {
  if (onWorkers()) {
    const ctx = workerRequestCtx();
    if (!ctx) return buildS3Client();
    let client = perRequestS3.get(ctx);
    if (!client) {
      client = buildS3Client();
      perRequestS3.set(ctx, client);
    }
    return client;
  }
  if (!globalForS3.s3) globalForS3.s3 = buildS3Client();
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

/**
 * The AWS SDK response body is an `SdkStream` with runtime-agnostic transform
 * helpers. Consuming it via these (never by assuming a Node `Readable`) is what
 * lets the same code stream on Node *and* Cloudflare Workers (workerd), where
 * the body is a web `ReadableStream`.
 */
interface SdkBody {
  transformToWebStream(): ReadableStream;
  transformToByteArray(): Promise<Uint8Array>;
  transformToString(encoding?: string): Promise<string>;
}

export interface StoredObject {
  body: SdkBody;
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
      body: res.Body as unknown as SdkBody,
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

/** Read an entire object as a Buffer (portable across Node/workerd). */
export async function getObjectBytes(key: string): Promise<Buffer | null> {
  const obj = await getObject(key);
  if (!obj) return null;
  return Buffer.from(await obj.body.transformToByteArray());
}

/**
 * Delete every object under a prefix (used by deployment GC / project delete).
 *
 * Uses individual DeleteObject calls rather than the batch DeleteObjects: the
 * batch operation sends a Content-MD5 over the request body and returns an XML
 * result that fails to parse under Cloudflare Workers (workerd). Single
 * deletes are portable and, at our per-deployment file counts, cheap enough
 * (bounded concurrency below).
 */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let token: string | undefined;
  do {
    const list = await s3().send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    const keys = (list.Contents ?? []).map((o) => o.Key!).filter(Boolean);
    // delete in bounded-concurrency waves to avoid opening too many sockets
    for (let i = 0; i < keys.length; i += 16) {
      const wave = keys.slice(i, i + 16);
      await Promise.all(
        wave.map((Key) => s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key })))
      );
      deleted += wave.length;
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
  // Send via a presigned URL + native fetch rather than the SDK command. The
  // SDK's XML *response* deserializer for CompleteMultipartUpload hangs/errors
  // under Cloudflare Workers (a v3 edge case for body-bearing operations); the
  // request itself is fine. fetch() is native on both Node and workerd, and we
  // parse the trivial response ourselves. S3/R2 accept an UNSIGNED-PAYLOAD
  // presigned POST with the parts list in the body.
  const url = await getSignedUrl(
    s3(),
    new CompleteMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }),
    { expiresIn: 3600 }
  );
  const ordered = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
  const body =
    `<CompleteMultipartUpload>` +
    ordered
      .map(
        (p) =>
          `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${escapeXml(p.ETag)}</ETag></Part>`
      )
      .join("") +
    `</CompleteMultipartUpload>`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });
  const text = await res.text();
  // S3 can return 200 with an <Error> body, so check both status and payload.
  if (!res.ok || text.includes("<Error>")) {
    throw new Error(`CompleteMultipartUpload failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
