# Deployment & infrastructure

Two supported production targets:

1. **AWS + Cloudflare CDN** (below) — containers behind an ALB, Cloudflare in front.
2. **Cloudflare Workers end-to-end** — serverless on Workers + R2 + Hyperdrive;
   see [deploy-cloudflare.md](deploy-cloudflare.md). The Workers build is
   verified in `workerd` by the repo's tooling (`npm run preview:cf`).

## Production topology (AWS + Cloudflare)

| Layer | Service | Notes |
| --- | --- | --- |
| DNS + CDN + SSL | Cloudflare | Wildcard `*.hosty.site` proxied; **SSL for SaaS** issues certs for customer domains; edge caching of site assets; WAF |
| Compute | ECS Fargate (or EKS) | Stateless Next.js containers, min 2 tasks across 2 AZs, target-tracking autoscaling on CPU + ALB RPS |
| Load balancer | ALB | HTTP/2, health check `/api/health` |
| Database | RDS PostgreSQL (Multi-AZ) | PITR backups, read replica for analytics queries at scale |
| Cache | ElastiCache Redis | Rate limits, host→project cache, wakeup locks |
| Storage | S3 | Versioning + lifecycle (old deployments → IA after 30 d), cross-region replication |
| Scanning | ClamAV sidecar / Lambda | `CLAMAV_HOST` env |
| Email | SES (SMTP creds) | Password reset, invites, notifications |
| Observability | CloudWatch + Sentry | JSON logs with request IDs, error reporting via `src/lib/logger.ts` |

### Custom domains

1. Customer adds `docs.acme.com` in the dashboard → we issue a TXT
   verification token + CNAME target (`domains.hosty.site`).
2. `POST /api/domains/:id/verify` checks DNS over DNS-over-HTTPS; on success
   the domain row flips to `VERIFIED` and Cloudflare SSL-for-SaaS custom
   hostname is created via API (automatic certificate).
3. Requests arrive with `Host: docs.acme.com`; middleware resolves the domain
   → project slug via Redis-cached Postgres lookup.

## Local / self-hosted

```bash
docker compose up          # app + postgres + redis + minio, fully working stack
```

## Environments

- `main` branch → staging (auto-deploy on merge)
- Git tag `v*` → production (manual approval gate in the pipeline)
- Migrations run as a pre-deploy job (`prisma migrate deploy`); all
  migrations must be expand/contract-safe for zero-downtime rollouts.

## CI/CD pipeline (`.github/workflows/ci.yml`)

1. **lint + typecheck** — `next lint`, `tsc --noEmit`
2. **test** — `vitest` unit tests (against ephemeral Postgres service)
3. **build** — `next build` with Prisma generate
4. **docker** — build & push image tagged with git SHA
5. **deploy** — staging on `main`; production on tag with approval

## Runbooks

- **Restore DB:** promote latest RDS snapshot → update `DATABASE_URL` secret →
  rolling restart. RPO ≤ 5 min (PITR), RTO ~30 min.
- **S3 region loss:** flip `S3_ENDPOINT` to replica bucket (read-only mode
  until primary returns).
- **Cache poisoning suspicion:** purge Cloudflare by `deploymentId` prefix tag.
