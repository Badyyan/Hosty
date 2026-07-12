"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Entry {
  id: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  actor: string;
  team: string | null;
  createdAt: string;
}

const actionMeta: Record<string, { icon: string; label: string }> = {
  "project.created": { icon: "🚀", label: "published a new project" },
  "project.deployed": { icon: "📦", label: "deployed a new version" },
  "project.rolledback": { icon: "⏪", label: "rolled back a project" },
  "project.deleted": { icon: "🗑️", label: "deleted a project" },
  "team.created": { icon: "👥", label: "created a team" },
  "team.invited": { icon: "✉️", label: "invited a teammate" },
  "team.joined": { icon: "🎉", label: "joined the team" },
  "team.role_changed": { icon: "🔧", label: "changed a member's role" },
  "team.member_removed": { icon: "🚪", label: "removed a member" },
};

export default function ActivityPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => setEntries(d.activity ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-extrabold">Activity</h1>
      <p className="text-sm text-slate-500">
        Everything that happened across your account and teams — deployments, rollbacks,
        membership changes.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No activity yet.</div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {entries.map((e) => {
            const meta = actionMeta[e.action] ?? { icon: "•", label: e.action };
            const version = (e.metadata as { version?: number } | null)?.version;
            return (
              <div key={e.id} className="flex items-start gap-3 p-4 text-sm">
                <span aria-hidden className="text-lg leading-none">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-semibold">{e.actor}</span> {meta.label}
                    {version ? <span className="text-slate-500"> (v{version})</span> : null}
                    {e.team && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {e.team}
                      </span>
                    )}
                  </p>
                  {e.action.startsWith("project.") && e.targetId && e.action !== "project.deleted" && (
                    <Link
                      href={`/dashboard/projects/${e.targetId}`}
                      className="text-xs text-brand-500 hover:underline"
                    >
                      View project →
                    </Link>
                  )}
                </div>
                <time className="shrink-0 text-xs text-slate-400">
                  {new Date(e.createdAt).toLocaleString()}
                </time>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
