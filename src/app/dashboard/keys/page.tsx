"use client";

import { useCallback, useEffect, useState } from "react";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/keys").then((r) => r.json()).then((d) => setKeys(d.keys ?? []));
  }, []);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewKey(data.key);
      setName("");
      load();
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Anything using it will stop working immediately.")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-extrabold">API keys</h1>
      <p className="text-sm text-slate-500">
        Use keys with the REST API, the <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">hosty</code> CLI
        and the Chrome extension. Docs: <a href="/docs" className="text-brand-500 hover:underline">/docs</a>
      </p>

      {newKey && (
        <div className="card border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            Copy your key now — it won&apos;t be shown again:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-white p-2 font-mono text-xs dark:bg-slate-900">{newKey}</code>
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(newKey)}>Copy</button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="card flex gap-3 p-6">
        <input className="input" placeholder="Key name (e.g. CI deploys)" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn-primary shrink-0">Create key</button>
      </form>

      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-4 p-4 text-sm">
            <div>
              <span className="font-semibold">{k.name}</span>
              <span className="ml-2 font-mono text-xs text-slate-400">{k.prefix}…</span>
              <span className="ml-2 text-xs text-slate-400">
                {k.scopes.join(", ")} · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
              </span>
            </div>
            <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => revoke(k.id)}>Revoke</button>
          </div>
        ))}
        {keys.length === 0 && <p className="p-6 text-sm text-slate-500">No API keys yet.</p>}
      </div>
    </div>
  );
}
