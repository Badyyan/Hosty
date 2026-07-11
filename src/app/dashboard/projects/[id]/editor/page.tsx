"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";

interface FileEntry {
  path: string;
  size: number;
  contentType: string;
}

function langFor(path: string) {
  if (/\.css$/i.test(path)) return [css()];
  if (/\.m?js$/i.test(path)) return [javascript()];
  if (/\.(md|markdown)$/i.test(path)) return [markdown()];
  if (/\.(html?|svg|xml)$/i.test(path)) return [html()];
  return [];
}

const EDITABLE = /\.(html?|css|m?js|json|txt|md|markdown|svg|xml|webmanifest)$/i;

/**
 * In-browser editor: file tree + CodeMirror + live preview.
 * Auto-saves 2s after the last keystroke; every save is a new version
 * (roll back from the Overview tab).
 */
export default function EditorPage({ params }: { params: { id: string } }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [previewKey, setPreviewKey] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        setSiteUrl(d.project.url);
        const list: FileEntry[] = d.project.deployment?.files ?? [];
        setFiles(list);
        const first = list.find((f) => f.path === "index.html") ?? list.find((f) => EDITABLE.test(f.path));
        if (first) openFile(first.path);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function openFile(path: string) {
    setActive(path);
    setStatus("idle");
    fetch(`/api/projects/${params.id}/files/content?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => setContent(d.content ?? ""));
  }

  const save = useCallback(
    async (path: string, value: string) => {
      setStatus("saving");
      const res = await fetch(`/api/projects/${params.id}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: value }),
      });
      if (res.ok) {
        setStatus("saved");
        setPreviewKey((k) => k + 1); // reload live preview
      } else {
        setStatus("error");
      }
    },
    [params.id]
  );

  function onChange(value: string) {
    setContent(value);
    setStatus("dirty");
    clearTimeout(saveTimer.current);
    if (active) {
      const path = active;
      saveTimer.current = setTimeout(() => save(path, value), 2000);
    }
  }

  const statusLabel = {
    idle: "",
    dirty: "Unsaved changes…",
    saving: "Saving…",
    saved: "✓ Saved (new version created)",
    error: "⚠ Save failed",
  }[status];

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr_1fr]" style={{ minHeight: "70vh" }}>
      <div className="card overflow-auto p-2">
        <h3 className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">Files</h3>
        {files.map((f) => {
          const editable = EDITABLE.test(f.path);
          return (
            <button
              key={f.path}
              disabled={!editable}
              onClick={() => openFile(f.path)}
              className={`block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-xs ${
                active === f.path
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  : editable
                    ? "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    : "cursor-not-allowed text-slate-300 dark:text-slate-600"
              }`}
            >
              {f.path}
            </button>
          );
        })}
      </div>

      <div className="card flex min-w-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
          <span className="truncate font-mono">{active ?? "No file selected"}</span>
          <span className={status === "error" ? "text-red-500" : "text-slate-400"}>{statusLabel}</span>
        </div>
        {active ? (
          <CodeMirror
            value={content}
            onChange={onChange}
            extensions={langFor(active)}
            theme={isDark ? "dark" : "light"}
            height="60vh"
            basicSetup={{ lineNumbers: true, foldGutter: true }}
          />
        ) : (
          <p className="p-6 text-sm text-slate-500">Select an editable file (HTML, CSS, JS, Markdown).</p>
        )}
      </div>

      <div className="card flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
          <span className="font-semibold">Live preview</span>
          <button className="text-brand-500 hover:underline" onClick={() => setPreviewKey((k) => k + 1)}>
            ↻ Refresh
          </button>
        </div>
        {siteUrl && (
          <iframe
            key={previewKey}
            src={siteUrl}
            title="Live preview"
            className="h-full min-h-[60vh] w-full flex-1 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
      </div>
    </div>
  );
}
