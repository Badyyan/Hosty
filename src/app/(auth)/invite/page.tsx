"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

function InviteInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const [error, setError] = useState("");
  const token = params.get("token") ?? "";

  async function accept() {
    const res = await fetch("/api/teams/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not accept the invitation.");
      return;
    }
    router.push("/dashboard/team");
  }

  return (
    <div className="card w-full max-w-md p-8 text-center">
      <h1 className="text-2xl font-extrabold">Team invitation</h1>
      {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}
      {status === "authenticated" ? (
        <button onClick={accept} className="btn-primary mt-6 w-full">Accept invitation</button>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          <Link href={`/login?callbackUrl=/invite?token=${encodeURIComponent(token)}`} className="text-brand-500 hover:underline">
            Sign in
          </Link>{" "}
          (with the invited email) to accept this invitation.
        </p>
      )}
    </div>
  );
}

export default function InvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense>
        <InviteInner />
      </Suspense>
    </main>
  );
}
