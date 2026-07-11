import { config } from "@/lib/config";
import type { SiteMeta } from "./resolve";

/**
 * HTML post-processing for hosted pages: inject the analytics beacon,
 * the feedback widget loader, and the "Made with Hosty" badge (free plan).
 * Also renders the built-in gate/viewer/error pages.
 */

export function injectIntoHtml(html: string, site: SiteMeta): string {
  const parts: string[] = [beaconScript(site.projectId)];
  if (site.feedbackEnabled) parts.push(feedbackLoader(site.projectId));
  if (!site.removeBranding) parts.push(brandingBadge());
  const injection = parts.join("\n");
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx !== -1) return html.slice(0, idx) + injection + html.slice(idx);
  return html + injection;
}

function beaconScript(projectId: string): string {
  // Same-origin beacon (rewritten by middleware to /api/ingest/event).
  return `<script>(function(){var p=${JSON.stringify(projectId)},t0=Date.now();
function send(type,extra){try{var d=Object.assign({projectId:p,type:type,path:location.pathname,referrer:document.referrer||null},extra||{});
navigator.sendBeacon("/_hosty/event",new Blob([JSON.stringify(d)],{type:"application/json"}))}catch(e){}}
send("pageview");
addEventListener("pagehide",function(){send("heartbeat",{duration:Math.min(7200,Math.round((Date.now()-t0)/1000))})});
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[download],a[href$='.pdf'],a[href$='.zip'],a[href$='.docx'],a[href$='.xlsx'],a[href$='.pptx']");
if(a)send("download",{path:a.getAttribute("href")||location.pathname})});
})();</script>`;
}

function feedbackLoader(projectId: string): string {
  return `<script src="/_hosty/feedback.js" data-project=${JSON.stringify(projectId)} defer></script>`;
}

function brandingBadge(): string {
  const app = config.appUrl;
  return `<a href="${app}?utm_source=badge" target="_blank" rel="noopener" style="position:fixed;bottom:14px;right:14px;z-index:2147483000;background:#111;color:#fff;font:600 12px/1 system-ui,sans-serif;padding:8px 12px;border-radius:999px;text-decoration:none;opacity:.85;box-shadow:0 2px 10px rgba(0,0,0,.25)">▲ Made with Hosty</a>`;
}

// ---------------------------------------------------------------------------
// Built-in pages (gates, viewers, errors) — self-contained, no app assets.
// ---------------------------------------------------------------------------

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box;margin:0}
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fb;color:#111}
@media (prefers-color-scheme:dark){body{background:#0b0e14;color:#e6e9ef}.card{background:#141924!important;border-color:#252c3b!important}input{background:#0b0e14!important;color:#e6e9ef!important;border-color:#333c4f!important}}
.card{background:#fff;border:1px solid #e4e8f0;border-radius:16px;padding:36px;max-width:400px;width:92%;box-shadow:0 8px 30px rgba(15,23,42,.08)}
h1{font-size:19px;margin-bottom:8px}p{font-size:14px;opacity:.75;margin-bottom:20px;line-height:1.5}
input{width:100%;padding:11px 14px;border:1px solid #d6dce8;border-radius:10px;font-size:14px;margin-bottom:12px}
button{width:100%;padding:11px;border:0;border-radius:10px;background:#3563f9;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
button:hover{background:#1f43ee}.err{color:#dc2626;font-size:13px;margin-bottom:12px}
</style></head><body>${body}</body></html>`;
}

export function passwordGatePage(projectId: string, siteName: string, error?: string): string {
  return shell(
    `${siteName} — Protected`,
    `<form class="card" method="POST" action="/_hosty/unlock">
      <h1>🔒 ${escapeHtml(siteName)}</h1>
      <p>This site is password protected. Enter the password to continue.</p>
      ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
      <input type="hidden" name="projectId" value="${escapeHtml(projectId)}">
      <input type="password" name="password" placeholder="Password" autofocus required>
      <button type="submit">Unlock</button>
    </form>`
  );
}

export function emailGatePage(projectId: string, siteName: string, error?: string): string {
  return shell(
    `${siteName}`,
    `<form class="card" method="POST" action="/_hosty/lead">
      <h1>${escapeHtml(siteName)}</h1>
      <p>Enter your email address to view this content.</p>
      ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
      <input type="hidden" name="projectId" value="${escapeHtml(projectId)}">
      <input type="text" name="name" placeholder="Your name (optional)">
      <input type="email" name="email" placeholder="you@example.com" required>
      <button type="submit">Continue →</button>
    </form>`
  );
}

export function notFoundPage(): string {
  return shell(
    "Not found",
    `<div class="card" style="text-align:center"><h1>404</h1><p>This page doesn't exist — the site may have been moved or deleted.</p><a href="${config.appUrl}" style="color:#3563f9;font-size:14px;font-weight:600;text-decoration:none">Hosted with Hosty →</a></div>`
  );
}

export function pdfViewerPage(site: SiteMeta, filePath: string): string {
  const raw = `/${encodePath(filePath)}?raw=1`;
  const downloadControls = site.pdfDownloadable
    ? `<a class="dl" href="${raw}&download=1">Download</a>`
    : "";
  // View-only mode: toolbar hidden, context menu suppressed (deterrent — the
  // bytes necessarily reach the client; see docs/security.md).
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(site.name)}</title><style>
body{margin:0;height:100vh;display:flex;flex-direction:column;background:#2b2f3a;font-family:system-ui,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#1c2029;color:#fff}
header h1{font-size:14px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dl{color:#fff;background:#3563f9;padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none}
embed{flex:1;width:100%;border:0}</style>
${site.pdfDownloadable ? "" : "<script>document.addEventListener('contextmenu',e=>e.preventDefault())</script>"}
</head><body>
<header><h1>${escapeHtml(site.name)}</h1>${downloadControls}</header>
<embed src="${raw}#toolbar=${site.pdfDownloadable ? 1 : 0}&navpanes=0" type="application/pdf">
</body></html>`;
}

export function docViewerPage(site: SiteMeta, filePath: string, publicUrl: string): string {
  const officeSrc = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(site.name)}</title><style>
body{margin:0;height:100vh;display:flex;flex-direction:column;background:#f0f2f7;font-family:system-ui,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fff;border-bottom:1px solid #e4e8f0}
header h1{font-size:14px;font-weight:600;flex:1}
a{color:#fff;background:#3563f9;padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none}
iframe{flex:1;width:100%;border:0}</style></head><body>
<header><h1>${escapeHtml(site.name)}</h1><a href="/${encodePath(filePath)}?raw=1&download=1">Download</a></header>
<iframe src="${officeSrc}" title="Document viewer"></iframe>
</body></html>`;
}

export function imageViewerPage(site: SiteMeta, filePath: string): string {
  const raw = `/${encodePath(filePath)}?raw=1`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(site.name)}</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#14171f;flex-direction:column;gap:16px;padding:24px;font-family:system-ui,sans-serif}
img{max-width:100%;max-height:85vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.5)}
a{color:#fff;background:#3563f9;padding:8px 18px;border-radius:8px;font-size:13px;text-decoration:none}</style></head><body>
<img src="${raw}" alt="${escapeHtml(site.name)}">
<a href="${raw}&download=1" download>Download</a>
</body></html>`;
}

export function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
