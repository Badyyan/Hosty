"use client";

import { useEffect, useState } from "react";

interface Account {
  user: { name: string | null; email: string; twoFactorEnabled: boolean };
}

export default function AccountSettingsPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/account").then((r) => r.json()).then(setAccount);
  }
  useEffect(load, []);

  async function start2fa() {
    setMsg("");
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    const data = await res.json();
    if (res.ok) setQr(data.qrDataUrl);
  }

  async function confirm2fa() {
    const res = await fetch("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error ?? "Invalid code");
    setRecoveryCodes(data.recoveryCodes);
    setQr(null);
    setCode("");
    load();
  }

  async function disable2fa() {
    const password = prompt("Enter your password to disable 2FA:");
    if (!password) return;
    const res = await fetch("/api/auth/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return setMsg((await res.json()).error ?? "Failed");
    setRecoveryCodes(null);
    load();
  }

  if (!account) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-extrabold">Account settings</h1>
      {msg && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{msg}</p>}

      <section className="card p-6">
        <h2 className="font-bold">Profile</h2>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2"><dt className="w-20 text-slate-500">Name</dt><dd>{account.user.name ?? "—"}</dd></div>
          <div className="flex gap-2"><dt className="w-20 text-slate-500">Email</dt><dd>{account.user.email}</dd></div>
        </dl>
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-slate-500">
          Adds a 6-digit TOTP code (Google Authenticator, 1Password, etc.) to your sign-in.
        </p>

        {recoveryCodes && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Save these recovery codes — each works once if you lose your device:
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
              {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
          </div>
        )}

        {account.user.twoFactorEnabled ? (
          <button className="btn-secondary mt-4" onClick={disable2fa}>Disable 2FA</button>
        ) : qr ? (
          <div className="mt-4 space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Scan this QR code with your authenticator app" className="rounded-xl border border-slate-200 dark:border-slate-700" />
            <div className="flex gap-2">
              <input className="input max-w-40" inputMode="numeric" placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn-primary" onClick={confirm2fa}>Confirm</button>
            </div>
          </div>
        ) : (
          <button className="btn-primary mt-4" onClick={start2fa}>Enable 2FA</button>
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-bold">Email integrations</h2>
        <p className="mt-1 text-sm text-slate-500">
          Connect Mailchimp or ConvertKit and every captured lead is forwarded automatically.
          Configure via the API for now:
          <code className="ml-1 rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">POST /api/integrations</code>
        </p>
      </section>
    </div>
  );
}
