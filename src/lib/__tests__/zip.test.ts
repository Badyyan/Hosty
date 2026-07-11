import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { extractZip, normalizeZipPath, stripCommonRoot, findIndexPath, ZipError } from "../zip";

function makeZip(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.addFile(path, Buffer.from(content));
  }
  return zip.toBuffer();
}

describe("normalizeZipPath", () => {
  it("rejects path traversal (zip-slip)", () => {
    expect(() => normalizeZipPath("../../etc/passwd")).toThrow(ZipError);
    expect(() => normalizeZipPath("a/../../b")).toThrow(ZipError);
  });
  it("skips junk and dotfiles", () => {
    expect(normalizeZipPath("__MACOSX/x.html")).toBeNull();
    expect(normalizeZipPath(".git/config")).toBeNull();
    expect(normalizeZipPath("a/.DS_Store")).toBeNull();
  });
  it("normalizes windows separators", () => {
    expect(normalizeZipPath("assets\\app.js")).toBe("assets/app.js");
  });
});

describe("extractZip", () => {
  it("extracts hostable files", () => {
    const files = extractZip(
      makeZip({ "index.html": "<h1>hi</h1>", "css/app.css": "body{}" })
    );
    expect(files.map((f) => f.path).sort()).toEqual(["css/app.css", "index.html"]);
  });
  it("strips a single common root folder", () => {
    const files = extractZip(
      makeZip({ "dist/index.html": "x", "dist/a/b.css": "y" })
    );
    expect(files.map((f) => f.path).sort()).toEqual(["a/b.css", "index.html"]);
  });
  it("filters disallowed file types", () => {
    const files = extractZip(makeZip({ "index.html": "x", "evil.exe": "MZ" }));
    expect(files.map((f) => f.path)).toEqual(["index.html"]);
  });
  it("throws on archives with nothing hostable", () => {
    expect(() => extractZip(makeZip({ "a.exe": "MZ" }))).toThrow(ZipError);
  });
});

describe("stripCommonRoot", () => {
  it("does not strip when a file is already at root", () => {
    const files = [
      { path: "index.html", data: Buffer.from("") },
      { path: "sub/x.css", data: Buffer.from("") },
    ];
    expect(stripCommonRoot(files).map((f) => f.path)).toEqual(["index.html", "sub/x.css"]);
  });
});

describe("findIndexPath", () => {
  it("prefers root index.html", () => {
    expect(findIndexPath(["a.html", "index.html", "sub/index.html"])).toBe("index.html");
  });
  it("falls back to any root html", () => {
    expect(findIndexPath(["zeta.html", "alpha.html"])).toBe("alpha.html");
  });
  it("returns null with no html", () => {
    expect(findIndexPath(["a.pdf"])).toBeNull();
  });
});
