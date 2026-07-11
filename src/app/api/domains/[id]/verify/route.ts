import { apiHandler, json } from "@/lib/api";
import { requireUserId, ApiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/**
 * Verify domain ownership via a TXT record lookup (DNS-over-HTTPS, so it
 * works from any container without a resolver library). In production this
 * also provisions the Cloudflare SSL-for-SaaS custom hostname.
 */
export const POST = apiHandler<Ctx>(async (_req, { params }) => {
  const userId = await requireUserId();
  const record = await db.customDomain.findFirst({ where: { id: params.id, userId } });
  if (!record) throw new ApiError(404, "Domain not found");

  const found = await lookupTxt(`_hosty.${record.domain}`);
  const verified = found.some((txt) => txt.includes(record.verificationToken));

  const updated = await db.customDomain.update({
    where: { id: record.id },
    data: verified
      ? { status: "VERIFIED", verifiedAt: new Date() }
      : { status: "PENDING" },
  });
  if (verified) {
    await getRedis()?.del(`site:@${record.domain}`).catch(() => {});
  }
  return json({ status: updated.status, verified });
});

async function lookupTxt(name: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
      { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }
    );
    const data = (await res.json()) as { Answer?: { data: string }[] };
    return (data.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}
