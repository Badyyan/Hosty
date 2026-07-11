"use client";

import { useCallback, useEffect, useState } from "react";

interface Member { id: string; role: string; name: string | null; email: string }
interface Team { id: string; name: string; slug: string; role: string; projects: number; members: Member[] }

export default function TeamPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("EDITOR");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    fetch("/api/teams").then((r) => r.json()).then((d) => setTeams(d.teams ?? []));
  }, []);
  useEffect(load, [load]);

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName }),
    });
    if (!res.ok) return setError((await res.json()).error ?? "Failed to create team");
    setTeamName("");
    load();
  }

  async function invite(teamId: string) {
    setError("");
    setNotice("");
    const res = await fetch(`/api/teams/${teamId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    if (!res.ok) return setError((await res.json()).error ?? "Invite failed");
    setNotice(`Invitation sent to ${inviteEmail}`);
    setInviteEmail("");
  }

  async function changeRole(teamId: string, memberId: string, role: string) {
    await fetch(`/api/teams/${teamId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function removeMember(teamId: string, memberId: string) {
    await fetch(`/api/teams/${teamId}/members/${memberId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-extrabold">Teams</h1>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
      {notice && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">{notice}</p>}

      <form onSubmit={createTeam} className="card flex gap-3 p-6">
        <input className="input" placeholder="New team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
        <button className="btn-primary shrink-0">Create team</button>
      </form>

      {teams.map((t) => (
        <div key={t.id} className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold">{t.name}</h2>
              <p className="text-xs text-slate-400">
                {t.members.length} member{t.members.length === 1 ? "" : "s"} · {t.projects} project{t.projects === 1 ? "" : "s"} · you are {t.role.toLowerCase()}
              </p>
            </div>
          </div>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {t.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{m.name ?? m.email}</span>
                  <span className="ml-2 text-xs text-slate-400">{m.email}</span>
                </div>
                {m.role === "OWNER" ? (
                  <span className="text-xs font-semibold text-slate-400">OWNER</span>
                ) : ["OWNER", "ADMIN"].includes(t.role) ? (
                  <div className="flex items-center gap-2">
                    <select
                      className="input w-auto px-2 py-1 text-xs"
                      value={m.role}
                      onChange={(e) => changeRole(t.id, m.id, e.target.value)}
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button className="btn-danger px-2 py-1 text-xs" onClick={() => removeMember(t.id, m.id)}>Remove</button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">{m.role}</span>
                )}
              </div>
            ))}
          </div>

          {["OWNER", "ADMIN"].includes(t.role) && (
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row">
              <input className="input" type="email" placeholder="teammate@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <select className="input sm:w-32" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="ADMIN">Admin</option>
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <button className="btn-primary shrink-0" onClick={() => invite(t.id)} disabled={!inviteEmail}>
                Invite
              </button>
            </div>
          )}
        </div>
      ))}
      {teams.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No teams yet. Teams (with roles, shared projects and activity logs) are available on the Business plan.
        </div>
      )}
    </div>
  );
}
