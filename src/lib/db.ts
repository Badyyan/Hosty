import { PrismaClient } from "@prisma/client";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Prisma client, platform-aware:
 *
 * - Node deployments (Docker/ECS, `next dev`): the default native engine,
 *   one client cached for the process lifetime.
 * - Cloudflare Workers (DB_ADAPTER=pg in wrangler vars): the WASM query
 *   engine + `pg` driver adapter — Workers can't run the native engine.
 *   Crucially the client (and its TCP pool) is cached **per request**, not
 *   globally: workerd forbids using I/O objects created by one request from
 *   another, so a shared pool would hang every request after the first.
 *   Real connection pooling belongs to Hyperdrive in front of Postgres.
 *
 * Access goes through a lazy Proxy because Worker bindings/context are only
 * readable inside a request, never at module scope.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const perRequestClients = new WeakMap<object, PrismaClient>();

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

function createWorkerClient(connectionString: string | undefined): PrismaClient {
  // The generated Node client ships a native engine binary that can't run
  // in workerd — use the WASM query-engine build instead.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient: PrismaClientWasm } =
    require("@prisma/client/wasm") as { PrismaClient: typeof PrismaClient };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require("pg") as typeof import("pg");

  const pool = new Pool({ connectionString, max: 2 });
  return new PrismaClientWasm({ adapter: new PrismaPg(pool), log: ["error"] });
}

function getClient(): PrismaClient {
  if (onWorkers()) {
    const { ctx, hyperdriveUrl } = requestContext();
    const connectionString = hyperdriveUrl ?? process.env.DATABASE_URL;
    if (!ctx) return createWorkerClient(connectionString);
    let client = perRequestClients.get(ctx);
    if (!client) {
      client = createWorkerClient(connectionString);
      perRequestClients.set(ctx, client);
    }
    return client;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
