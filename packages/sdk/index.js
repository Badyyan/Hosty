/**
 * @hosty/sdk — official JavaScript SDK for the Hosty REST API v1.
 *
 *   import { HostyClient } from "@hosty/sdk";
 *   const hosty = new HostyClient({ apiKey: process.env.HOSTY_API_KEY });
 *   const { project } = await hosty.deploy(zipBuffer, "site.zip", { name: "Docs" });
 *   console.log(project.url);
 *
 * Zero dependencies; works in Node ≥18 and modern edge runtimes (uses
 * global fetch/FormData/Blob).
 */

export class HostyError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "HostyError";
    this.status = status;
    this.body = body;
  }
}

export class HostyClient {
  /**
   * @param {{ apiKey: string, baseUrl?: string, fetch?: typeof fetch }} options
   */
  constructor({ apiKey, baseUrl = "https://hosty.site", fetch: fetchImpl } = {}) {
    if (!apiKey || !apiKey.startsWith("hty_")) {
      throw new HostyError("A Hosty API key (hty_…) is required", 0, null);
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async #request(method, path, { body, headers } = {}) {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...headers },
      body,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      throw new HostyError(data?.error ?? `HTTP ${res.status}`, res.status, data);
    }
    return data;
  }

  #multipart(fileData, filename, fields = {}) {
    const form = new FormData();
    const blob = fileData instanceof Blob ? fileData : new Blob([fileData]);
    form.append("file", blob, filename);
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }
    return form;
  }

  /** Account, plan and usage for the key's owner. */
  me() {
    return this.#request("GET", "/api/v1/me");
  }

  /** List projects. */
  async listProjects({ search, limit } = {}) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    const data = await this.#request("GET", `/api/v1/projects${qs ? `?${qs}` : ""}`);
    return data.projects;
  }

  /** Fetch one project (with its file listing). */
  async getProject(id) {
    return (await this.#request("GET", `/api/v1/projects/${encodeURIComponent(id)}`)).project;
  }

  /**
   * Create + deploy a new project from a zip/html/pdf/image buffer or Blob.
   * @returns {{ project: { id, name, slug, url, deployment } }}
   */
  deploy(fileData, filename, { name, slug } = {}) {
    return this.#request("POST", "/api/v1/projects", {
      body: this.#multipart(fileData, filename, { name, slug }),
    });
  }

  /** Re-deploy an existing project — new content, same URL. */
  update(projectId, fileData, filename) {
    return this.#request("PUT", `/api/v1/projects/${encodeURIComponent(projectId)}`, {
      body: this.#multipart(fileData, filename),
    });
  }

  /** Delete a project and all of its versions. */
  async deleteProject(id) {
    await this.#request("DELETE", `/api/v1/projects/${encodeURIComponent(id)}`);
  }

  /** Traffic summary for a project. */
  analytics(projectId, { days = 30 } = {}) {
    return this.#request(
      "GET",
      `/api/v1/projects/${encodeURIComponent(projectId)}/analytics?days=${days}`
    );
  }

  /** Run a raw GraphQL query against /api/graphql. */
  async graphql(query, variables = {}) {
    const data = await this.#request("POST", "/api/graphql", {
      body: JSON.stringify({ query, variables }),
      headers: { "Content-Type": "application/json" },
    });
    if (data.errors?.length) {
      throw new HostyError(data.errors[0].message, 200, data);
    }
    return data.data;
  }
}

export default HostyClient;
