# API specification

Two API surfaces:

1. **Internal API** (`/api/...`) — used by the dashboard. Session-cookie auth,
   same-origin only (CSRF-safe: state-changing routes verify the `Origin`
   header and use JSON bodies, never form-encodable ones).
2. **Public REST API v1** (`/api/v1/...`) — used by the CLI, Chrome extension,
   CI/CD and customers. Auth via `Authorization: Bearer <api key>`.

All responses are JSON (`{ "error": string }` on failure). Rate limits are
per-user/per-key via Redis; limit state is exposed in `X-RateLimit-*` headers.

## Public API v1

### Authentication

Create keys in **Dashboard → API keys**. Keys are shown once and stored
hashed (SHA-256). Scopes: `read`, `write`.

```
Authorization: Bearer hty_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Endpoints

| Method | Path | Scope | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/me` | read | Key owner, plan and usage |
| GET | `/api/v1/projects` | read | List projects (`?search=&limit=&cursor=`) |
| POST | `/api/v1/projects` | write | Create + deploy. Multipart: `file` (zip/html/pdf/…), optional `name`, `slug` |
| GET | `/api/v1/projects/:id` | read | Project detail incl. active deployment |
| PUT | `/api/v1/projects/:id` | write | Re-deploy (multipart `file`) — replaces content, keeps URL |
| PATCH | `/api/v1/projects/:id` | write | Update settings (name, password, seo, gates) |
| DELETE | `/api/v1/projects/:id` | write | Delete project and all deployments |
| GET | `/api/v1/projects/:id/analytics` | read | Summary stats (`?from=&to=`) |
| GET | `/api/v1/projects/:id/leads` | read | Captured leads (JSON or `?format=csv`) |

#### Create & deploy example

```bash
curl -X POST https://hosty.site/api/v1/projects \
  -H "Authorization: Bearer $HOSTY_API_KEY" \
  -F "file=@dist.zip" -F "name=My Portfolio"
```

```json
{
  "project": {
    "id": "clx…",
    "slug": "my-portfolio",
    "url": "https://my-portfolio.hosty.site",
    "deployment": { "id": "clx…", "files": 14, "bytes": 1048576 }
  }
}
```

### GraphQL

`POST /api/graphql` — same API-key auth, read-heavy companion to REST
(deploys stay on REST; multipart uploads don't belong in GraphQL). One round
trip for account + projects + nested analytics + leads:

```bash
curl -X POST https://hosty.site/api/graphql \
  -H "Authorization: Bearer $HOSTY_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":"{ me { email plan } projects { name url analytics(days: 7) { visitors pageViews } } }"}'
```

Queries: `me`, `projects(search, limit)`, `project(id)` (with `files`,
`analytics(days)`, `leads`). Mutations (require the `write` scope):
`deleteProject(id)`, `setProjectName(id, name)`.

### SDK

[`@hosty/sdk`](../packages/sdk/README.md) wraps REST v1 + GraphQL with zero
dependencies: `me`, `listProjects`, `getProject`, `deploy`, `update`,
`deleteProject`, `analytics`, `graphql`.

### Webhooks

Configure endpoints in **Dashboard → Settings → Webhooks**. Events:
`project.created`, `project.deployed`, `project.deleted`, `lead.captured`,
`comment.created`. Deliveries are signed:

```
X-Hosty-Signature: sha256=hex(hmac_sha256(secret, rawBody))
X-Hosty-Event: project.deployed
```

Retries: 3 attempts with exponential backoff; deliveries and response codes
are visible in the dashboard.

## Internal API (summary)

| Area | Routes |
| --- | --- |
| Auth | `POST /api/auth/register`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, NextAuth at `/api/auth/[...nextauth]`, `POST /api/auth/2fa/{setup,verify,disable}` |
| Upload | `POST /api/upload` (multipart, ≤ plan limit), `POST /api/upload/presign` (multi-GB multipart S3), `POST /api/upload/paste` (raw HTML) |
| Projects | CRUD at `/api/projects[/:id]`, `/:id/files`, `/:id/files/content` (editor read/write), `/:id/versions` + `/:id/versions/:dpl/rollback`, `/:id/password`, `/:id/analytics`, `/:id/leads(.csv)`, `/:id/comments` |
| Sharing | `POST /api/projects/:id/shortlink`, `GET /api/projects/:id/qrcode` |
| Domains | `GET/POST /api/domains`, `POST /api/domains/:id/verify`, `DELETE /api/domains/:id` |
| Teams | `GET/POST /api/teams`, `/api/teams/:id/members`, `/api/teams/:id/invites`, `POST /api/teams/invites/accept` |
| Keys | `GET/POST/DELETE /api/keys[/:id]` |
| Webhooks | `GET/POST/DELETE /api/webhooks[/:id]` |
| Billing | `POST /api/billing/checkout`, `POST /api/billing/portal`, `POST /api/stripe/webhook` (Stripe-signed) |
| Public ingest | `POST /_hosty/event` (beacon), `POST /_hosty/lead`, `GET/POST /_hosty/comments`, `POST /_hosty/unlock` (password gate) — these run on hosted-site origins |
| Maintenance | `POST /api/cron/daily` (Bearer `CRON_SECRET`) — analytics retention per plan, storage-counter reconciliation, deployment retention after downgrades, expired token/invite cleanup. Schedule daily via EventBridge/Cloud Scheduler/crontab |
