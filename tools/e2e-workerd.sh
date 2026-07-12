#!/usr/bin/env bash
# Run the full Playwright E2E suite against Cloudflare's runtime (workerd via
# `wrangler dev`) instead of Node. Proves the entire product — auth, uploads,
# serving, gates, analytics, billing, GraphQL — works on Workers.
#
# Prereqs: Postgres + Redis reachable per .env / .dev.vars, and the S3 stub
# (or R2). NEXT_PUBLIC_* origins must point at the preview port (8787).
#
#   ./tools/e2e-workerd.sh
set -euo pipefail

PORT="${WORKERD_PORT:-8787}"
export E2E_TARGET=workerd
export E2E_BASE_URL="http://localhost:${PORT}"
# helpers build the hosted-site Host header from this — must match the origin
export NEXT_PUBLIC_ROOT_DOMAIN="localhost:${PORT}"

echo "→ building Worker bundle (OpenNext)…"
npx opennextjs-cloudflare build >/dev/null

echo "→ starting wrangler dev on :${PORT}…"
# strip the sandbox proxy so workerd can reach local Postgres/Redis/S3 directly
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  npx wrangler dev --port "${PORT}" >/tmp/hosty-workerd.log 2>&1 &
WRANGLER_PID=$!
trap 'kill $WRANGLER_PID 2>/dev/null || true' EXIT

echo "→ waiting for health…"
for i in $(seq 1 60); do
  if curl -sf "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "→ running Playwright suite against workerd…"
npx playwright test "$@"
