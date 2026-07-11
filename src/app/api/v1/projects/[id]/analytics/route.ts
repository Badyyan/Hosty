import { apiHandler, json } from "@/lib/api";
import { authenticateApiKey } from "@/lib/api-keys";
import { ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";

type Ctx = { params: { id: string } };

export const GET = apiHandler<Ctx>(
  async (req, { params }) => {
    const ctx = await authenticateApiKey(req, "read");
    const project = await db.project.findFirst({
      where: { id: params.id, userId: ctx.userId },
    });
    if (!project) throw new ApiError(404, "Project not found");

    const url = new URL(req.url);
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400_000);
    const summary = await getAnalytics(project.id, from, to);
    return json({
      from,
      to,
      visitors: summary.visitors,
      sessions: summary.sessions,
      pageViews: summary.pageViews,
      downloads: summary.downloads,
      bounceRate: summary.bounceRate,
      topPages: summary.topPages,
      referrers: summary.referrers,
      countries: summary.countries,
    });
  },
  { public: true }
);
