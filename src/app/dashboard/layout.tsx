import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUserId } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLinks, UserMenu, NotificationsBell } from "@/components/dashboard/nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userId = await currentUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard");

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0e1119] lg:flex lg:flex-col">
        <Link href="/dashboard" className="px-2 py-3 text-lg font-extrabold tracking-tight">
          <span className="text-brand-500">▲</span> Hosty
        </Link>
        <NavLinks />
        <div className="mt-auto px-2 pb-2 text-xs text-slate-400">
          <Link href="/docs" className="hover:underline">API docs</Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-[#0b0e14]/80">
          <Link href="/dashboard" className="font-extrabold lg:hidden">
            <span className="text-brand-500">▲</span> Hosty
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <NotificationsBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
