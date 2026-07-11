import { getRedis } from "./redis";

/**
 * Sliding-window rate limiter backed by Redis, with an in-memory fallback so
 * a Redis outage degrades gracefully instead of taking down the platform.
 */

interface LimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  resetSeconds: number;
}

// In-memory fallback (per instance — good enough as a degraded mode).
const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<LimitResult> {
  const redis = getRedis();
  if (redis) {
    try {
      const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
      const count = await redis.incr(bucket);
      if (count === 1) await redis.expire(bucket, windowSeconds);
      return {
        ok: count <= limit,
        remaining: Math.max(0, limit - count),
        limit,
        resetSeconds: windowSeconds,
      };
    } catch {
      // fall through to memory
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (memory.size > 10_000) {
      // opportunistic cleanup
      for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
    }
    return { ok: true, remaining: limit - 1, limit, resetSeconds: windowSeconds };
  }
  entry.count++;
  return {
    ok: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    limit,
    resetSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/** Extract the best-effort client IP behind Cloudflare/ALB. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}

export function rateLimitHeaders(r: LimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(r.resetSeconds),
  };
}
