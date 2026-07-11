import AdmZip from "adm-zip";
import { isAllowedFile } from "./mime";

/**
 * Safe ZIP extraction:
 * - zip-slip protection (path traversal)
 * - zip-bomb guards (entry count / per-entry size / total size)
 * - skips junk (.git, __MACOSX, dotfiles, disallowed types)
 * - strips a single common root folder ("site/index.html" → "index.html")
 */

export const ZIP_LIMITS = {
  maxEntries: 10_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
};

export interface ExtractedFile {
  path: string;
  data: Buffer;
}

export class ZipError extends Error {}

/** Normalize an archive path; returns null if it must be skipped or is unsafe. */
export function normalizeZipPath(raw: string): string | null {
  // Windows separators, leading ./, collapse repeats
  let p = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!p || p.endsWith("/")) return null; // directory entry
  const segments = p.split("/");
  const clean: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") throw new ZipError(`Unsafe path in archive: ${raw}`);
    clean.push(seg);
  }
  if (clean.length === 0) return null;
  // junk filters
  if (clean.some((s) => s === "__MACOSX" || s === ".git" || s === "node_modules")) return null;
  if (clean[clean.length - 1].startsWith(".")) return null; // .DS_Store etc.
  return clean.join("/");
}

export function extractZip(buffer: Buffer): ExtractedFile[] {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length > ZIP_LIMITS.maxEntries) {
    throw new ZipError(`Archive has too many files (max ${ZIP_LIMITS.maxEntries}).`);
  }

  let total = 0;
  const files: ExtractedFile[] = [];
  for (const entry of entries) {
    const path = normalizeZipPath(entry.entryName);
    if (!path) continue;
    if (!isAllowedFile(path)) continue;
    const declared = entry.header.size;
    if (declared > ZIP_LIMITS.maxEntryBytes) {
      throw new ZipError(`"${path}" exceeds the per-file limit.`);
    }
    const data = entry.getData();
    if (data.length > ZIP_LIMITS.maxEntryBytes) {
      throw new ZipError(`"${path}" exceeds the per-file limit.`);
    }
    total += data.length;
    if (total > ZIP_LIMITS.maxTotalBytes) {
      throw new ZipError("Archive exceeds the total uncompressed size limit.");
    }
    files.push({ path, data });
  }

  if (files.length === 0) {
    throw new ZipError("Archive contains no hostable files.");
  }
  return stripCommonRoot(files);
}

/** If every file lives under one folder ("dist/…"), strip that folder. */
export function stripCommonRoot(files: ExtractedFile[]): ExtractedFile[] {
  // Never strip if any file is already at root
  if (files.some((f) => !f.path.includes("/"))) return files;
  const roots = new Set(files.map((f) => f.path.split("/")[0]));
  if (roots.size !== 1) return files;
  return files.map((f) => ({ ...f, path: f.path.split("/").slice(1).join("/") }));
}

/** Pick the entry page for a deployment (index.html > any root html > first file). */
export function findIndexPath(paths: string[]): string | null {
  if (paths.includes("index.html")) return "index.html";
  if (paths.includes("index.htm")) return "index.htm";
  const rootHtml = paths.filter((p) => !p.includes("/") && /\.html?$/.test(p));
  if (rootHtml.length) return rootHtml.sort()[0];
  const anyHtml = paths.filter((p) => /\.html?$/.test(p));
  if (anyHtml.length) return anyHtml.sort((a, b) => a.length - b.length)[0];
  return null;
}
