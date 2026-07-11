import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { getAnalytics } from "@/lib/analytics";

type Ctx = { params: { id: string } };

export const GET = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "VIEWER");

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : new Date(to.getTime() - days * 86400_000);

  const summary = await getAnalytics(project.id, from, to);
  return json({ from, to, ...summary });
});
