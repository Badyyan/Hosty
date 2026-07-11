"use client";

import { useCallback, useEffect, useState } from "react";

interface Reply {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}
interface CommentRow {
  id: string;
  authorName: string;
  body: string;
  path: string;
  quote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  replies: Reply[];
}

export default function FeedbackPage({ params }: { params: { id: string } }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch(`/api/projects/${params.id}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(load, [load]);

  async function act(commentId: string, action: string, body?: string) {
    await fetch(`/api/projects/${params.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId, action, body }),
    });
    load();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Visitor feedback ({comments.length})</h2>
      <p className="text-sm text-slate-500">
        Turn on <strong>feedback mode</strong> in Settings to show a comment widget on your site.
        Visitors can highlight text, comment and reply — you can respond and resolve threads here.
      </p>

      {comments.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No comments yet.</div>
      ) : (
        comments.map((c) => (
          <div key={c.id} className={`card p-5 ${c.resolvedAt ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {c.authorName}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    on {c.path} · {new Date(c.createdAt).toLocaleString()}
                  </span>
                  {c.resolvedAt && (
                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      Resolved
                    </span>
                  )}
                </div>
                {c.quote && (
                  <blockquote className="mt-2 border-l-2 border-brand-500 pl-3 text-xs italic text-slate-500">
                    “{c.quote}”
                  </blockquote>
                )}
                <p className="mt-2 text-sm">{c.body}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => {
                    const body = prompt("Your reply:");
                    if (body) act(c.id, "reply", body);
                  }}
                >
                  Reply
                </button>
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => act(c.id, c.resolvedAt ? "unresolve" : "resolve")}
                >
                  {c.resolvedAt ? "Reopen" : "Resolve"}
                </button>
                <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => act(c.id, "delete")}>
                  Delete
                </button>
              </div>
            </div>
            {c.replies.length > 0 && (
              <div className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4 dark:border-slate-800">
                {c.replies.map((r) => (
                  <p key={r.id} className="text-sm">
                    <span className="font-semibold">{r.authorName}:</span> {r.body}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
