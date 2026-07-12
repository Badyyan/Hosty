import { db } from "./db";

/**
 * Postgres-backed object storage driver (STORAGE_DRIVER=postgres).
 *
 * Stores hosted file bytes in the `StoredFile` table so a deployment needs
 * only a database — no S3/R2/MinIO. Intended for demos and self-contained
 * deploys; the S3 driver (storage.ts default) is the production path. Presigned
 * multi-GB uploads are not supported in this mode (files go through the inline
 * upload path).
 */

export interface SdkBody {
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

/** Wrap a Buffer as an SDK-style body (works on Node and workerd). */
function bufferBody(buf: Buffer): SdkBody {
  return {
    transformToByteArray: async () => new Uint8Array(buf),
    transformToString: async (enc?: string) => buf.toString((enc as BufferEncoding) ?? "utf8"),
    // Response(...).body is a web ReadableStream on every supported runtime.
    transformToWebStream: () => new Response(new Uint8Array(buf)).body as ReadableStream,
  };
}

export async function pgPut(key: string, data: Buffer, contentType: string): Promise<void> {
  await db.storedFile.upsert({
    where: { key },
    update: { data, contentType, size: data.length },
    create: { key, data, contentType, size: data.length },
  });
}

export async function pgGet(key: string, range?: string): Promise<StoredObject | null> {
  const row = await db.storedFile.findUnique({ where: { key } });
  if (!row) return null;
  const full = Buffer.from(row.data);

  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), full.length - 1) : full.length - 1;
      const slice = full.subarray(start, end + 1);
      return {
        body: bufferBody(slice),
        contentLength: slice.length,
        contentType: row.contentType,
        contentRange: `bytes ${start}-${end}/${full.length}`,
        statusCode: 206,
      };
    }
  }
  return {
    body: bufferBody(full),
    contentLength: full.length,
    contentType: row.contentType,
    statusCode: 200,
  };
}

export async function pgGetBytes(key: string): Promise<Buffer | null> {
  const row = await db.storedFile.findUnique({ where: { key }, select: { data: true } });
  return row ? Buffer.from(row.data) : null;
}

export async function pgHeadSize(key: string): Promise<number | null> {
  const row = await db.storedFile.findUnique({ where: { key }, select: { size: true } });
  return row ? row.size : null;
}

export async function pgCopy(fromKey: string, toKey: string, contentType: string): Promise<void> {
  const row = await db.storedFile.findUnique({ where: { key: fromKey } });
  if (!row) throw new Error(`copy source not found: ${fromKey}`);
  await pgPut(toKey, Buffer.from(row.data), contentType || row.contentType);
}

export async function pgDelete(key: string): Promise<void> {
  await db.storedFile.deleteMany({ where: { key } });
}

export async function pgDeletePrefix(prefix: string): Promise<number> {
  const res = await db.storedFile.deleteMany({ where: { key: { startsWith: prefix } } });
  return res.count;
}
