import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDailyMaintenance } from "@/lib/jobs";
import { reportError } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily maintenance trigger. Schedule with any external scheduler:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://hosty.site/api/cron/daily
 * (EventBridge Scheduler / Cloud Scheduler / Vercel Cron / crontab.)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await runDailyMaintenance();
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    reportError(err, { job: "daily-maintenance" });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
