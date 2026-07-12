# Deploy Hosty to a live URL on Vercel (only a database needed)

Hosty can run on Vercel with **one free managed dependency — a Postgres
database.** No S3/R2 bucket, no Redis: set `STORAGE_DRIVER=postgres` and hosted
files live in the database; rate limiting falls back to in-memory. This is the
fastest way to get a public, shareable URL to click around.

> Storing file bytes in Postgres is great for a demo/test. For a production
> file host, use the S3/R2 driver (default) + Cloudflare — see
> [deploy-cloudflare.md](deploy-cloudflare.md) and [cost-model.md](cost-model.md).

## 1. Create a free Postgres (Neon — ~2 min)

1. Go to <https://neon.tech> → sign up → **Create project**.
2. Copy the connection string. Use the **direct** (non-pooled) string that
   ends with `?sslmode=require` — the build runs a schema sync that needs a
   direct connection. It looks like:
   `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

(Any Postgres works — Supabase, Railway, RDS. Neon's free tier is simplest.)

## 2. Import the repo into Vercel

1. <https://vercel.com/new> → import **badyyan/hosty**.
2. Set **Production Branch** to `claude/static-hosting-platform-dt16w4`
   (Project → Settings → Git), or merge that branch to `main` first.
3. Vercel auto-detects Next.js. The build command is already set by
   `vercel.json` (it generates Prisma, syncs the schema, then builds).

## 3. Set environment variables

In the Vercel project's **Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | your Neon **direct** connection string |
| `STORAGE_DRIVER` | `postgres` |
| `NEXTAUTH_SECRET` | any random string — `openssl rand -base64 32` |
| `SIGNING_SECRET` | another random string |
| `NEXT_PUBLIC_APP_URL` | `https://<your-project>.vercel.app` (your Vercel URL) |

Optional (leave unset for the free tier):
`STRIPE_*` (billing), `SMTP_*` (emails), `GOOGLE_*`/`GITHUB_*` (OAuth login),
`CRON_SECRET` (maintenance). Without these, the corresponding feature is simply
inactive — core hosting, analytics, gates, editor and the API all work.

## 4. Deploy

Click **Deploy**. The build creates the schema automatically. When it finishes
you get a live URL like `https://hosty-xxxx.vercel.app`.

## 5. Use it

- Open the URL and **Sign up** (self-serve registration — no seeding needed).
- Drag-and-drop a ZIP or an HTML/PDF/image; you get a live link served at
  `https://<your-app>.vercel.app/sites/<slug>` (path-based, since `*.vercel.app`
  has no wildcard subdomains — auto-enabled on Vercel).
- Try analytics, the in-browser editor, password/email gates, QR codes, the
  REST API and GraphQL.

### Notes & limits on this mode

- **Subdomains → paths.** Real `slug.yourdomain.com` URLs need a wildcard DNS
  record on a custom domain; on `*.vercel.app` sites are served at
  `/sites/<slug>`. Add a custom domain with a `*` record and set
  `PATH_SERVING=0` for subdomain URLs.
- **Large uploads.** The multi-GB presigned path needs real object storage; in
  Postgres mode use the standard upload (fine for typical sites/docs). Vercel
  also caps request bodies (~4.5 MB on serverless functions) — for bigger files
  switch to the S3 driver.
- **Custom-domain SSL-for-SaaS** (customer domains) is a Cloudflare feature;
  not available on the Vercel demo path.
