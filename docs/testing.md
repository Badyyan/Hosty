# Testing guide

## Layers

| Layer | Tooling | What to cover |
| --- | --- | --- |
| Unit | Vitest (`npm test`) | Pure logic: slugs, plans/quotas, zip safety, MIME allow-list, HMAC cookies, rate-limit math. See `src/lib/__tests__/` |
| Integration | Vitest + ephemeral Postgres (CI service container) | Upload → deployment → serving metadata; auth flows; quota enforcement |
| E2E | Playwright (recommended next step) | Sign up → upload zip → visit subdomain → analytics appear; password gate; editor save → new version → rollback |
| Load | k6 | Serving path (`GET /sites/:slug/*`) target: p99 < 80 ms from origin, cache-hit ratio > 95% at edge |
| Security | `npm audit` in CI, ZAP baseline scan against staging | Headers, auth bypass, IDOR on project routes |

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
