import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite. Requires PostgreSQL + Redis + S3 (or tools/s3-stub.js) and a
 * production build. The web server + S3 stub are started automatically.
 *
 * Local:  npm run build && npm run test:e2e
 * CI:     see .github/workflows/ci.yml (e2e job)
 *
 * Env: E2E_BASE_URL (default http://localhost:3000). When Playwright's
 * managed browser build isn't installed, set PLAYWRIGHT_CHROMIUM_PATH to a
 * system Chromium binary.
 */

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false, // suite shares one DB + one seeded session
  workers: 1,
  // E2E runs against a live server + real DB/storage; a single retry absorbs
  // legitimate timing variance (auto-save debounce, deploy latency) without
  // masking real regressions.
  retries: 1,
  timeout: 45_000,
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
      command: "npm start",
      url: `${baseURL}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
