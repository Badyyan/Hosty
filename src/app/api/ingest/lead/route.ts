import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sign } from "@/lib/security";
import { config } from "@/lib/config";
import { gateRedirectUrl } from "@/lib/serve/redirect";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { forwardLead } from "@/lib/integrations";
import { notify } from "@/lib/activity";

export const runtime = "nodejs";

const leadSchema = z.object({
  projectId: z.string().min(1).max(64),
  email: z.string().email().max(320),
  name: z.string().max(120).optional(),
});

/**
 * Lead capture — accepts both the built-in email gate (form POST) and JSON
 * from embedded capture forms on hosted sites.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await rateLimit(`lead:${ip}`, 10, 60);
  if (!limit.ok) return new NextResponse("Too many requests", { status: 429 });

  const isForm = (req.headers.get("content-type") ?? "").includes("form");
  let input: z.infer<typeof leadSchema>;
  try {
    if (isForm) {
      const form = await req.formData();
      input = leadSchema.parse({
        projectId: form.get("projectId"),
        email: form.get("email"),
        name: form.get("name") || undefined,
      });
    } else {
      input = leadSchema.parse(await req.json());
    }
  } catch {
    return new NextResponse("Invalid input", { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id: input.projectId } });
  if (!project) return new NextResponse("Not found", { status: 404 });

  const lead = await db.lead.upsert({
    where: { projectId_email: { projectId: project.id, email: input.email.toLowerCase() } },
    update: { name: input.name },
    create: {
      projectId: project.id,
      email: input.email.toLowerCase(),
      name: input.name,
      source: isForm ? "gate" : "form",
    },
  });

  if (project.userId) {
    void forwardLead(project.userId, {
      email: lead.email,
      name: lead.name,
      projectId: project.id,
      projectName: project.name,
    });
    void notify(project.userId, "lead", `New lead on ${project.name}`, {
      body: lead.email,
      href: `/dashboard/projects/${project.id}/leads`,
    });
  }

  if (isForm) {
    const res = NextResponse.redirect(gateRedirectUrl(req), 303);
    res.cookies.set(`hosty_lead_${project.id}`, sign(`lead:${project.id}`), {
      httpOnly: true,
      sameSite: "lax",
      secure: config.appUrl.startsWith("https"),
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  }
  return NextResponse.json({ ok: true });
}
