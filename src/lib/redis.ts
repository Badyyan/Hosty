import Redis from "ioredis";

/**
 * Shared Redis connection (rate limiting, host-lookup cache, salts).
 * Gracefully degrades: callers must handle `getRedis()` returning null
 * (e.g. local dev without Redis) — see rate-limit.ts for the fallback.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis | null };

export function getRedis(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;

  // ioredis uses Node TCP sockets, which do not work under Cloudflare Workers
  // (workerd) — a socket opened in one request cannot be reused in another and
  // hangs. On Workers we run without ioredis: the rate limiter falls back to
  // its in-memory window and the host-lookup cache is simply skipped (Postgres
  // absorbs the reads; a Hyperdrive/edge cache fronts them). For a shared
  // edge cache/limiter, wire Upstash Redis (REST-based) — see
  // docs/deploy-cloudflare.md.
  if (process.env.DB_ADAPTER === "pg") {
    globalForRedis.redis = null;
    return null;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    globalForRedis.redis = null;
    return null;
  }
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });
  client.on("error", () => {
    /* logged once by ioredis; never crash the request path */
  });
  globalForRedis.redis = client;
  return client;
}
