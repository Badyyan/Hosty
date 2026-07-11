import Link from "next/link";

export const metadata = { title: "API documentation" };

const endpoints = [
  ["GET", "/api/v1/me", "Key owner, plan and usage"],
  ["GET", "/api/v1/projects", "List projects (?search=&limit=)"],
  ["POST", "/api/v1/projects", "Create + deploy (multipart file, optional name/slug)"],
  ["GET", "/api/v1/projects/:id", "Project detail with file listing"],
  ["PUT", "/api/v1/projects/:id", "Re-deploy new content, same URL"],
  ["DELETE", "/api/v1/projects/:id", "Delete a project"],
  ["GET", "/api/v1/projects/:id/analytics", "Traffic summary (?days=30)"],
];

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-brand-500 hover:underline">← Hosty</Link>
      <h1 className="mt-4 text-3xl font-extrabold">REST API v1</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">
        Authenticate with an API key from your dashboard:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-sm text-slate-100">
        {`Authorization: Bearer hty_xxxxxxxxxxxxxxxx`}
      </pre>

      <h2 className="mt-10 text-xl font-bold">Deploy from the command line</h2>
      <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-sm text-slate-100">
{`# one-off with curl
curl -X POST $HOSTY_URL/api/v1/projects \\
  -H "Authorization: Bearer $HOSTY_API_KEY" \\
  -F "file=@dist.zip" -F "name=My Site"

# or with the CLI (packages/cli)
npx hosty deploy ./dist --name "My Site"`}
      </pre>

      <h2 className="mt-10 text-xl font-bold">Endpoints</h2>
      <div className="card mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        {endpoints.map(([method, path, desc]) => (
          <div key={`${method}-${path}`} className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className={`w-16 rounded-lg px-2 py-0.5 text-center text-xs font-bold ${method === "GET" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : method === "DELETE" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"}`}>
              {method}
            </span>
            <code className="font-mono text-xs">{path}</code>
            <span className="text-slate-500">{desc}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-bold">Webhooks</h2>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        Configure endpoints in the dashboard. Payloads are signed with
        <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">X-Hosty-Signature: sha256=hmac(secret, body)</code>
        and retried 3 times. Events: project.created, project.deployed, project.deleted, lead.captured, comment.created.
      </p>

      <h2 className="mt-10 text-xl font-bold">Deploy from GitHub Actions</h2>
      <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-sm text-slate-100">
{`- name: Deploy to Hosty
  run: |
    zip -r site.zip dist/
    curl -sf -X PUT "$HOSTY_URL/api/v1/projects/\${{ vars.HOSTY_PROJECT_ID }}" \\
      -H "Authorization: Bearer \${{ secrets.HOSTY_API_KEY }}" \\
      -F "file=@site.zip"`}
      </pre>
    </main>
  );
}
