import { createHash } from "crypto";
import { UAParser } from "ua-parser-js";
import { db } from "./db";
import { getRedis } from "./redis";
import { config } from "./config";

/**
 * Analytics service. Ingest is pseudonymous (no IPs stored); the visitor ID
 * is sha256(dailySalt + ip + ua) — stable for 24h, then unlinkable.
 *
 * All dashboard aggregations live here so the sink can be swapped for
 * ClickHouse without touching routes or UI.
 */

const SESSION_WINDOW_MIN = 30;

async function dailySalt(): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const redis = getRedis();
  const key = `analytics:salt:${day}`;
  if (redis) {
    try {
      let salt = await redis.get(key);
      if (!salt) {
        salt = createHash("sha256").update(`${day}:${Math.random()}`).digest("hex");
        // NX so concurrent instances agree on one salt
        const set = await redis.set(key, salt, "EX", 60 * 60 * 48, "NX");
        if (!set) salt = (await redis.get(key)) ?? salt;
      }
      return salt;
    } catch {
      /* fall through */
    }
  }
  // Deterministic fallback (still rotates daily; weaker without Redis)
  return createHash("sha256").update(`${config.signingSecret}:${day}`).digest("hex");
}

export async function visitorIdFor(ip: string, userAgent: string): Promise<string> {
  const salt = await dailySalt();
  return createHash("sha256").update(`${salt}:${ip}:${userAgent}`).digest("hex").slice(0, 32);
}

export interface IngestEvent {
  projectId: string;
  type: "pageview" | "download" | "file_view" | "heartbeat";
  path: string;
  ip: string;
  userAgent: string;
  referrer?: string | null;
  country?: string | null;
  duration?: number | null;
}

export async function recordEvent(e: IngestEvent): Promise<void> {
  const visitorId = await visitorIdFor(e.ip, e.userAgent);
  const ua = new UAParser(e.userAgent);
  const deviceType = ua.getDevice().type;
  await db.analyticsEvent.create({
    data: {
      projectId: e.projectId,
      type: e.type,
      path: e.path.slice(0, 512),
      visitorId,
      referrer: cleanReferrer(e.referrer),
      country: e.country?.slice(0, 2).toUpperCase() ?? null,
      device: deviceType === "mobile" ? "mobile" : deviceType === "tablet" ? "tablet" : "desktop",
      browser: ua.getBrowser().name ?? "Unknown",
      os: ua.getOS().name ?? "Unknown",
      duration: e.duration ?? null,
    },
  });
}

function cleanReferrer(ref?: string | null): string | null {
  if (!ref) return null;
  try {
    const host = new URL(ref).hostname;
    // ignore self-referrals from the hosted site itself
    if (host.endsWith(config.rootDomain.split(":")[0])) return null;
    return host.slice(0, 255);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Aggregations for the dashboard
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  visitors: number;
  sessions: number;
  pageViews: number;
  downloads: number;
  fileViews: number;
  avgTimeOnPageSec: number;
  bounceRate: number; // 0..1
  timeseries: { date: string; visitors: number; pageViews: number }[];
  topPages: { key: string; count: number }[];
  referrers: { key: string; count: number }[];
  countries: { key: string; count: number }[];
  devices: { key: string; count: number }[];
  browsers: { key: string; count: number }[];
  os: { key: string; count: number }[];
}

export async function getAnalytics(
  projectId: string,
  from: Date,
  to: Date
): Promise<AnalyticsSummary> {
  const where = { projectId, createdAt: { gte: from, lte: to } };
  const events = await db.analyticsEvent.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      type: true,
      path: true,
      visitorId: true,
      referrer: true,
      country: true,
      device: true,
      browser: true,
      os: true,
      duration: true,
      createdAt: true,
    },
  });

  const views = events.filter((e) => e.type === "pageview");
  const visitors = new Set(views.map((e) => e.visitorId)).size;
  const downloads = events.filter((e) => e.type === "download").length;
  const fileViews = events.filter((e) => e.type === "file_view").length;

  // sessions & bounce: group pageviews per visitor, split on 30-min gaps
  let sessions = 0;
  let bounces = 0;
  const byVisitor = new Map<string, Date[]>();
  for (const v of views) {
    const arr = byVisitor.get(v.visitorId) ?? [];
    arr.push(v.createdAt);
    byVisitor.set(v.visitorId, arr);
  }
  for (const times of byVisitor.values()) {
    let sessionViews = 1;
    sessions++;
    for (let i = 1; i < times.length; i++) {
      const gapMin = (times[i].getTime() - times[i - 1].getTime()) / 60000;
      if (gapMin > SESSION_WINDOW_MIN) {
        if (sessionViews === 1) bounces++;
        sessions++;
        sessionViews = 1;
      } else {
        sessionViews++;
      }
    }
    if (sessionViews === 1) bounces++;
  }

  const durations = events.filter((e) => e.duration != null).map((e) => e.duration!);
  const avgTime = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // daily timeseries
  const days = new Map<string, { visitors: Set<string>; pageViews: number }>();
  for (
    let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    d <= to;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    days.set(d.toISOString().slice(0, 10), { visitors: new Set(), pageViews: 0 });
  }
  for (const v of views) {
    const key = v.createdAt.toISOString().slice(0, 10);
    const bucket = days.get(key);
    if (bucket) {
      bucket.visitors.add(v.visitorId);
      bucket.pageViews++;
    }
  }

  const top = (pick: (e: (typeof events)[number]) => string | null | undefined, n = 8) => {
    const counts = new Map<string, number>();
    for (const e of views) {
      const k = pick(e);
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));
  };

  return {
    visitors,
    sessions,
    pageViews: views.length,
    downloads,
    fileViews,
    avgTimeOnPageSec: avgTime,
    bounceRate: sessions ? bounces / sessions : 0,
    timeseries: [...days.entries()].map(([date, v]) => ({
      date,
      visitors: v.visitors.size,
      pageViews: v.pageViews,
    })),
    topPages: top((e) => e.path),
    referrers: top((e) => e.referrer),
    countries: top((e) => e.country),
    devices: top((e) => e.device, 4),
    browsers: top((e) => e.browser, 6),
    os: top((e) => e.os, 6),
  };
}
