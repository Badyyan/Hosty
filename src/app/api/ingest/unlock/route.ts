import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { unlockCookieName, unlockCookieValue } from "@/lib/security";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { passwordGatePage } from "@/lib/serve/html";

export const runtime = "nodejs";

/** Password-gate unlock (form POST from the gate page, same site origin). */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await rateLimit(`unlock:${ip}`, 10, 60);
  if (!limit.ok) return new NextResponse("Too many attempts", { status: 429 });

  const form = await req.formData();
  const projectId = String(form.get("projectId") ?? "");
  const password = String(form.get("password") ?? "");

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project?.passwordHash) return new NextResponse("Not found", { status: 404 });

  const ok = await bcrypt.compare(password, project.passwordHash);
  if (!ok) {
    return new NextResponse(passwordGatePage(projectId, project.name, "Incorrect password."), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(unlockCookieName(projectId), unlockCookieValue(projectId, project.passwordVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
