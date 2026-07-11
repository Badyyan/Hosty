import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { deploy } from "@/lib/deployments";
import { siteUrl } from "@/lib/config";

export const runtime = "nodejs";

const schema = z.object({
  html: z.string().min(1).max(5 * 1024 * 1024),
  name: z.string().max(120).optional(),
  slug: z.string().max(63).optional(),
  projectId: z.string().optional(),
});

/** "Paste HTML" publishing — the fastest path from clipboard to URL. */
export const POST = apiHandler(
  async (req) => {
    const userId = await requireUserId();
    const input = schema.parse(await req.json());
    if (input.projectId) await assertProjectAccess(userId, input.projectId, "EDITOR");

    const result = await deploy({
      userId,
      projectId: input.projectId,
      name: input.name ?? "Pasted page",
      slug: input.slug,
      files: [{ path: "index.html", data: Buffer.from(input.html, "utf8") }],
      type: "HTML",
      source: "paste",
    });
    return json(
      {
        project: {
          id: result.project.id,
          slug: result.project.slug,
          url: siteUrl(result.project.slug),
        },
      },
      { status: input.projectId ? 200 : 201 }
    );
  },
  { limit: { n: 20, windowSeconds: 60, key: "paste" } }
);
