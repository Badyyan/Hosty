# @hosty/sdk

Official JavaScript/TypeScript SDK for the [Hosty](../../README.md) API.
Zero dependencies — uses the platform `fetch`/`FormData` (Node ≥ 18).

```js
import { HostyClient } from "@hosty/sdk";

const hosty = new HostyClient({
  apiKey: process.env.HOSTY_API_KEY, // Dashboard → API keys
  // baseUrl: "https://hosty.site"   // override for self-hosted instances
});

// Deploy a zip (or single html/pdf/image) — instantly live
const { project } = await hosty.deploy(await fs.readFile("dist.zip"), "dist.zip", {
  name: "My Docs",
});
console.log(project.url); // https://my-docs.hosty.site

// Re-deploy new content to the same URL
await hosty.update(project.id, await fs.readFile("dist.zip"), "dist.zip");

// Read traffic
const stats = await hosty.analytics(project.id, { days: 7 });
console.log(stats.visitors, stats.pageViews);

// One round trip via GraphQL
const data = await hosty.graphql(`{
  projects { name url analytics(days: 7) { visitors } }
}`);
```

| Method | Description |
| --- | --- |
| `me()` | Account, plan & usage |
| `listProjects({search, limit})` | List projects |
| `getProject(id)` | Project detail with files |
| `deploy(data, filename, {name, slug})` | Create + publish |
| `update(id, data, filename)` | Replace content, keep URL |
| `deleteProject(id)` | Delete project |
| `analytics(id, {days})` | Traffic summary |
| `graphql(query, variables)` | Raw GraphQL query |

Errors throw `HostyError` with `.status` and the parsed error `.body`.
