import { apiHandler, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";

type Ctx = { params: { id: string } };

/** Captured leads — JSON by default, CSV export with ?format=csv. */
export const GET = apiHandler<Ctx>(async (req, { params }) => {
  const userId = await requireUserId();
  const project = await assertProjectAccess(userId, params.id, "VIEWER");
  const leads = await db.lead.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 10_000,
  });

  if (new URL(req.url).searchParams.get("format") === "csv") {
    const rows = [
      "email,name,source,created_at",
      ...leads.map((l) =>
        [l.email, l.name ?? "", l.source, l.createdAt.toISOString()]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    return new Response(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${project.slug}-leads.csv"`,
      },
    });
  }

  return json({
    leads: leads.map((l) => ({
      id: l.id,
      email: l.email,
      name: l.name,
      source: l.source,
      createdAt: l.createdAt,
    })),
  });
});
