import { describe, it, expect } from "vitest";
import { normalizeRequestPath } from "../serve/resolve";
import { contentTypeFor, isAllowedFile, projectTypeForFile } from "../mime";

describe("normalizeRequestPath", () => {
  it("strips slashes", () => {
    expect(normalizeRequestPath("/about/")).toBe("about");
    expect(normalizeRequestPath("//a//b")).toBe("a/b");
  });
  it("decodes percent-encoding", () => {
    expect(normalizeRequestPath("caf%C3%A9.html")).toBe("café.html");
  });
  it("rejects traversal attempts", () => {
    expect(normalizeRequestPath("../secret")).toBeNull();
    expect(normalizeRequestPath("a/%2e%2e/b")).toBeNull();
    expect(normalizeRequestPath("a/\0b")).toBeNull();
  });
});

describe("mime allow-list", () => {
  it("accepts common web + doc formats", () => {
    for (const f of ["index.html", "app.js", "style.css", "doc.pdf", "img.webp", "sheet.xlsx", "raw.cr2"]) {
      expect(isAllowedFile(f)).toBe(true);
    }
  });
  it("rejects executables and extension-less files", () => {
    expect(isAllowedFile("malware.exe")).toBe(false);
    expect(isAllowedFile("script.sh")).toBe(false);
    expect(isAllowedFile("Makefile")).toBe(false);
  });
  it("never serves php as html", () => {
    expect(contentTypeFor("shell.php")).toBe("application/octet-stream");
  });
  it("classifies project types", () => {
    expect(projectTypeForFile("a.zip")).toBe("SITE");
    expect(projectTypeForFile("a.html")).toBe("HTML");
    expect(projectTypeForFile("a.pdf")).toBe("PDF");
    expect(projectTypeForFile("a.png")).toBe("IMAGE");
    expect(projectTypeForFile("a.docx")).toBe("DOCUMENT");
  });
});
