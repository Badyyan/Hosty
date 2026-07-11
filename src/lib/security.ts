import { createHmac, timingSafeEqual, createHash, randomBytes } from "crypto";
import { config } from "./config";

/** HMAC-SHA256 sign a value with the platform signing secret. */
export function sign(value: string): string {
  return createHmac("sha256", config.signingSecret).update(value).digest("hex");
}

export function verifySignature(value: string, signature: string): boolean {
  const expected = sign(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Unlock-cookie payload for password-gated sites.
 * Includes passwordVersion so changing the password invalidates cookies.
 */
export function unlockCookieName(projectId: string): string {
  return `hosty_unlock_${projectId}`;
}

export function unlockCookieValue(projectId: string, passwordVersion: number): string {
  return sign(`unlock:${projectId}:${passwordVersion}`);
}

export function verifyUnlockCookie(
  projectId: string,
  passwordVersion: number,
  cookieValue: string | undefined
): boolean {
  if (!cookieValue) return false;
  return verifySignature(`unlock:${projectId}:${passwordVersion}`, cookieValue);
}

/**
 * CSRF defense for state-changing internal API routes: the session cookie is
 * SameSite=Lax, and we additionally require the Origin (or Referer) header to
 * match the app origin. Public /_hosty/* ingest routes are exempt by design.
 */
export function verifySameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return true; // non-browser clients (no ambient cookie auth)
  try {
    const appHost = new URL(config.appUrl).host;
    return new URL(origin).host === appHost;
  } catch {
    return false;
  }
}

/** SSRF guard for user-supplied webhook / integration URLs. */
export function isSafeExternalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return false;
  // Block obvious IP-literal private ranges (defense in depth; production
  // should also resolve DNS and re-check, or egress via a proxy).
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  if (host.includes(":")) return false; // IPv6 literals: disallow entirely
  return true;
}
