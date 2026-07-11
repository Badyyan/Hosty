import type { NextRequest } from "next/server";
import { config } from "@/lib/config";

/**
 * Redirect target for gate form posts (/_hosty/unlock, /_hosty/lead).
 *
 * These handlers run behind a middleware rewrite, so `req.url` carries the
 * internal app host — redirecting there would strand the visitor on the
 * dashboard origin instead of the site they were unlocking. Rebuild the URL
 * from the original Host header, back to the page they came from.
 */
export function gateRedirectUrl(req: NextRequest): URL {
  const host = req.headers.get("host") ?? new URL(config.appUrl).host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (config.appUrl.startsWith("https") ? "https" : "http");

  // Return to the page the form was submitted from, if it's the same site.
  let path = "/";
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const ref = new URL(referer);
      // never bounce back to a gate endpoint (e.g. after a failed attempt the
      // browser's URL — and thus referer — is /_hosty/unlock itself)
      if (ref.host === host && !ref.pathname.startsWith("/_hosty/")) {
        path = ref.pathname + ref.search;
      }
    } catch {
      /* keep "/" */
    }
  }
  return new URL(path, `${proto}://${host}`);
}
