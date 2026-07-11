#!/usr/bin/env node
/**
 * Hosty CLI — deploy from the terminal or CI.
 *
 *   hosty login                         store an API key (~/.hosty.json)
 *   hosty deploy <dir|file> [--name X] [--slug y] [--project <id>]
 *   hosty list                          recent projects
 *   hosty delete <projectId>
 *   hosty analytics <projectId> [--days 30]
 *
 * Env overrides: HOSTY_API_KEY, HOSTY_URL (default https://hosty.site)
 */
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline/promises";
import AdmZip from "adm-zip";

const CONFIG_PATH = path.join(os.homedir(), ".hosty.json");
const BASE = process.env.HOSTY_URL ?? readConfig().url ?? "https://hosty.site";

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function apiKey() {
  const key = process.env.HOSTY_API_KEY ?? readConfig().apiKey;
  if (!key) fail("Not logged in. Run `hosty login` or set HOSTY_API_KEY.");
  return key;
}

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

async function api(method, pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}` },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(data.error ?? `${method} ${pathname} → HTTP ${res.status}`);
  return data;
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

async function cmdLogin() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const url = (await rl.question(`Hosty URL [${BASE}]: `)).trim() || BASE;
  const key = (await rl.question("API key (hty_…): ")).trim();
  rl.close();
  if (!key.startsWith("hty_")) fail("That doesn't look like a Hosty API key.");
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ url, apiKey: key }, null, 2), { mode: 0o600 });
  console.log(`✔ Saved credentials to ${CONFIG_PATH}`);
}

function bundle(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return { data: fs.readFileSync(target), filename: path.basename(target) };
  }
  const zip = new AdmZip();
  zip.addLocalFolder(target, "", (p) => !p.includes("node_modules") && !p.startsWith("."));
  return { data: zip.toBuffer(), filename: `${path.basename(path.resolve(target))}.zip` };
}

async function cmdDeploy(args) {
  const target = args[0];
  if (!target || !fs.existsSync(target)) fail("Usage: hosty deploy <dir|file>");
  const { data, filename } = bundle(target);
  console.log(`↑ Uploading ${filename} (${(data.length / 1024).toFixed(0)} KB)…`);

  const form = new FormData();
  form.append("file", new Blob([data]), filename);
  const name = flag(args, "name");
  const slug = flag(args, "slug");
  if (name) form.append("name", name);
  if (slug) form.append("slug", slug);

  const projectId = flag(args, "project");
  const result = projectId
    ? await api("PUT", `/api/v1/projects/${projectId}`, form)
    : await api("POST", "/api/v1/projects", form);

  console.log(`✔ Live at ${result.project.url}`);
}

async function cmdList() {
  const { projects } = await api("GET", "/api/v1/projects?limit=20");
  if (!projects.length) return console.log("No projects yet.");
  for (const p of projects) {
    console.log(`${p.id}  v${String(p.version).padEnd(3)} ${p.url}  (${p.name})`);
  }
}

async function cmdDelete(args) {
  if (!args[0]) fail("Usage: hosty delete <projectId>");
  await api("DELETE", `/api/v1/projects/${args[0]}`);
  console.log("✔ Deleted");
}

async function cmdAnalytics(args) {
  if (!args[0]) fail("Usage: hosty analytics <projectId> [--days 30]");
  const days = flag(args, "days") ?? "30";
  const a = await api("GET", `/api/v1/projects/${args[0]}/analytics?days=${days}`);
  console.log(`Last ${days} days: ${a.visitors} visitors · ${a.pageViews} page views · ${a.sessions} sessions · bounce ${(a.bounceRate * 100).toFixed(0)}%`);
  for (const p of a.topPages.slice(0, 5)) console.log(`  ${p.key}  ${p.count}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = {
  login: cmdLogin,
  deploy: cmdDeploy,
  list: cmdList,
  delete: cmdDelete,
  analytics: cmdAnalytics,
};

if (!commands[cmd]) {
  console.log("Hosty CLI\n\nCommands:\n  login\n  deploy <dir|file> [--name X] [--slug y] [--project id]\n  list\n  delete <projectId>\n  analytics <projectId> [--days N]");
  process.exit(cmd ? 1 : 0);
}
commands[cmd](rest).catch((e) => fail(e.message));
