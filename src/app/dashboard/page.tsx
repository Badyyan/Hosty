"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UploadDropzone } from "@/components/dashboard/upload-dropzone";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  url: string;
  updatedAt: string;
  hasPassword: boolean;
  version: number;
  bytes: number;
  files: number;
  leads: number;
  comments: number;
}

interface Account {
  plan: { label: string; maxProjects: number; maxStorageBytes: number };
  usage: { projects: number; storageBytes: number };
}

const typeIcons: Record<string, string> = {
  SITE: "🌐", HTML: "📄", PDF: "📕", IMAGE: "🖼️", DOCUMENT: "📊",
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function DashboardHome() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/projects?search=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then((d) => setProjects(d.projects ?? []))
        .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetch("/api/account").then((r) => r.json()).then(setAccount).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <UploadDropzone />

      {account && (
        <div className="grid gap-4 sm:grid-cols-2">
          <UsageBar
            label={`Projects (${account.plan.label} plan)`}
            used={account.usage.projects}
            max={account.plan.maxProjects}
            display={`${account.usage.projects} / ${account.plan.maxProjects}`}
          />
          <UsageBar
            label="Storage"
            used={account.usage.storageBytes}
            max={account.plan.maxStorageBytes}
            display={`${fmtBytes(account.usage.storageBytes)} / ${fmtBytes(account.plan.maxStorageBytes)}`}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-extrabold">Your projects</h2>
        <input
          type="search"
          placeholder="Search projects…"
          className="input max-w-56"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          {search ? "No projects match your search." : "No projects yet — drop a file above to publish your first one!"}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="card group p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="text-2xl">{typeIcons[p.type] ?? "📁"}</div>
                <span className="text-xs text-slate-400">v{p.version}</span>
              </div>
              <h3 className="mt-3 truncate font-bold group-hover:text-brand-500">{p.name}</h3>
              <p className="truncate text-xs text-brand-500">{p.url.replace(/^https?:\/\//, "")}</p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{fmtBytes(p.bytes)}</span>
                <span>{p.files} file{p.files === 1 ? "" : "s"}</span>
                {p.hasPassword && <span>🔒</span>}
                {p.leads > 0 && <span>✉️ {p.leads}</span>}
                {p.comments > 0 && <span>💬 {p.comments}</span>}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Updated {new Date(p.updatedAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UsageBar({ label, used, max, display }: { label: string; used: number; max: number; display: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div className="card p-4">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-slate-500">{display}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
