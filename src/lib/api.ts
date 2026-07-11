import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./auth";
import { QuotaError } from "./plans";
import { ZipError } from "./zip";
import { MalwareDetectedError } from "./scanner";
import { reportError } from "./logger";
import { verifySameOrigin } from "./security";
import { rateLimit, clientIp, rateLimitHeaders } from "./rate-limit";

/**
 * Route handler wrapper: uniform error translation, CSRF origin check for
 * state-changing methods, optional per-route rate limit.
 */

interface HandlerOptions {
  /** rate limit: N requests per window (keyed by ip or user via keyFn) */
  limit?: { n: number; windowSeconds: number; key: string };
  /** skip the same-origin check (public ingest endpoints) */
  public?: boolean;
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

export function apiHandler<Ctx = unknown>(
  handler: Handler<Ctx>,
  options: HandlerOptions = {}
): Handler<Ctx> {
  return async (req: Request, ctx: Ctx) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating && !options.public && !verifySameOrigin(req)) {
        return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
      }
      if (options.limit) {
        const result = await rateLimit(
          `${options.limit.key}:${clientIp(req)}`,
          options.limit.n,
          options.limit.windowSeconds
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: rateLimitHeaders(result) }
          );
        }
      }
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof QuotaError) {
    return NextResponse.json(
      { error: err.message, code: err.code, upgrade: "/dashboard/billing" },
      { status: 402 }
    );
  }
  if (err instanceof ZipError || err instanceof MalwareDetectedError) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: err.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  reportError(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function json(data: unknown, init?: ResponseInit): Response {
  return NextResponse.json(data, init);
}
