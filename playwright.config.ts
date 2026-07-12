import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite. Requires PostgreSQL + Redis + S3 (or tools/s3-stub.js) and a
 * production build. The web server + S3 stub are started automatically.
 *
 * Local:  npm run build && npm run test:e2e
 * CI:     see .github/workflows/ci.yml (e2e job)
 *
 * Env:
 * - E2E_BASE_URL (default http://localhost:3000)
 * - E2E_TARGET=workerd runs the identical suite against `wrangler dev`
 *   (Cloudflare's runtime) on :8787 instead of `next start` — proves the
 *   whole product works on Workers, not just Node. See npm run test:e2e:cf.
 * - PLAYWRIGHT_CHROMIUM_PATH: system Chromium when the managed build is absent.
 */

const workerd = process.env.E2E_TARGET === "workerd";
const baseURL =
  process.env.E2E_BASE_URL ?? (workerd ? "http://localhost:8787" : "http://localhost:3000");
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false, // suite shares one DB + one seeded session
  workers: 1,
  // E2E runs against a live server + real DB/storage; a retry absorbs
  // legitimate timing variance (auto-save debounce, deploy latency) without
  // masking real regressions. The workerd target is ~10x slower per request
  // (per-request WASM Prisma client without Hyperdrive), so it gets a larger
  // timeout budget and an extra retry.
  retries: workerd ? 2 : 1,
  timeout: workerd ? 120_000 : 45_000,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    storageState: "tests/e2e/.auth/user.json",
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tools/s3-stub.js",
      url: "http://127.0.0.1:9100/__health",
      reuseExistingServer: true,
    },
    {
      // On the workerd target the server is started out-of-band (wrangler dev);
      // reuseExistingServer means Playwright just waits for it to be healthy.
      command: workerd
        ? "echo 'expecting wrangler dev on :8787 (npm run test:e2e:cf starts it)'"
        : "npm start",
      url: `${baseURL}/api/health`,
      reuseExistingServer: true,
      timeout: workerd ? 120_000 : 60_000,
    },
  ],
});
