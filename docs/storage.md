# Storage architecture

## Object layout (S3 / MinIO / R2)

```
hosty-sites/
└── sites/{projectId}/{deploymentId}/{filePath}
    e.g. sites/clxa1…/clxb2…/index.html
         sites/clxa1…/clxb2…/assets/app.3f2a.js
```

- **Immutable prefixes.** A deployment's objects are never mutated; edits and
  re-uploads create a new deployment prefix. This makes edge caching safe,
  rollback instant, and backups trivial (S3 versioning + lifecycle rules).
- **Metadata in Postgres.** The serving path never LISTs S3; it looks up
  `ProjectFile` by `(deploymentId, path)` and GETs exactly one object.

## Upload paths

| Size | Path | Mechanism |
| --- | --- | --- |
| ≤ plan inline limit (100 MB) | `POST /api/upload` | Multipart form streamed through the app (validated, scanned, extracted) |
| Multi-GB single files | `POST /api/upload/presign` | Server issues S3 multipart presigned URLs; browser uploads parts directly to S3 (dropzone switches automatically above 80 MB); `POST /api/upload/complete` finalizes, re-validates the *actual* size against quota, and registers the deployment via **server-side copy** — bytes never pass through the app tier. Staging keys embed the uploader's id and can only be finalized by that account. Requires a CORS rule on the bucket allowing `PUT` from the app origin. ZIPs are excluded (extraction is the bounded inline path) |

ZIP handling: entries are extracted with **zip-slip** path normalization,
capped at 10,000 entries / 2 GB uncompressed / 512 MB per entry (zip-bomb
guards), dotfiles like `.git` and `__MACOSX` are skipped, and a common root
folder is stripped so `site.zip/site/index.html` serves at `/index.html`.

## Quotas

Plan limits (see `src/lib/plans.ts`) are enforced **server-side before any
byte is stored**: project count, per-upload size, and total storage
(`User.storageUsed` counter, reconciled nightly). 402-style errors carry the
upgrade path.

## Versioning, replacement, backups

- Every publish = new `Deployment`; history is listed in the dashboard and
  any version can be restored (pointer swap, no data copy).
- Retention: Free keeps 3 versions, Pro 25, Business 100; a scheduled job
  deletes expired deployment prefixes.
- Backups: S3 cross-region replication + RDS automated snapshots (PITR).

## Large-file serving

Objects are streamed (never buffered) with `Content-Length`, ETag passthrough
and `Accept-Ranges` support, so multi-GB downloads and video seeking work.
Cloudflare caches ranges at the edge.
