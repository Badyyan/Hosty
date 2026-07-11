"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.get("token"), password }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Reset failed.");
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-md p-8">
      <h1 className="text-2xl font-extrabold">Choose a new password</h1>
      {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}
      <div className="mt-6 space-y-4">
        <input type="password" minLength={8} required placeholder="New password (8+ characters)" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn-primary w-full">Set password</button>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}
