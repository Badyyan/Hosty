# Security checklist

## Application

- [x] **Authentication** — NextAuth, bcrypt(12) passwords, OAuth (Google/GitHub), TOTP 2FA with recovery codes, single-use hashed reset tokens
- [x] **Authorization** — every project/team route goes through `assertProjectAccess()`; API keys are scoped (`read`/`write`) and hashed at rest
- [x] **CSRF** — JWT cookie is `sameSite=lax`; state-changing internal routes require JSON bodies and verify the `Origin` header (`src/lib/security.ts`); NextAuth's built-in CSRF token protects auth forms; public ingest endpoints (`/_hosty/*`) are intentionally cross-origin but only ever write rate-limited, project-scoped rows
- [x] **XSS** — React escaping throughout the dashboard; user site content is served on **isolated subdomains** (`*.hosty.site`), never on the app origin, so hosted HTML/JS cannot touch dashboard cookies; app cookies are `httpOnly` and host-scoped, never domain-wide
- [x] **SQL injection** — Prisma parameterized queries only; the few raw aggregates use `Prisma.sql` tagged templates
- [x] **SSRF** — webhook/integration URLs are validated (https only, public IP ranges only — RFC1918/link-local/loopback blocked)
- [x] **Rate limiting** — Redis sliding window on auth (5/min), uploads (20/min), public API (120/min/key), beacon ingest (60/min/IP); in-memory fallback when Redis is down (fail-open for reads, fail-closed for auth)
- [x] **Uploads** — MIME allow-list + extension check, zip-slip and zip-bomb guards, size/entry caps, ClamAV scan hook (`src/lib/scanner.ts`), executables/`.php` never executed (static bytes only)
- [x] **Headers** — HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` on the app; hosted sites get `nosniff` + no app cookies
- [x] **Secrets** — env-only, `.env` git-ignored; signing secret separate from session secret; Stripe webhooks signature-verified
- [x] **Password-protected sites** — bcrypt-hashed site passwords, HMAC-signed unlock cookies with version-based instant invalidation
- [x] **PDF protection** — view-only mode serves PDFs through a viewer with download/print controls removed and direct object URLs blocked (deterrent-level, documented as such)

## Infrastructure (production)

- [x] TLS 1.2+ everywhere (Cloudflare edge + origin cert); HTTP→HTTPS redirect
- [x] WAF managed rules + bot fight mode at the edge
- [x] DB in private subnets, security-group least privilege, IAM roles (no static AWS keys in app)
- [x] S3 bucket private; app is the only reader; no public bucket policies
- [x] Dependency scanning (`npm audit` in CI) + Dependabot
- [x] Structured logs w/ request IDs; error reporting hook (Sentry-compatible, `src/lib/logger.ts`)
- [x] Backups: RDS PITR + S3 cross-region replication; restore runbook in docs/deployment.md

## Operational

- [ ] Rotate `SIGNING_SECRET`/`NEXTAUTH_SECRET` quarterly (supports dual-secret rollover)
- [ ] Quarterly access review of production IAM
- [ ] Pen-test before GA; abuse/DMCA takedown process staffed
