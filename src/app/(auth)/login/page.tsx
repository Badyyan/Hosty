"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      totp,
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      if (res.error.includes("2FA_REQUIRED")) {
        setNeeds2fa(true);
        setError("Enter the 6-digit code from your authenticator app.");
      } else if (res.error.includes("2FA_INVALID")) {
        setError("Invalid 2FA code.");
      } else {
        setError("Invalid email or password.");
      }
      return;
    }
    router.push(params.get("callbackUrl") ?? "/dashboard");
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-md p-8">
      <h1 className="text-2xl font-extrabold">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to your Hosty account</p>

      {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <div className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {needs2fa && (
          <div>
            <label className="label" htmlFor="totp">2FA code</label>
            <input id="totp" inputMode="numeric" autoComplete="one-time-code" className="input" value={totp} onChange={(e) => setTotp(e.target.value)} />
          </div>
        )}
        <button disabled={busy} className="btn-primary w-full">{busy ? "Signing in…" : "Sign in"}</button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="btn-secondary">Google</button>
        <button type="button" onClick={() => signIn("github", { callbackUrl: "/dashboard" })} className="btn-secondary">GitHub</button>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link className="text-brand-500 hover:underline" href="/forgot-password">Forgot password?</Link>
        {" · "}
        <Link className="text-brand-500 hover:underline" href="/register">Create an account</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
