/**
 * Custom Worker entrypoint that wraps the OpenNext handler to add a native
 * Cloudflare Cron Trigger for daily maintenance — no external scheduler
 * needed. `wrangler.jsonc` points `main` here; it re-exports OpenNext's
 * Durable Objects and delegates `fetch` unchanged.
 *
 * The scheduled handler self-fetches the already-tested `/api/cron/daily`
 * route (so it runs inside the normal request/DB context) using the app
 * origin, so middleware treats it as an API call rather than a hosted site.
 */
// @ts-expect-error - generated at build time by `opennextjs-cloudflare build`
import openNextWorker from "../.open-next/worker.js";
import { disposeRequest } from "../src/lib/db";

// @ts-expect-error - Durable Objects are generated; re-export so bindings resolve
export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "../.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await openNextWorker.fetch(request, env, ctx);
    } finally {
      // Close this request's Postgres connection once the response is built.
      // Feature-critical background writes are awaited in-handler (see
      // src/lib/db.ts), so nothing important is in flight here; any streamed
      // body (from object storage) is independent of the DB pool.
      ctx.waitUntil(disposeRequest(ctx));
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.CRON_SECRET) {
      console.warn("cron: CRON_SECRET not set — skipping maintenance");
      return;
    }
    // Use the app origin so host-based middleware routes this to the API,
    // not to a hosted site.
    const origin = env.NEXT_PUBLIC_APP_URL ?? "https://localhost";
    const req = new Request(`${origin}/api/cron/daily`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    ctx.waitUntil(
      openNextWorker
        .fetch(req, env, ctx)
        .then(async (res: Response) => {
          console.log(`cron: /api/cron/daily -> ${res.status}`, await res.text());
        })
        .catch((err: unknown) => console.error("cron failed", err))
    );
  },
};
