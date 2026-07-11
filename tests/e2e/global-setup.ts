import { request, type FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Registers a fresh account for this run and saves an authenticated
 * storage state that every test reuses (avoids the register rate limit
 * and per-test login overhead). Credentials are exposed to specs via
 * tests/e2e/.auth/creds.json.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = (config.projects[0]?.use?.baseURL as string) ?? "http://localhost:3000";
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.hosty.site`;
  const password = "e2e-password-123";

  const ctx = await request.newContext({ baseURL });

  const reg = await ctx.post("/api/auth/register", {
    data: { name: "E2E User", email, password },
    headers: { Origin: baseURL },
  });
  if (!reg.ok()) {
    throw new Error(`register failed: ${reg.status()} ${await reg.text()}`);
  }

  // NextAuth credentials sign-in: fetch a CSRF token, then post the callback.
  const csrf = (await (await ctx.get("/api/auth/csrf")).json()).csrfToken as string;
  const login = await ctx.post("/api/auth/callback/credentials", {
    form: { csrfToken: csrf, email, password, json: "true" },
    headers: { Origin: baseURL },
  });
  if (!login.ok()) {
    throw new Error(`login failed: ${login.status()} ${await login.text()}`);
  }

  const authDir = path.join(__dirname, ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  await ctx.storageState({ path: path.join(authDir, "user.json") });
  fs.writeFileSync(path.join(authDir, "creds.json"), JSON.stringify({ email, password }));
  await ctx.dispose();
}
