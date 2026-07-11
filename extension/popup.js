/* Hosty Chrome extension popup: login with an API key, drag-drop publish,
   grab AI-generated code from the active chat tab, list & update projects. */

const $ = (id) => document.getElementById(id);
let cfg = { url: "https://hosty.site", key: null };
let updateTarget = null; // project id to update instead of create

async function loadCfg() {
  const stored = await chrome.storage.local.get(["hostyUrl", "hostyKey"]);
  if (stored.hostyUrl) cfg.url = stored.hostyUrl;
  cfg.key = stored.hostyKey ?? null;
}

async function api(method, path, body) {
  const res = await fetch(`${cfg.url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.key}` },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function show(view) {
  $("login-view").hidden = view !== "login";
  $("main-view").hidden = view !== "main";
}

async function refreshProjects() {
  try {
    const { projects } = await api("GET", "/api/v1/projects?limit=6");
    $("projects").innerHTML = projects.length
      ? projects
          .map(
            (p) => `<div class="card">
              <a href="${p.url}" target="_blank">${escapeHtml(p.name)}</a>
              <div class="muted">${p.url.replace(/^https?:\/\//, "")} · v${p.version}</div>
              <a href="#" data-update="${p.id}" class="muted">↻ update with next upload</a>
            </div>`
          )
          .join("")
      : '<p class="muted">No projects yet — drop a file above!</p>';
    document.querySelectorAll("[data-update]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        updateTarget = a.getAttribute("data-update");
        setStatus(`Next upload will update this project.`, "ok");
      })
    );
  } catch (err) {
    setStatus(err.message, "err");
  }
}

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg;
  el.className = cls ?? "muted";
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function publish(fileOrBlob, filename) {
  setStatus("Uploading…");
  const form = new FormData();
  form.append("file", fileOrBlob, filename);
  try {
    const result = updateTarget
      ? await api("PUT", `/api/v1/projects/${updateTarget}`, form)
      : await api("POST", "/api/v1/projects", form);
    updateTarget = null;
    setStatus(`✔ Live: ${result.project.url}`, "ok");
    await navigator.clipboard.writeText(result.project.url).catch(() => {});
    chrome.tabs.create({ url: result.project.url });
    refreshProjects();
  } catch (err) {
    setStatus(err.message, "err");
  }
}

/* Grab the last code block from the open AI chat tab (content.js does the DOM work). */
async function grabFromAiTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return setStatus("Open a ChatGPT/Claude/Gemini/Grok/DeepSeek tab first.", "err");
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__hostyGrabCode?.() ?? null,
    });
    if (!result) return setStatus("No code block found in this chat.", "err");
    const isHtml = /<html|<!doctype/i.test(result);
    const blob = new Blob([result], { type: "text/plain" });
    await publish(blob, isHtml ? "index.html" : "snippet.html");
  } catch {
    setStatus("Can't read this tab — is it a supported AI chat site?", "err");
  }
}

/* wiring */
document.addEventListener("DOMContentLoaded", async () => {
  await loadCfg();
  $("base-url").value = cfg.url;
  if (!cfg.key) return show("login");
  show("main");
  try {
    const me = await api("GET", "/api/v1/me");
    $("who").textContent = `· ${me.email}`;
  } catch {
    return show("login");
  }
  refreshProjects();
});

$("login-btn").addEventListener("click", async () => {
  cfg.url = $("base-url").value.trim().replace(/\/$/, "") || "https://hosty.site";
  cfg.key = $("api-key").value.trim();
  try {
    await api("GET", "/api/v1/me");
    await chrome.storage.local.set({ hostyUrl: cfg.url, hostyKey: cfg.key });
    show("main");
    refreshProjects();
  } catch (err) {
    $("login-msg").textContent = err.message;
  }
});

$("logout").addEventListener("click", async (e) => {
  e.preventDefault();
  await chrome.storage.local.remove(["hostyKey"]);
  cfg.key = null;
  show("login");
});

const drop = $("drop");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const f = e.dataTransfer.files[0];
  if (f) publish(f, f.name);
});
$("pick-btn").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) publish(f, f.name);
});
$("grab-btn").addEventListener("click", grabFromAiTab);
