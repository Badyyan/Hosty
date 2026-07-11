import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { dispatchWebhooks } from "@/lib/webhooks";
import { notify } from "@/lib/activity";

export const runtime = "nodejs";

/** Public feedback API used by the injected widget on hosted sites. */

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const path = req.nextUrl.searchParams.get("path") ?? "/";
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project?.feedbackEnabled) return NextResponse.json({ comments: [] });

  const comments = await db.comment.findMany({
    where: { projectId, path, parentId: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { replies: { orderBy: { createdAt: "asc" }, take: 50 } },
  });
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      author: c.authorName,
      body: c.body,
      quote: c.quote,
      resolved: Boolean(c.resolvedAt),
      createdAt: c.createdAt,
      replies: c.replies.map((r) => ({
        id: r.id,
        author: r.authorName,
        body: r.body,
        createdAt: r.createdAt,
      })),
    })),
  });
}

const commentSchema = z.object({
  projectId: z.string().min(1).max(64),
  path: z.string().max(512).default("/"),
  author: z.string().max(80).default("Anonymous"),
  email: z.string().email().max(320).optional(),
  body: z.string().min(1).max(4000),
  quote: z.string().max(1000).optional(),
  parentId: z.string().max(64).optional(),
});

export async function POST(req: NextRequest) {
  const limit = await rateLimit(`comment:${clientIp(req)}`, 10, 60);
  if (!limit.ok) return new NextResponse("Too many requests", { status: 429 });

  let input: z.infer<typeof commentSchema>;
  try {
    input = commentSchema.parse(await req.json());
  } catch {
    return new NextResponse("Invalid input", { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id: input.projectId } });
  if (!project?.feedbackEnabled) return new NextResponse("Not found", { status: 404 });

  if (input.parentId) {
    const parent = await db.comment.findFirst({
      where: { id: input.parentId, projectId: project.id },
    });
    if (!parent) return new NextResponse("Parent not found", { status: 404 });
  }

  const comment = await db.comment.create({
    data: {
      projectId: project.id,
      parentId: input.parentId ?? null,
      authorName: input.author.trim() || "Anonymous",
      authorEmail: input.email,
      body: input.body,
      path: input.path,
      quote: input.quote,
    },
  });

  if (project.userId) {
    void dispatchWebhooks(project.userId, "comment.created", {
      projectId: project.id,
      commentId: comment.id,
      author: comment.authorName,
    });
    void notify(project.userId, "comment", `New comment on ${project.name}`, {
      body: comment.body.slice(0, 140),
      href: `/dashboard/projects/${project.id}/feedback`,
    });
  }
  return NextResponse.json({ id: comment.id }, { status: 201 });
}
