import { PrismaClient } from "@prisma/client";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Prisma client, platform-aware:
 *
 * - Node deployments (Docker/ECS, `next dev`): the default native engine,
 *   one client cached for the process lifetime.
 * - Cloudflare Workers (DB_ADAPTER=pg): the WASM query engine + `pg` driver
 *   adapter. workerd forbids reusing an I/O object (a TCP pool) across
 *   requests, so the client+pool are created **per request** and — critically
 *   — the pool is **closed when the request ends** (via `disposeRequest`,
 *   called from the Worker entrypoint). Without that close, every request
 *   leaks Postgres connections until the database refuses new ones.
 *
 *   In production put **Hyperdrive** in front of Postgres: the pool then
 *   connects to Hyperdrive's local socket (fast) and Hyperdrive pools the
 *   real connections. The per-request close remains correct and cheap.
 */

interface PoolLike {
  end(): Promise<void>;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const perRequest = new WeakMap<object, { client: PrismaClient; pool: PoolLike }>();

function onWorkers(): boolean {
  return process.env.DB_ADAPTER === "pg";
}

function requestContext(): { ctx?: object; hyperdriveUrl?: string } {
  try {
    const cf = getCloudflareContext();
    const env = cf.env as { HYPERDRIVE?: { connectionString: string } };
    return { ctx: cf.ctx as object, hyperdriveUrl: env.HYPERDRIVE?.connectionString };
  } catch {
    return {}; // outside a Worker request (Node runtime or build-time eval)
  }
}

function createWorkerClient(connectionString: string | undefined): {
  client: PrismaClient;
  pool: PoolLike;
} {
  // The generated Node client ships a native engine binary that can't run in
  // workerd — use the WASM query-engine build instead.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient: PrismaClientWasm } =
    require("@prisma/client/wasm") as { PrismaClient: typeof PrismaClient };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require("pg") as typeof import("pg");

  const pool = new Pool({ connectionString, max: 1 });
  const client = new PrismaClientWasm({ adapter: new PrismaPg(pool), log: ["error"] });
  return { client, pool: pool as PoolLike };
}

function getClient(): PrismaClient {
  if (onWorkers()) {
    const { ctx, hyperdriveUrl } = requestContext();
    const connectionString = hyperdriveUrl ?? process.env.DATABASE_URL;
    if (!ctx) return createWorkerClient(connectionString).client;
    let entry = perRequest.get(ctx);
    if (!entry) {
      entry = createWorkerClient(connectionString);
      perRequest.set(ctx, entry);
    }
    return entry.client;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

/**
 * Release the per-request Postgres connection. Called by the Worker
 * entrypoint after the response is produced (see cloudflare/worker.ts).
 * No-op on Node (the process-global client is long-lived).
 *
 * NOTE: because the pool closes here, any DB work still in flight after the
 * response is lost on Workers. Feature-critical background writes (activity
 * log, notifications) are therefore *awaited* in their request handlers so
 * they finish while the pool is open. Best-effort external work (webhook
 * delivery, marketing-list forwarding) stays fire-and-forget and is reliable
 * on Node; on Workers it needs a durable queue — see docs/deploy-cloudflare.md.
 */
export async function disposeRequest(ctx: object): Promise<void> {
  const entry = perRequest.get(ctx);
  if (!entry) return;
  perRequest.delete(ctx);
  try {
    await entry.pool.end();
  } catch {
    /* best-effort */
  }
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
