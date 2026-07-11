"use client";

import { useCallback, useEffect, useState } from "react";

const ALL_EVENTS = ["project.created", "project.deployed", "project.deleted", "lead.captured", "comment.created"];

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  recentDeliveries: { event: string; statusCode: number | null; error: string | null; createdAt: string }[];
}

export default function WebhooksPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["project.deployed"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/webhooks").then((r) => r.json()).then((d) => setEndpoints(d.endpoints ?? []));
  }, []);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, events }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Failed");
    setSecret(data.secret);
    setUrl("");
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-extrabold">Webhooks</h1>
      <p className="text-sm text-slate-500">
        POST notifications with an <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">X-Hosty-Signature</code> HMAC header. 3 retries with backoff.
      </p>

      {secret && (
        <div className="card border-green-300 bg-green-50 p-4 text-sm dark:border-green-800 dark:bg-green-900/20">
          Signing secret (copy now): <code className="font-mono text-xs">{secret}</code>
        </div>
      )}

      <form onSubmit={create} className="card space-y-4 p-6">
        <input className="input" type="url" placeholder="https://example.com/hooks/hosty" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <div className="flex flex-wrap gap-2">
          {ALL_EVENTS.map((ev) => (
            <label key={ev} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${events.includes(ev) ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "border-slate-300 text-slate-500 dark:border-slate-700"}`}>
              <input
                type="checkbox"
                hidden
                checked={events.includes(ev)}
                onChange={(e) =>
                  setEvents((prev) => (e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)))
                }
              />
              {ev}
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary">Add endpoint</button>
      </form>

      {endpoints.map((ep) => (
        <div key={ep.id} className="card p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm">{ep.url}</p>
              <p className="text-xs text-slate-400">{ep.events.join(", ")}</p>
            </div>
            <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => remove(ep.id)}>Delete</button>
          </div>
          {ep.recentDeliveries.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
              {ep.recentDeliveries.map((d, i) => (
                <div key={i} className="flex justify-between">
                  <span>{d.event}</span>
                  <span className={d.error ? "text-red-500" : "text-green-600"}>
                    {d.statusCode ?? "—"} {d.error ? `· ${d.error}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
