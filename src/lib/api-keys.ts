import { randomBytes } from "crypto";
import { db } from "./db";
import { sha256 } from "./security";
import { ApiError } from "./auth";
import { rateLimit } from "./rate-limit";

/** API keys for the public REST API. Format: hty_<43 chars base64url>. */

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `hty_${randomBytes(32).toString("base64url")}`;
  return { key, hash: sha256(key), prefix: key.slice(0, 12) };
}

export interface ApiKeyContext {
  userId: string;
  keyId: string;
  scopes: string[];
}

/** Authenticate a public API request from its Authorization header. */
export async function authenticateApiKey(
  req: Request,
  requiredScope: "read" | "write"
): Promise<ApiKeyContext> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(hty_[A-Za-z0-9_-]+)$/);
  if (!match) throw new ApiError(401, "Missing or malformed API key");

  const keyHash = sha256(match[1]);
  const record = await db.apiKey.findUnique({ where: { keyHash } });
  if (!record) throw new ApiError(401, "Invalid API key");
  if (!record.scopes.includes(requiredScope)) {
    throw new ApiError(403, `API key lacks the "${requiredScope}" scope`);
  }

  const limit = await rateLimit(`apikey:${record.id}`, 120, 60);
  if (!limit.ok) throw new ApiError(429, "API rate limit exceeded (120/min)");

  // fire-and-forget usage tracking
  db.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: record.userId, keyId: record.id, scopes: record.scopes };
}
