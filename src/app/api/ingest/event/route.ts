import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordEvent } from "@/lib/analytics";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const eventSchema = z.object({
  projectId: z.string().min(1).max(64),
  type: z.enum(["pageview", "download", "file_view", "heartbeat"]),
  path: z.string().max(512).default("/"),
  referrer: z.string().max(1024).nullish(),
  duration: z.number().int().min(0).max(7200).nullish(),
});

/** Analytics beacon ingest — public by design, aggressively rate limited. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await rateLimit(`ingest:${ip}`, 60, 60);
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  let parsed;
  try {
    parsed = eventSchema.parse(await req.json());
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // Only record events for projects that actually exist (cheap indexed hit).
  const exists = await db.project.findUnique({
    where: { id: parsed.projectId },
    select: { id: true },
  });
  if (!exists) return new NextResponse(null, { status: 204 });

  await recordEvent({
    projectId: parsed.projectId,
    type: parsed.type,
    path: parsed.path,
    ip,
    userAgent: req.headers.get("user-agent") ?? "",
    referrer: parsed.referrer,
    country: req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country"),
    duration: parsed.duration,
  });
  return new NextResponse(null, { status: 204 });
}
