"use client";

import { useEffect, useState } from "react";

interface Lead {
  id: string;
  email: string;
  name: string | null;
  source: string;
  createdAt: string;
}

export default function LeadsPage({ params }: { params: { id: string } }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${params.id}/leads`)
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Captured leads ({leads.length})</h2>
        <a href={`/api/projects/${params.id}/leads?format=csv`} className="btn-secondary" download>
          Export CSV
        </a>
      </div>

      <p className="text-sm text-slate-500">
        Enable the <strong>email gate</strong> in Settings to require an email before visitors can view
        this project. Leads are forwarded to your connected Mailchimp / ConvertKit account and to
        <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">lead.captured</code> webhooks.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No leads yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Captured</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {leads.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium">{l.email}</td>
                  <td className="px-4 py-3 text-slate-500">{l.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{l.source}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
