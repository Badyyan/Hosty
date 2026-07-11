import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const features = [
  { icon: "⚡", title: "Instant publishing", body: "Drag & drop a ZIP, HTML, PDF or image — get a live HTTPS link on your own subdomain in seconds." },
  { icon: "📊", title: "Built-in analytics", body: "Visitors, referrers, countries, devices and time-on-page. Private by design — no cookies, no PII." },
  { icon: "🔒", title: "Password protection", body: "Gate any project behind a password, or capture emails before granting access." },
  { icon: "🌍", title: "Custom domains", body: "Connect your own domain with automatic SSL, or share a clean yourname.hosty.site link." },
  { icon: "✏️", title: "Edit in the browser", body: "A full code editor with live preview, auto-save, version history and one-click rollback." },
  { icon: "🤝", title: "Teams & feedback", body: "Invite collaborators with roles, and let visitors leave threaded comments right on the page." },
];

const plans = [
  { name: "Free", price: "$0", items: ["3 projects", "25 MB uploads", "100 MB storage", "Analytics (30 days)", "Hosty subdomain"] },
  { name: "Pro", price: "$12", items: ["25 projects", "100 MB uploads", "5 GB storage", "Custom domains + SSL", "Password protection", "Email capture", "No branding"], featured: true },
  { name: "Business", price: "$49", items: ["200 projects", "1 GB uploads", "50 GB storage", "Teams & roles", "Activity logs", "Priority support"] },
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="flex items-center justify-between py-6">
        <div className="text-xl font-extrabold tracking-tight">
          <span className="text-brand-500">▲</span> Hosty
        </div>
        <nav className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="btn-secondary">Sign in</Link>
          <Link href="/register" className="btn-primary">Get started free</Link>
        </nav>
      </header>

      <section className="py-20 text-center animate-fade-in-up">
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-tight tracking-tight">
          The simplest way to put anything <span className="text-brand-500">online</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600 dark:text-slate-400">
          Upload a website, PDF, image or document and share a live link in seconds.
          No servers, no config, no git required.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">Upload your first site →</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">Live demo</Link>
        </div>
        <p className="mt-4 text-sm text-slate-500">Free forever plan · no credit card required</p>
      </section>

      <section className="grid gap-6 py-16 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card p-6 text-left">
            <div className="text-2xl">{f.icon}</div>
            <h3 className="mt-3 font-bold">{f.title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="py-16">
        <h2 className="text-center text-3xl font-extrabold">Simple pricing</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`card p-8 ${p.featured ? "ring-2 ring-brand-500" : ""}`}
            >
              <h3 className="font-bold">{p.name}</h3>
              <div className="mt-2 text-4xl font-extrabold">
                {p.price}
                <span className="text-base font-medium text-slate-500">/mo</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                {p.items.map((i) => (
                  <li key={i}>✓ {i}</li>
                ))}
              </ul>
              <Link href="/register" className={`mt-8 w-full ${p.featured ? "btn-primary" : "btn-secondary"}`}>
                Choose {p.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-800">
        © {new Date().getFullYear()} Hosty · <Link href="/docs" className="hover:underline">API docs</Link>
      </footer>
    </main>
  );
}
