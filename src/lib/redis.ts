import Redis from "ioredis";

/**
 * Shared Redis connection (rate limiting, host-lookup cache, salts).
 * Gracefully degrades: callers must handle `getRedis()` returning null
 * (e.g. local dev without Redis) — see rate-limit.ts for the fallback.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis | null };

export function getRedis(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;
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
