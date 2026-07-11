/** Centralized environment configuration. */

export const config = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** Domain hosted sites live under, e.g. "hosty.site" (or "localhost:3000" in dev). */
  rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000",
  signingSecret: process.env.SIGNING_SECRET ?? "dev-signing-secret",
  isProd: process.env.NODE_ENV === "production",
};

/** Hostname (no port) sites are served under. */
export function rootHostname(): string {
  return config.rootDomain.split(":")[0];
}

/** Public URL for a project slug, respecting dev (port, http) vs prod. */
export function siteUrl(slug: string): string {
  const proto = config.rootDomain.startsWith("localhost") ? "http" : "https";
  return `${proto}://${slug}.${config.rootDomain}`;
}
