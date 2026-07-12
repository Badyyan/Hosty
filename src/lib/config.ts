/** Centralized environment configuration. */

// On Vercel, fall back to the deployment's own URL if the app URL isn't set
// explicitly (VERCEL_PROJECT_PRODUCTION_URL is the stable production host).
const vercelUrl =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

export const config = {
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ??
    (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000"),
  /** Domain hosted sites live under, e.g. "hosty.site" (or "localhost:3000" in dev). */
  rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000",
  signingSecret: process.env.SIGNING_SECRET ?? "dev-signing-secret",
  isProd: process.env.NODE_ENV === "production",
};

/** Hostname (no port) sites are served under. */
export function rootHostname(): string {
  return config.rootDomain.split(":")[0];
}

/**
 * Whether hosted sites are served path-based (`{appUrl}/sites/{slug}`) instead
 * of on wildcard subdomains. Set PATH_SERVING=1 on hosts without wildcard DNS
 * (e.g. *.vercel.app, *.workers.dev) — subdomain routing needs a wildcard the
 * platform's default domain doesn't provide. On a custom domain with a
 * wildcard record, leave it off for real `slug.yourdomain` URLs.
 */
export function pathServing(): boolean {
  if (process.env.PATH_SERVING === "0") return false; // explicit opt-out
  if (process.env.PATH_SERVING === "1" || process.env.NEXT_PUBLIC_PATH_SERVING === "1") return true;
  // Default on Vercel: *.vercel.app has no wildcard for subdomain routing.
  return Boolean(process.env.VERCEL);
}

/** Public URL for a project slug, respecting dev (port, http) vs prod. */
export function siteUrl(slug: string): string {
  if (pathServing()) return `${config.appUrl}/sites/${slug}`;
  const proto = config.rootDomain.startsWith("localhost") ? "http" : "https";
  return `${proto}://${slug}.${config.rootDomain}`;
}
