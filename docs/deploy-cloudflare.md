# Deploying Hosty on Cloudflare Workers

Hosty runs natively on Cloudflare Workers via the OpenNext adapter. This
codebase has been **verified end-to-end in `workerd`** (Cloudflare's runtime):
login, ZIP upload → extraction → S3 puts, subdomain serving with beacon
injection, password gates, and analytics all work under
`opennextjs-cloudflare preview`.

## Architecture on Cloudflare

| Concern | Service |
| --- | --- |
| App (dashboard + APIs + site serving) | Workers (OpenNext bundle, `nodejs_compat`) |
| Static app assets | Workers Assets (bundled automatically) |
| Database | Any managed Postgres (Neon, Supabase, RDS…) behind **Hyperdrive** (pooling + edge caching of connections) |
| Object storage | **R2** — the storage layer is S3-compatible; only env vars change |
| Wildcard subdomains | Worker route `*.your-domain.com/*` on your zone |
| Rate limiting | In-memory fallback works out of the box; point `REDIS_URL` at Upstash-style Redis over TCP if you want shared limits |
| Cron | Cloudflare Cron Trigger or any scheduler hitting `POST /api/cron/daily` |

Key adaptation details (already in the code):

- `src/lib/db.ts` switches to the **Prisma WASM engine + `pg` driver adapter**
  when `DB_ADAPTER=pg` (set in `wrangler.jsonc`), and caches the client **per
  request** — workerd forbids sharing TCP pools across requests. Use
  Hyperdrive for real pooling.
- `wrangler.jsonc` + `open-next.config.ts` configure the OpenNext build.
- Everything else (S3 storage, HMAC cookies, analytics, Stripe) is
  runtime-agnostic.

## One-time setup

1. **Enable R2** in the Cloudflare dashboard (R2 → purchase/enable; free tier
   is fine), then create a bucket and an **R2 API token** (Access Key ID +
   Secret) scoped to it:

   ```bash
   npx wrangler r2 bucket create hosty-sites
   ```

2. **Postgres**: create a database (Neon's free tier works well) and run the
   schema + seed:

   ```bash
   DATABASE_URL=postgres://… npx prisma migrate deploy   # or db push
   ```

3. **Hyperdrive** (recommended):

   ```bash
   npx wrangler hyperdrive create hosty-db --connection-string="postgres://…"
   ```

   Put the returned id in `wrangler.jsonc` under `hyperdrive` (binding name
   `HYPERDRIVE` — the code picks it up automatically).

4. **Vars**: edit `wrangler.jsonc` `vars` — set `NEXT_PUBLIC_APP_URL`,
   `NEXT_PUBLIC_ROOT_DOMAIN` and `NEXTAUTH_URL` to your real domain (or your
   `*.workers.dev` URL to start). These are also needed at **build** time so
   the client bundle gets the right origins — export them in the shell or CI
   env when running the build.

5. **Secrets**:

   ```bash
   for s in DATABASE_URL NEXTAUTH_SECRET SIGNING_SECRET CRON_SECRET \
            S3_ENDPOINT S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
     npx wrangler secret put $s
   done
   # plus S3_BUCKET/S3_REGION/S3_FORCE_PATH_STYLE (vars or secrets),
   # STRIPE_* and SMTP_* when you enable billing/email.
   ```

   For R2, `S3_ENDPOINT` is `https://<account-id>.r2.cloudflarestorage.com`,
   region `auto`, `S3_FORCE_PATH_STYLE=true`.

## Deploy

```bash
npm run deploy:cf        # opennextjs-cloudflare build && deploy
```

Or push to `main` with a `CLOUDFLARE_API_TOKEN` repo secret — the
`deploy-cloudflare` CI job does the same build + deploy (see
`.github/workflows/ci.yml`). Create the token at dash.cloudflare.com →
My Profile → API Tokens → "Edit Cloudflare Workers" template.

### Wildcard subdomains & custom domains

Once you own a zone on Cloudflare, uncomment `routes` in `wrangler.jsonc`:

```jsonc
"routes": [
  { "pattern": "hosty.site/*", "zone_name": "hosty.site" },
  { "pattern": "*.hosty.site/*", "zone_name": "hosty.site" }
]
```

The wildcard route gives every project subdomain automatic HTTPS. Customer
custom domains use [Cloudflare for SaaS custom hostnames](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/)
pointed at the same Worker.

### Cron

Schedule the maintenance job daily:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/daily
```

(Any scheduler works; a Cloudflare Cron Trigger on a 5-line companion Worker
that makes this fetch is the all-Cloudflare option.)

## Local preview in workerd

```bash
# infra: Postgres + (optionally) tools/s3-stub.js as S3
cp .env.example .env       # NEXT_PUBLIC_* must match the preview origin (localhost:8787)
cat > .dev.vars            # runtime secrets for wrangler dev (same names as prod secrets)
npm run preview:cf         # builds with OpenNext and serves via wrangler dev on :8787
```

## Known limits on Workers

- **Per-request DB clients**: without Hyperdrive every request opens fresh
  Postgres connections; use Hyperdrive in production.
- **Multi-GB uploads**: the presigned-multipart path (browser → R2 direct)
  is the right route on Workers; inline uploads are bounded by Workers
  request-size limits (100 MB on paid plans).
- **bcrypt cost**: login/register burn real CPU (~1s at cost 12). Fine on
  paid Workers (30 s CPU limit); consider cost 10 on the free tier.
- **ClamAV scanning** (`CLAMAV_HOST`) requires TCP egress to your scanner —
  works via `connect()`, or leave unset.
