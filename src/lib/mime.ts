import mime from "mime-types";

/**
 * Upload allow-list. Anything not listed is rejected at upload time.
 * Note: .php is accepted but always served as a download (never executed).
 */
const ALLOWED_EXTENSIONS = new Set([
  // web
  "html", "htm", "css", "js", "mjs", "json", "xml", "txt", "md", "markdown",
  "map", "webmanifest", "ico", "wasm", "php",
  // images
  "jpg", "jpeg", "png", "gif", "svg", "webp", "avif", "bmp", "tiff", "tif",
  // raw camera formats
  "raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2",
  // documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
  "csv", "rtf", "epub",
  // fonts
  "woff", "woff2", "ttf", "otf", "eot",
  // media
  "mp4", "webm", "mp3", "wav", "ogg", "m4a", "mov",
  // archives (zip is extracted; others hosted as downloads)
  "zip",
]);

const EXTRA_TYPES: Record<string, string> = {
  cr2: "image/x-canon-cr2",
  cr3: "image/x-canon-cr3",
  nef: "image/x-nikon-nef",
  arw: "image/x-sony-arw",
  dng: "image/x-adobe-dng",
  orf: "image/x-olympus-orf",
  rw2: "image/x-panasonic-rw2",
  raw: "application/octet-stream",
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  php: "application/octet-stream", // never text/html, never executed
};

export function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i + 1).toLowerCase();
}

export function isAllowedFile(path: string): boolean {
  const ext = extensionOf(path);
  if (!ext) return false;
  return ALLOWED_EXTENSIONS.has(ext);
}

export function contentTypeFor(path: string): string {
  const ext = extensionOf(path);
  if (EXTRA_TYPES[ext]) return EXTRA_TYPES[ext];
  const t = mime.lookup(path);
  if (!t) return "application/octet-stream";
  // Serve user text content with utf-8 to avoid encoding sniffing issues.
  if (t.startsWith("text/") || t === "application/javascript" || t === "image/svg+xml") {
    return `${t}; charset=utf-8`;
  }
  return t;
}

export function isHtml(contentType: string): boolean {
  return contentType.startsWith("text/html");
}

/** Which single-file uploads map to which ProjectType. */
export function projectTypeForFile(filename: string): "SITE" | "HTML" | "PDF" | "IMAGE" | "DOCUMENT" {
  const ext = extensionOf(filename);
  if (ext === "zip") return "SITE";
  if (ext === "html" || ext === "htm") return "HTML";
  if (ext === "pdf") return "PDF";
  if (["jpg", "jpeg", "png", "gif", "svg", "webp", "avif", "bmp", "tiff", "tif",
       "raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2"].includes(ext)) return "IMAGE";
  return "DOCUMENT";
}

/** Office formats we wrap in the document viewer page. */
export function isOfficeDoc(path: string): boolean {
  return ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"].includes(
    extensionOf(path)
  );
}
