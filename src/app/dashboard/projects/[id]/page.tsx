"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "@/components/dashboard/upload-dropzone";

interface Detail {
  id: string;
  name: string;
  slug: string;
  type: string;
  url: string;
  deployment: { id: string; version: number; createdAt: string; files: { path: string; size: number }[] } | null;
  shortLinks: { code: string; clicks: number }[];
}

interface Version {
  id: string;
  version: number;
  source: string;
  files: number;
  bytes: number;
  createdAt: string;
  active: boolean;
}

export default function ProjectOverview({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [project, setProject] = useState<Detail | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [copied, setCopied] = useState(false);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((d) => setProject(d.project));
    fetch(`/api/projects/${params.id}/versions`)
      .then((r) => r.json())
      .then((d) => setVersions(d.versions ?? []));
  }, [params.id]);

  useEffect(load, [load]);

  if (!project) return <p className="text-sm text-slate-500">Loading…</p>;

  const displayUrl = project.url.replace(/^https?:\/\//, "");

  async function copy() {
    await navigator.clipboard.writeText(project!.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function makeShortLink() {
    const res = await fetch(`/api/projects/${params.id}/shortlink`, { method: "POST" });
    const data = await res.json();
    setShortUrl(data.url);
  }

  async function rollback(deploymentId: string) {
    await fetch(`/api/projects/${params.id}/versions/${deploymentId}/rollback`, { method: "POST" });
    load();
    router.refresh();
  }

  const shareText = encodeURIComponent(`Check out ${project.name}`);
  const shareUrl = encodeURIComponent(project.url);

  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{project.name}</h1>
          <a href={project.url} target="_blank" rel="noopener" className="text-sm font-medium text-brand-500 hover:underline">
            {displayUrl} ↗
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copy} className="btn-secondary">{copied ? "✓ Copied" : "Copy link"}</button>
          <button onClick={() => setShowQr((s) => !s)} className="btn-secondary">QR code</button>
          <button onClick={makeShortLink} className="btn-secondary">Short link</button>
          <a href={project.url} target="_blank" rel="noopener" className="btn-primary">Visit site</a>
        </div>
      </div>

      {showQr && (
        <div className="card flex items-center gap-6 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/projects/${project.id}/qrcode`} alt={`QR code for ${displayUrl}`} className="h-40 w-40 rounded-xl border border-slate-200 dark:border-slate-700" />
          <div className="text-sm text-slate-500">
            <p>Scan to open <strong>{displayUrl}</strong> on a phone.</p>
            <a className="mt-2 inline-block text-brand-500 hover:underline" href={`/api/projects/${project.id}/qrcode?size=1024`} download>
              Download PNG
            </a>
          </div>
        </div>
      )}

      {shortUrl && (
        <div className="card flex items-center justify-between gap-4 p-4 text-sm">
          <span>
            Short link: <a className="font-mono text-brand-500 hover:underline" href={shortUrl}>{shortUrl}</a>
          </span>
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(shortUrl)}>
            Copy
          </button>
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="font-medium">Share:</span>
        <a className="btn-secondary px-3 py-1.5 text-xs" target="_blank" rel="noopener" href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}>X / Twitter</a>
        <a className="btn-secondary px-3 py-1.5 text-xs" target="_blank" rel="noopener" href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}>LinkedIn</a>
        <a className="btn-secondary px-3 py-1.5 text-xs" target="_blank" rel="noopener" href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}>Facebook</a>
        <a className="btn-secondary px-3 py-1.5 text-xs" href={`mailto:?subject=${shareText}&body=${shareUrl}`}>Email</a>
      </div>

      <div>
        <h2 className="mb-3 font-bold">Replace content</h2>
        <UploadDropzone projectId={project.id} onDone={load} />
      </div>

      <div>
        <h2 className="mb-3 font-bold">Version history</h2>
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-4 p-4 text-sm">
              <div>
                <span className="font-semibold">v{v.version}</span>
                <span className="ml-2 text-slate-500">
                  {v.files} files · {(v.bytes / 1024).toFixed(0)} KB · via {v.source}
                </span>
                <span className="ml-2 text-xs text-slate-400">{new Date(v.createdAt).toLocaleString()}</span>
              </div>
              {v.active ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  Live
                </span>
              ) : (
                <button onClick={() => rollback(v.id)} className="btn-secondary px-3 py-1.5 text-xs">
                  Restore
                </button>
              )}
            </div>
          ))}
          {versions.length === 0 && <p className="p-4 text-sm text-slate-500">No versions yet.</p>}
        </div>
      </div>

      {project.deployment && (
        <div>
          <h2 className="mb-3 font-bold">Files in the live version</h2>
          <div className="card max-h-72 divide-y divide-slate-100 overflow-auto text-sm dark:divide-slate-800">
            {project.deployment.files.map((f) => (
              <div key={f.path} className="flex justify-between px-4 py-2">
                <a
                  href={`${project.url}/${f.path}`}
                  target="_blank"
                  rel="noopener"
                  className="truncate font-mono text-xs hover:text-brand-500"
                >
                  {f.path}
                </a>
                <span className="shrink-0 text-xs text-slate-400">{(f.size / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
