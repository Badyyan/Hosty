import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

/**
 * Direct DB access for test arrangement that has no UI path in E2E
 * (e.g. plan upgrades normally driven by Stripe webhooks).
 * Loads .env manually — the Playwright process doesn't get Next's env loader.
 */

function loadDotEnv() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotEnv();

let prisma: PrismaClient | null = null;
export function db(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

/** Simulate a completed Stripe upgrade for the E2E account. */
export async function setPlan(email: string, plan: "FREE" | "PRO" | "BUSINESS") {
  const user = await db().user.findUniqueOrThrow({ where: { email } });
  await db().subscription.upsert({
    where: { userId: user.id },
    update: { plan, status: "active" },
    create: { userId: user.id, plan, status: "active" },
  });
}

export function testCreds(): { email: string; password: string } {
  return JSON.parse(fs.readFileSync(path.join(__dirname, ".auth/creds.json"), "utf8"));
}
