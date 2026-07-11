# Testing guide

## Layers

| Layer | Tooling | What to cover |
| --- | --- | --- |
| Unit | Vitest (`npm test`) | Pure logic: slugs, plans/quotas, zip safety, MIME allow-list, HMAC cookies, rate-limit math. See `src/lib/__tests__/` |
| E2E | Playwright (`npm run test:e2e`) | Real browser + real stack: registration/login, zip upload → subdomain serving (beacon, MIME, clean URLs, 404), paste-HTML, analytics beacon → dashboard, password gate lifecycle (wrong/right/rotation), email gate → lead in dashboard, editor auto-save → v2 → rollback, API keys UI → public API v1 deploy/update/delete. See `tests/e2e/` |
| Load | k6 | Serving path (`GET /sites/:slug/*`) target: p99 < 80 ms from origin, cache-hit ratio > 95% at edge |
| Security | `npm audit` in CI, ZAP baseline scan against staging | Headers, auth bypass, IDOR on project routes |

## Running the E2E suite locally

The suite needs PostgreSQL, Redis and object storage (MinIO **or** the
bundled zero-dependency stub `tools/s3-stub.js`), plus a production build:

```bash
cp .env.example .env       # point DATABASE_URL/REDIS_URL/S3_* at your services
npx prisma db push
npm run build
npm run test:e2e           # starts the S3 stub + `next start` automatically
```

If Playwright's managed browser isn't installed, point at a system Chromium:
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

Notes on the harness:

- `tests/e2e/global-setup.ts` registers a fresh account per run and stores an
  authenticated `storageState`, so specs don't fight the register rate limit.
- Gate specs upgrade the test account to PRO by writing the subscription row
  directly (`tests/e2e/db.ts`) — the Stripe webhook is the only production
  writer, and E2E shouldn't depend on Stripe.
- Hosted-site assertions run against real subdomains: Chromium resolves
  `*.localhost` to 127.0.0.1, and API-level checks send a `Host:` header.

## Conventions

- Test files live next to code in `__tests__/` folders.
- Anything that touches quotas, auth, or path handling **must** have unit
  tests — these are the money/security paths.
- Serving-path fixtures: a tiny zip fixture is generated in-test (no binary
  fixtures in git).

## What is already covered

- `slugify`/reserved-slug rules
- zip-slip path traversal rejection & root-folder stripping
- plan quota resolution and upload-size enforcement
- unlock-cookie HMAC sign/verify + password-version invalidation
