import { z } from "zod";
import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

/** Owner-side feedback management: list, reply, resolve, delete. */
export const GET = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "VIEWER");
  const comments = await db.comment.findMany({
    where: { projectId: project.id, parentId: null },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  return json({ comments });
});

const actionSchema = z.object({
  commentId: z.string(),
  action: z.enum(["resolve", "unresolve", "delete", "reply"]),
  body: z.string().max(4000).optional(),
});

export const POST = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "EDITOR");
  const input = actionSchema.parse(await req.json());

  const comment = await db.comment.findFirst({
    where: { id: input.commentId, projectId: project.id },
  });
  if (!comment) throw new ApiError(404, "Comment not found");

  switch (input.action) {
    case "resolve":
      await db.comment.update({
        where: { id: comment.id },
        data: { resolvedAt: new Date() },
      });
      break;
    case "unresolve":
      await db.comment.update({ where: { id: comment.id }, data: { resolvedAt: null } });
      break;
    case "delete":
      await db.comment.delete({ where: { id: comment.id } });
      break;
    case "reply": {
      if (!input.body?.trim()) throw new ApiError(400, "Reply body required");
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      await db.comment.create({
        data: {
          projectId: project.id,
          parentId: comment.id,
          authorName: user.name ?? "Site owner",
          body: input.body.trim(),
          path: comment.path,
        },
      });
      break;
    }
  }
  return json({ ok: true });
});
