# Hosty — Static Hosting Platform

Hosty is a production-grade static hosting platform in the spirit of Tiiny Host.
Upload a website (ZIP), a single HTML file, a PDF, an image or an Office
document — and get a live, HTTPS-secured public URL on your own subdomain in
seconds. Manage projects from a modern dashboard with analytics, lead capture,
feedback, teams, custom domains, an in-browser editor with version history,
a REST API, a CLI and a Chrome extension.

## Feature overview

| Area | What's included |
| --- | --- |
| Publishing | Drag & drop uploads, ZIP extraction, single-file HTML/PDF/image/Office hosting, paste-HTML editor, folder uploads, replace & re-deploy |
| Serving | Wildcard subdomains (`myproject.hosty.site`), automatic HTTPS at the edge, SPA fallback, correct MIME types, immutable-asset caching |
| Sharing | QR codes, built-in URL shortener, copy-link, social share, custom domains with auto-SSL, branding removal on paid plans |
| Security | Password-protected sites, view-only PDFs, rate limiting (Redis), malware scanning hook (ClamAV), CSRF-safe API, XSS-safe serving, Prisma (parameterized SQL) |
| Analytics | Visitors, sessions, page views, referrers, countries, devices, browsers, OS, time-on-page, bounce rate, downloads — with charts & date filters |
| Leads | Email-gated downloads, capture forms, CSV export, Mailchimp / ConvertKit / webhook forwarding |
| Feedback | Visitor comments with highlights, threads, resolve workflow |
| Editing | CodeMirror editor (HTML/CSS/JS/Markdown) with live preview, auto-save, versioned deployments and one-click rollback |
| Teams | Organizations, invitations, roles (owner/admin/editor/viewer), activity log, notifications |
| Developer | REST API v1 with scoped API keys, GraphQL API, JS SDK (`packages/sdk`), webhooks (HMAC-signed), CLI (`packages/cli`), Chrome extension (`extension/`), GitHub Actions deploy recipe |
| Operations | Daily maintenance endpoint (`/api/cron/daily`): per-plan analytics retention, storage reconciliation, retention pruning after downgrades, token/invite cleanup |
| Billing | Stripe subscriptions (Free / Pro / Business), plan quotas enforced at upload time, customer portal |

## Repository layout

```
├── docs/                  Architecture, API spec, security, deployment guides
├── prisma/                Database schema, migrations, seed
├── src/
│   ├── app/               Next.js App Router (dashboard, marketing, APIs, site serving)
│   ├── components/        React components (UI kit, dashboard, editor, charts)
│   ├── lib/               Core services (storage, auth, plans, analytics, billing…)
│   └── middleware.ts      Subdomain routing + rate limiting entry
├── packages/cli/          `hosty` CLI (deploy from terminal / CI)
├── extension/             Chrome extension (MV3)
├── docker-compose.yml     Local stack: Postgres, Redis, MinIO, app
└── .github/workflows/     CI/CD pipeline
```

## Quick start (local)

```bash
cp .env.example .env
docker compose up -d postgres redis minio    # infra
npm install
npx prisma migrate dev                       # create schema
npm run db:seed                              # demo user: demo@hosty.site / password123
npm run dev
```

Open http://localhost:3000. Uploaded sites are served at
`http://<slug>.localhost:3000` (Chrome resolves `*.localhost` automatically)
and also path-based at `/sites/<slug>` for environments without wildcard DNS.

## Documentation

- [Architecture](docs/architecture.md) — high-level diagram, request flows, scaling
- [Database schema](docs/database.md) — ERD and model rationale
- [API specification](docs/api.md) — public REST API v1 + internal endpoints
- [Authentication](docs/auth.md) — session, OAuth, 2FA, API keys
- [Storage](docs/storage.md) — S3 layout, deployments, multi-GB uploads
- [Deployment](docs/deployment.md) — AWS + Cloudflare production topology
- [Security checklist](docs/security.md)
- [Testing guide](docs/testing.md)

## License

Proprietary — all rights reserved.
