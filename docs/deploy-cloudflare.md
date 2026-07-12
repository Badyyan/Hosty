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

### Workers-runtime adaptations (already in the code, verified in `workerd`)

Making a Node-shaped app run correctly on Workers took five specific fixes.
Each is a real Workers constraint worth understanding:

1. **Prisma engine** — Workers can't run Prisma's native engine, so `db.ts`
   uses the **WASM query engine + `@prisma/adapter-pg`** when `DB_ADAPTER=pg`.
2. **Per-request DB client, closed at request end** — workerd forbids reusing
   an I/O object (a TCP pool) across requests, so the client+pool are built
   per request and **`pool.end()` runs when the request finishes** (the custom
   entrypoint `cloudflare/worker.ts` calls `disposeRequest(ctx)`). Skip the
   close and every request leaks Postgres connections until the DB refuses new
   ones. **Hyperdrive** is strongly recommended in production so these
   short-lived connections hit a pooled local socket, not Postgres directly.
3. **S3 client uses the fetch handler, per request** — under `nodejs_compat`
   the AWS SDK auto-selects Node's HTTP handler, whose sockets hang in
   workerd; `storage.ts` forces `@smithy/fetch-http-handler` and caches the
   client per request (its handler state can't cross requests either).
4. **S3 checksums off + fetch-native streaming** — the SDK's default CRC32
   upload checksum hangs in workerd (and R2 rejects it), so the client sets
   `requestChecksumCalculation: "WHEN_REQUIRED"`. Response bodies are consumed
   via the SDK's `transformToString()` / `transformToWebStream()` — never by
   assuming a Node `Readable`.
5. **No ioredis** — ioredis needs Node TCP sockets, so `getRedis()` returns
   `null` on Workers. Rate limiting falls back to its in-memory window and the
   host-lookup cache is skipped (Postgres/Hyperdrive absorb the reads). For a
   **shared** edge cache/limiter, wire **Upstash Redis** (REST-based, works on
   Workers) behind the same `getRedis()` seam.
6. **Background work is awaited, not fire-and-forget** — the per-request DB
   pool closes when the response is sent, so a `void db.write()` after the
   response is lost on Workers. Feature-critical background writes (activity
   log, notifications) are therefore `await`ed in their handlers. External
   best-effort work (webhook delivery, marketing-list forwarding) stays
   fire-and-forget: reliable on Node, but on Workers it should be moved to a
   **durable queue (Cloudflare Queues)** for guaranteed delivery. Also note the
   S3 batch `DeleteObjects` and the SDK's `CompleteMultipartUpload` *response*
   parser don't work under workerd — the code uses per-object deletes and a
   presigned-`fetch()` complete instead.

`wrangler.jsonc` + `open-next.config.ts` configure the OpenNext build;
`cloudflare/worker.ts` is the entrypoint (wraps OpenNext, adds the cron
trigger + per-request DB disposal). Everything else — HMAC cookies, analytics,
Stripe, GraphQL — is runtime-agnostic.

> The AWS SDK versions are **pinned exact** (`3.775.0`) precisely because a
> minor float re-introduces the checksum/stream hangs. Don't loosen them
> without re-running `npm run test:e2e:cf`.

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

Maintenance runs via a **native Cloudflare Cron Trigger** — no external
scheduler. `wrangler.jsonc` declares `"triggers": { "crons": ["0 4 * * *"] }`
and the `scheduled()` handler in `cloudflare/worker.ts` self-invokes
`/api/cron/daily` with `CRON_SECRET`. Adjust the cron expression to taste.
(The HTTP endpoint still works for manual runs or an external scheduler.)

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
