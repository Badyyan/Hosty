"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { path: "", label: "Overview" },
  { path: "/analytics", label: "Analytics" },
  { path: "/editor", label: "Editor" },
  { path: "/leads", label: "Leads" },
  { path: "/feedback", label: "Feedback" },
  { path: "/settings", label: "Settings" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/projects/${projectId}`;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800">
      <Link href="/dashboard" className="mr-2 rounded-lg px-2 py-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
        ← Projects
      </Link>
      {tabs.map((t) => {
        const href = `${base}${t.path}`;
        const active = t.path === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.path}
            href={href}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-brand-500 text-brand-600 dark:text-brand-300"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
