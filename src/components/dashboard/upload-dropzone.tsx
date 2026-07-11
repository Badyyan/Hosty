"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  projectId?: string; // set → replace an existing project's content
  onDone?: () => void;
}

/**
 * Drag & drop uploader. Accepts single files (zip/html/pdf/images/docs),
 * multiple files, and full folders (via webkitdirectory or DnD directories).
 * Also offers a "paste HTML" mode.
 */
export function UploadDropzone({ projectId, onDone }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [html, setHtml] = useState("");

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      setError("");
      const form = new FormData();
      for (const f of files) {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
        // preserve folder structure when uploading a directory
        form.append("file", f, rel && rel.length > 0 ? rel : f.name);
      }
      if (projectId) form.append("projectId", projectId);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        onDone?.();
        router.push(`/dashboard/projects/${data.project.id}?published=1`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [projectId, router, onDone]
  );

  async function publishPastedHtml() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/upload/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      router.push(`/dashboard/projects/${data.project.id}?published=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    upload(Array.from(e.dataTransfer.files));
  }

  if (pasteMode) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Paste HTML</h3>
          <button className="text-sm text-slate-500 hover:underline" onClick={() => setPasteMode(false)}>
            ← back to upload
          </button>
        </div>
        <textarea
          className="input mt-4 h-48 font-mono text-xs"
          placeholder="<!doctype html>…"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button disabled={busy || !html.trim()} onClick={publishPastedHtml} className="btn-primary mt-4">
          {busy ? "Publishing…" : "Publish page →"}
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload files"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`card cursor-pointer border-2 border-dashed p-10 text-center transition-colors ${
        dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : "border-slate-300 dark:border-slate-700"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept=".zip,.html,.htm,.pdf,.jpg,.jpeg,.png,.gif,.svg,.webp,.avif,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.md,.csv,.mp4,.webm,.raw,.cr2,.nef,.arw,.dng"
        onChange={(e) => upload(Array.from(e.target.files ?? []))}
      />
      <input
        ref={folderRef}
        type="file"
        hidden
        // @ts-expect-error non-standard folder upload attribute
        webkitdirectory=""
        onChange={(e) => upload(Array.from(e.target.files ?? []))}
      />
      <div className="text-4xl">{busy ? "⏳" : "📤"}</div>
      <h3 className="mt-3 text-lg font-bold">
        {busy ? "Uploading…" : projectId ? "Drop a new version" : "Drag & drop to publish"}
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        ZIP, HTML, PDF, images, Office docs, Markdown — instantly live with HTTPS
      </p>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
        <button className="btn-secondary" onClick={() => inputRef.current?.click()}>Choose files</button>
        <button className="btn-secondary" onClick={() => folderRef.current?.click()}>Upload folder</button>
        <button className="btn-secondary" onClick={() => setPasteMode(true)}>Paste HTML</button>
      </div>
    </div>
  );
}
