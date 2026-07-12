#!/bin/sh
# Container startup: ensure the schema exists and a demo account is seeded,
# then serve. Idempotent — safe to run on every start.
set -e

echo "→ Syncing database schema…"
# db push creates the schema directly from schema.prisma (no migration files
# needed for a self-contained test/demo deployment). For a migration-based
# production rollout, swap this for `npx prisma migrate deploy`.
npx prisma db push --skip-generate --accept-data-loss

echo "→ Seeding demo account (demo@hosty.site / password123)…"
npx prisma db seed || echo "  (seed skipped)"

echo "→ Starting Hosty on :3000"
exec npx next start -p 3000
