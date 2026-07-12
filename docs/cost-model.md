# Cost model & platform economics

Order-of-magnitude monthly cost for Hosty at three traffic tiers, to make the
platform recommendation concrete. Figures use published list pricing (2025-era)
and round generously; treat them as directional, not quotes.

**Workload assumptions per tier** (a static host is dominated by egress):

| | Small | Growth | Scale |
|---|---|---|---|
| Hosted projects | 1k | 50k | 500k |
| Monthly page/file requests | 5M | 150M | 2B |
| **Egress bandwidth** | 500 GB | 15 TB | 200 TB |
| Stored objects | 50 GB | 2 TB | 40 TB |
| Dashboard/API compute | light | moderate | heavy |

## The decisive line item: egress

For a file host, **bandwidth to visitors dominates everything else**. This is
where the platforms diverge by an order of magnitude.

| Platform | Egress pricing | Growth tier (15 TB) | Scale tier (200 TB) |
|---|---|---|---|
| **Cloudflare (R2 + Workers)** | **$0/GB egress** (R2), requests billed | **~$0** for bandwidth | **~$0** for bandwidth |
| **Vercel** | Metered "Fast Data Transfer" ~$0.15/GB after a small included allowance | 15 TB ≈ **~$2,250/mo** in bandwidth alone | 200 TB ≈ **~$30,000/mo** |
| **AWS/Laravel-Vapor + CloudFront** | ~$0.085/GB (tiered down at volume) | 15 TB ≈ **~$1,275/mo** | 200 TB ≈ **~$12,000/mo** (before commitments) |

R2's zero-egress model is not a small optimization — it is the reason
purpose-built file/media hosts run on it. The other columns are what you pay
to move the same bytes.

## Full stack estimate

Rough all-in monthly totals (compute + storage + egress + DB), USD:

| | Small | Growth | Scale |
|---|---|---|---|
| **Cloudflare all-in** (Workers Paid $5 + R2 storage/ops + Hyperdrive + managed Postgres) | **~$30–50** | **~$300–500** | **~$2.5k–4k** |
| **Vercel** (Pro/Enterprise + bandwidth + separate object storage) | ~$60–100 | **~$2.5k–4k** | **~$30k–45k** |
| **Laravel** (Vapor/Forge + RDS + CloudFront + S3) | ~$70–120 | ~$1.8k–3k | **~$14k–20k** |

The gap widens super-linearly with traffic because egress is the growing term
and only Cloudflare zeroes it.

## Non-cost factors (recap of docs/deployment reasoning)

- **Cloudflare**: best data-plane economics and latency; native wildcard
  subdomains + SSL-for-SaaS custom hostnames; single platform. Adaptations
  (Prisma WASM engine, per-request DB connections + Hyperdrive, presigned
  large uploads) are done and verified in `workerd`.
- **Vercel**: best Next.js DX and preview workflow; fine for the *control
  plane*, but the metered-bandwidth model makes it the wrong home for the
  *data plane* of a hosting product.
- **Laravel**: a full rewrite in PHP; mature ecosystem, but you would still
  front it with a CDN (Cloudflare) for global serving, so it doesn't remove
  the core edge problem — it adds a rebuild.

## Recommendation

**All-Cloudflare** (as built): lowest total cost, best serving latency,
fewest moving parts, and the only option where bandwidth — the dominant cost
of a static host — is free. A **hybrid** (Vercel dashboard + Cloudflare R2/
Workers serving) is defensible if the team strongly prefers Vercel's DX for
the app, accepting two platforms and paying Vercel only for low-bandwidth
dashboard traffic. Laravel is not recommended given a working, tested
TypeScript codebase already exists.
