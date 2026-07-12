"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

const links = [
  { href: "/dashboard", label: "Projects", icon: "📁" },
  { href: "/dashboard/domains", label: "Domains", icon: "🌍" },
  { href: "/dashboard/team", label: "Team", icon: "👥" },
  { href: "/dashboard/activity", label: "Activity", icon: "📜" },
  { href: "/dashboard/keys", label: "API keys", icon: "🔑" },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: "🪝" },
  { href: "/dashboard/billing", label: "Billing", icon: "💳" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="mt-4 space-y-1">
      {links.map((l) => {
        const active =
          l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60"
            }`}
          >
            <span aria-hidden>{l.icon}</span> {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function UserMenu() {
  const { data } = useSession();
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-slate-500 sm:inline">{data?.user?.email}</span>
      <button onClick={() => signOut({ callbackUrl: "/" })} className="btn-secondary px-3 py-1.5 text-xs">
        Sign out
      </button>
    </div>
  );
}

interface Notification {
  id: string;
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : { notifications: [], unread: 0 }))
      .then((d) => {
        setItems(d.notifications ?? []);
        setUnread(d.unread ?? 0);
      })
      .catch(() => {});
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      fetch("/api/notifications", { method: "POST" }).catch(() => {});
      setUnread(0);
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} aria-label="Notifications" className="relative rounded-xl border border-slate-300 p-2 text-sm dark:border-slate-700">
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {items.length === 0 && <p className="p-4 text-sm text-slate-500">No notifications yet.</p>}
          {items.slice(0, 10).map((n) => (
            <Link
              key={n.id}
              href={n.href ?? "#"}
              className="block rounded-xl p-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => setOpen(false)}
            >
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="truncate text-xs text-slate-500">{n.body}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
