import { customAlphabet } from "nanoid";

const nano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

/** Subdomains we never hand out to users. */
export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "dashboard", "mail", "smtp", "ftp", "blog",
  "docs", "help", "support", "status", "cdn", "assets", "static", "sites",
  "billing", "stripe", "auth", "login", "signup", "register", "domains",
  "hosty", "staging", "dev", "test", "demo-internal",
]);

/** Turn any name into a DNS-safe subdomain label. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
}

export function isValidSlug(slug: string): boolean {
  return (
    /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(slug) &&
    !RESERVED_SLUGS.has(slug)
  );
}

/** Generate a unique-ish slug candidate from a name (uniqueness enforced by DB). */
export function slugCandidate(name?: string | null): string {
  const base = name ? slugify(name) : "";
  if (base && !RESERVED_SLUGS.has(base)) return base;
  return `site-${nano()}`;
}

export function slugWithSuffix(base: string): string {
  return `${base.slice(0, 41)}-${nano()}`;
}

export function shortCode(): string {
  return nano();
}
