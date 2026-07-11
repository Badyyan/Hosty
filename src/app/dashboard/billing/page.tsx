"use client";

import { useEffect, useState } from "react";

interface Account {
  plan: {
    tier: string;
    label: string;
    maxProjects: number;
    maxUploadBytes: number;
    maxStorageBytes: number;
    status: string;
    currentPeriodEnd: string | null;
  };
  usage: { projects: number; storageBytes: number };
}

const tiers = [
  { id: "PRO", name: "Pro", price: "$12/mo", blurb: "Custom domains, password protection, email capture, no branding." },
  { id: "BUSINESS", name: "Business", price: "$49/mo", blurb: "Everything in Pro plus teams, 1 GB uploads and 50 GB storage." },
];

function fmtBytes(n: number) {
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(0)} GB`;
}

export default function BillingPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/account").then((r) => r.json()).then(setAccount);
  }, []);

  async function checkout(plan: string) {
    setError("");
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Billing is not configured.");
    window.location.href = data.url;
  }

  async function portal() {
    setError("");
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Billing is not configured.");
    window.location.href = data.url;
  }

  if (!account) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-extrabold">Billing</h1>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">Current plan: {account.plan.label}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {account.usage.projects}/{account.plan.maxProjects} projects · {fmtBytes(account.usage.storageBytes)} of {fmtBytes(account.plan.maxStorageBytes)} storage · uploads up to {fmtBytes(account.plan.maxUploadBytes)}
            </p>
            {account.plan.currentPeriodEnd && (
              <p className="mt-1 text-xs text-slate-400">
                Renews {new Date(account.plan.currentPeriodEnd).toLocaleDateString()} · status: {account.plan.status}
              </p>
            )}
          </div>
          {account.plan.tier !== "FREE" && (
            <button className="btn-secondary" onClick={portal}>Manage subscription</button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiers.map((t) => (
          <div key={t.id} className={`card p-6 ${account.plan.tier === t.id ? "ring-2 ring-brand-500" : ""}`}>
            <h3 className="font-bold">{t.name}</h3>
            <div className="mt-1 text-2xl font-extrabold">{t.price}</div>
            <p className="mt-2 text-sm text-slate-500">{t.blurb}</p>
            <button
              className="btn-primary mt-4 w-full"
              disabled={account.plan.tier === t.id}
              onClick={() => checkout(t.id)}
            >
              {account.plan.tier === t.id ? "Current plan" : `Upgrade to ${t.name}`}
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Payments are processed by Stripe. Upgrades apply instantly; downgrades at the end of the billing period.
      </p>
    </div>
  );
}
