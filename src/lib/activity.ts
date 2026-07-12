import { db } from "./db";

/**
 * Append-only audit trail shown on team dashboards.
 *
 * `await` this in request handlers (rather than fire-and-forget) so the write
 * completes while the request's DB connection is still open — on Cloudflare
 * Workers the per-request pool closes as soon as the response is sent. It's a
 * single fast insert and never throws, so awaiting is cheap and safe.
 */
export async function logActivity(entry: {
  userId?: string | null;
  teamId?: string | null;
  action: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        userId: entry.userId ?? null,
        teamId: entry.teamId ?? null,
        action: entry.action,
        targetId: entry.targetId,
        metadata: entry.metadata as object | undefined,
      },
    });
  } catch {
    // activity logging must never fail a user action
  }
}

export async function notify(
  userId: string,
  type: string,
  title: string,
  opts: { body?: string; href?: string } = {}
): Promise<void> {
  try {
    await db.notification.create({
      data: { userId, type, title, body: opts.body, href: opts.href },
    });
  } catch {
    /* best-effort */
  }
}
