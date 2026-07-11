export interface HostyClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface HostyProject {
  id: string;
  name: string;
  slug: string;
  type?: string;
  url: string;
  version?: number;
  updatedAt?: string;
  deployment?: { id: string; files: number | { path: string; size: number }[]; bytes?: number };
}

export interface HostyAnalytics {
  visitors: number;
  sessions: number;
  pageViews: number;
  downloads: number;
  bounceRate: number;
  topPages: { key: string; count: number }[];
  referrers: { key: string; count: number }[];
  countries: { key: string; count: number }[];
}

export declare class HostyError extends Error {
  status: number;
  body: unknown;
}

export declare class HostyClient {
  constructor(options: HostyClientOptions);
  me(): Promise<{
    email: string;
    name: string | null;
    plan: string;
    usage: { projects: number; maxProjects: number; storageBytes: number; maxStorageBytes: number };
  }>;
  listProjects(opts?: { search?: string; limit?: number }): Promise<HostyProject[]>;
  getProject(id: string): Promise<HostyProject>;
  deploy(
    fileData: Blob | ArrayBuffer | Uint8Array,
    filename: string,
    opts?: { name?: string; slug?: string }
  ): Promise<{ project: HostyProject }>;
  update(
    projectId: string,
    fileData: Blob | ArrayBuffer | Uint8Array,
    filename: string
  ): Promise<{ project: HostyProject }>;
  deleteProject(id: string): Promise<void>;
  analytics(projectId: string, opts?: { days?: number }): Promise<HostyAnalytics>;
  graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

export default HostyClient;
