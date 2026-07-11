"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Detail {
  id: string;
  name: string;
  slug: string;
  type: string;
  hasPassword: boolean;
  emailGate: boolean;
  feedbackEnabled: boolean;
  pdfDownloadable: boolean;
  removeBranding: boolean;
  spaFallback: boolean;
}

export default function ProjectSettingsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [p, setP] = useState<Detail | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        setP(d.project);
        setName(d.project.name);
        setSlug(d.project.slug);
      });
  }, [params.id]);

  async function patch(data: Record<string, unknown>) {
    setMsg("");
    const res = await fetch(`/api/projects/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) {
      setMsg(body.error ?? "Update failed");
      return false;
    }
    setMsg("✓ Saved");
    const refreshed = await fetch(`/api/projects/${params.id}`).then((r) => r.json());
    setP(refreshed.project);
    return true;
  }

  async function remove() {
    if (!confirm("Delete this project and all its versions? This cannot be undone.")) return;
    await fetch(`/api/projects/${params.id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  if (!p) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      {msg && (
        <div className={`rounded-xl p-3 text-sm ${msg.startsWith("✓") ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"}`}>
          {msg}
        </div>
      )}

      <section className="card space-y-4 p-6">
        <h2 className="font-bold">General</h2>
        <div>
          <label className="label">Project name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Subdomain</label>
          <input className="input font-mono" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          <p className="mt-1 text-xs text-slate-500">Changing this breaks existing links and QR codes.</p>
        </div>
        <button className="btn-primary" onClick={() => patch({ name, slug })}>Save changes</button>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-bold">Access control</h2>
        <div>
          <label className="label">Password protection {p.hasPassword && "· currently ON 🔒"}</label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder={p.hasPassword ? "New password" : "Set a password"}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="btn-primary shrink-0"
              onClick={async () => {
                if (await patch({ password })) setPassword("");
              }}
              disabled={!password}
            >
              Set
            </button>
            {p.hasPassword && (
              <button className="btn-secondary shrink-0" onClick={() => patch({ password: null })}>
                Remove
              </button>
            )}
          </div>
        </div>
        <Toggle
          label="Email gate"
          hint="Visitors must enter an email address before viewing. Captured emails appear in the Leads tab."
          checked={p.emailGate}
          onChange={(v) => patch({ emailGate: v })}
        />
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-bold">Site behaviour</h2>
        <Toggle
          label="Feedback mode"
          hint="Show a comment widget so visitors can leave threaded feedback."
          checked={p.feedbackEnabled}
          onChange={(v) => patch({ feedbackEnabled: v })}
        />
        {p.type === "PDF" && (
          <Toggle
            label="Allow PDF download"
            hint="Off = view-only mode: toolbar and download controls are hidden."
            checked={p.pdfDownloadable}
            onChange={(v) => patch({ pdfDownloadable: v })}
          />
        )}
        <Toggle
          label="SPA fallback"
          hint="Serve index.html for unknown paths (single-page apps with client routing)."
          checked={p.spaFallback}
          onChange={(v) => patch({ spaFallback: v })}
        />
        <Toggle
          label="Remove Hosty branding"
          hint="Hide the “Made with Hosty” badge (paid plans)."
          checked={p.removeBranding}
          onChange={(v) => patch({ removeBranding: v })}
        />
      </section>

      <section className="card border-red-200 p-6 dark:border-red-900">
        <h2 className="font-bold text-red-600">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-500">Deletes the project, all versions, analytics, leads and comments.</p>
        <button className="btn-danger mt-4" onClick={remove}>Delete project</button>
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-700"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}
