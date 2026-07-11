import { NextRequest, NextResponse } from "next/server";

/**
 * Host-based router (runs at the edge).
 *
 * - app host (APP_URL)          → dashboard/marketing/API as-is
 * - {slug}.{ROOT_DOMAIN}        → rewrite to /sites/{slug}/{path}
 * - any other host (custom dom) → rewrite to /sites/@{host}/{path}
 * - /_hosty/* on any host       → rewrite to /api/ingest/* (beacon, gates,
 *                                 comments — must work on site origins)
 */

export const config = {
  matcher: [
    // Skip Next internals and static assets
    "/((?!_next/|favicon.ico|robots.txt).*)",
  ],
};

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = (req.headers.get("host") ?? "").toLowerCase();

  // Public ingest endpoints work on every origin (hosted sites included).
  if (url.pathname.startsWith("/_hosty/")) {
    const rewritten = url.clone();
    rewritten.pathname = `/api/ingest/${url.pathname.slice("/_hosty/".length)}`;
    return NextResponse.rewrite(rewritten);
  }

  const appHost = getAppHost();
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000").toLowerCase();

  if (host === appHost || host === `www.${appHost}` || host === "") {
    return NextResponse.next();
  }

  // {slug}.{rootDomain} → subdomain site
  if (host.endsWith(`.${rootDomain}`)) {
    const slug = host.slice(0, -(rootDomain.length + 1)).split(".")[0];
    if (slug && slug !== "www") {
      const rewritten = url.clone();
      rewritten.pathname = `/sites/${slug}${url.pathname}`;
      return NextResponse.rewrite(rewritten);
    }
    return NextResponse.next();
  }

  // Unknown host → treat as a customer's custom domain ("@" marker).
  const rewritten = url.clone();
  rewritten.pathname = `/sites/@${host.split(":")[0]}${url.pathname}`;
  return NextResponse.rewrite(rewritten);
}

function getAppHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").host.toLowerCase();
  } catch {
    return "localhost:3000";
  }
}
