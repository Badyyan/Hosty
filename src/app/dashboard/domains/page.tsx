"use client";

import { useCallback, useEffect, useState } from "react";

interface DomainRow {
  id: string;
  domain: string;
  status: string;
  verificationToken: string;
  cnameTarget: string;
  project: { name: string; slug: string };
}
interface ProjectOpt { id: string; name: string }

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [domain, setDomain] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/domains").then((r) => r.json()).then((d) => setDomains(d.domains ?? []));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/projects").then((r) => r.json()).then((d) => setProjects(d.projects ?? []));
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, projectId }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Failed to add domain");
    setDomain("");
    load();
  }

  async function verify(id: string) {
    await fetch(`/api/domains/${id}/verify`, { method: "POST" });
    load();
  }
  async function remove(id: string) {
    if (!confirm("Disconnect this domain?")) return;
    await fetch(`/api/domains/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-extrabold">Custom domains</h1>

      <form onSubmit={add} className="card flex flex-col gap-3 p-6 sm:flex-row">
        <input className="input" placeholder="docs.yourcompany.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
        <select className="input sm:max-w-56" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
          <option value="">Choose project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn-primary shrink-0">Connect</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {domains.map((d) => (
        <div key={d.id} className="card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-bold">{d.domain}</h3>
              <p className="text-sm text-slate-500">→ {d.project.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  d.status === "VERIFIED"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
              >
                {d.status === "VERIFIED" ? "Active · SSL" : "Pending DNS"}
              </span>
              {d.status !== "VERIFIED" && (
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => verify(d.id)}>Check DNS</button>
              )}
              <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => remove(d.id)}>Remove</button>
            </div>
          </div>
          {d.status !== "VERIFIED" && (
            <div className="mt-4 overflow-x-auto rounded-xl bg-slate-50 p-4 font-mono text-xs dark:bg-slate-900">
              <p className="mb-2 font-sans font-semibold text-slate-600 dark:text-slate-300">Add these DNS records, then click “Check DNS”:</p>
              <table className="w-full text-left">
                <thead><tr className="text-slate-400"><th className="pr-4">Type</th><th className="pr-4">Host</th><th>Value</th></tr></thead>
                <tbody>
                  <tr><td className="pr-4">TXT</td><td className="pr-4">_hosty.{d.domain}</td><td className="break-all">{d.verificationToken}</td></tr>
                  <tr><td className="pr-4">CNAME</td><td className="pr-4">{d.domain}</td><td>{d.cnameTarget}</td></tr>
                </tbody>
              </table>
              <p className="mt-2 font-sans text-slate-500">SSL is issued automatically once DNS propagates (usually &lt; 5 minutes).</p>
            </div>
          )}
        </div>
      ))}
      {domains.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No custom domains yet. Custom domains require a Pro or Business plan.
        </div>
      )}
    </div>
  );
}
