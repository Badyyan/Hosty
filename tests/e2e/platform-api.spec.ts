import { test, expect } from "@playwright/test";
import { siteZip } from "./helpers";
import { db, testCreds } from "./db";
import { createHash, randomBytes } from "crypto";
import type { HostyClient as HostyClientType } from "../../packages/sdk/index";

// The SDK is plain ESM with zero deps — exercise the real package against the
// app. Dynamic import because Playwright compiles specs to CJS.
let HostyClient: new (o: { apiKey: string; baseUrl?: string }) => HostyClientType;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HostyError: any;
test.beforeAll(async () => {
  const sdk = await import("../../packages/sdk/index.js");
  HostyClient = sdk.HostyClient;
  HostyError = sdk.HostyError;
});

/** Mint an API key straight into the DB (the UI path is covered in api.spec). */
async function mintKey(scopes = ["read", "write"]): Promise<string> {
  const user = await db().user.findUniqueOrThrow({ where: { email: testCreds().email } });
  const key = `hty_${randomBytes(32).toString("base64url")}`;
  await db().apiKey.create({
    data: {
      userId: user.id,
      name: "platform e2e",
      keyHash: createHash("sha256").update(key).digest("hex"),
      prefix: key.slice(0, 12),
      scopes,
    },
  });
  return key;
}

test.describe("SDK + GraphQL", () => {
  test("full SDK lifecycle: deploy → analytics → graphql → delete", async ({ baseURL }) => {
    const hosty = new HostyClient({ apiKey: await mintKey(), baseUrl: baseURL! });

    const me = await hosty.me();
    expect(me.email).toBe(testCreds().email);

    const { project } = await hosty.deploy(siteZip(), "sdk-site.zip", { name: "SDK Site" });
    expect(project.url).toContain(project.slug);

    const listed = await hosty.listProjects({ search: "SDK Site" });
    expect(listed.some((p) => p.id === project.id)).toBe(true);

    const detail = await hosty.getProject(project.id);
    expect(Array.isArray(detail.deployment?.files)).toBe(true);

    await hosty.update(
      project.id,
      Buffer.from("<!doctype html><html><body><h1>SDK v2</h1></body></html>"),
      "v2.html"
    );

    const stats = await hosty.analytics(project.id, { days: 7 });
    expect(typeof stats.visitors).toBe("number");

    // GraphQL: one round trip for account + project + nested analytics
    const data = await hosty.graphql<{
      me: { plan: string };
      project: { name: string; version: number; analytics: { pageViews: number } };
    }>(
      `query($id: ID!) {
        me { plan }
        project(id: $id) { name version analytics(days: 7) { pageViews } }
      }`,
      { id: project.id }
    );
    expect(data.project.name).toBe("SDK Site");
    expect(data.project.version).toBe(2);

    // GraphQL mutation
    const renamed = await hosty.graphql<{ setProjectName: { name: string } }>(
      `mutation($id: ID!) { setProjectName(id: $id, name: "SDK Renamed") { name } }`,
      { id: project.id }
    );
    expect(renamed.setProjectName.name).toBe("SDK Renamed");

    await hosty.deleteProject(project.id);
    await expect(hosty.getProject(project.id)).rejects.toThrow(HostyError);
  });

  test("GraphQL enforces auth and scopes", async ({ request, baseURL }) => {
    // no key → 401
    const anon = await request.post("/api/graphql", {
      headers: { "Content-Type": "application/json" },
      data: { query: "{ me { email } }" },
    });
    expect(anon.status()).toBe(401);

    // read-only key can query but not mutate
    const readOnly = new HostyClient({ apiKey: await mintKey(["read"]), baseUrl: baseURL! });
    const me = await readOnly.graphql<{ me: { email: string } }>("{ me { email } }");
    expect(me.me.email).toBe(testCreds().email);
    await expect(
      readOnly.graphql(`mutation { deleteProject(id: "whatever") }`)
    ).rejects.toThrow(/scope/);
  });
});
