"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-extrabold">Reset your password</h1>
        {sent ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">We&apos;ll email you a reset link.</p>
            <div className="mt-6 space-y-4">
              <input type="email" required placeholder="you@example.com" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn-primary w-full">Send reset link</button>
            </div>
          </>
        )}
        <p className="mt-6 text-center text-sm">
          <Link className="text-brand-500 hover:underline" href="/login">← Back to sign in</Link>
        </p>
      </form>
    </main>
  );
}
