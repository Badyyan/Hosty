import { describe, it, expect } from "vitest";
import { slugify, isValidSlug, slugCandidate, RESERVED_SLUGS } from "../slugs";

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("My Cool Site!")).toBe("my-cool-site");
  });
  it("strips diacritics", () => {
    expect(slugify("Café Über")).toBe("cafe-uber");
  });
  it("collapses separators and trims dashes", () => {
    expect(slugify("--a___b  c--")).toBe("a-b-c");
  });
  it("caps length at 48", () => {
    expect(slugify("x".repeat(100)).length).toBeLessThanOrEqual(48);
  });
});

describe("isValidSlug", () => {
  it("accepts normal slugs", () => {
    expect(isValidSlug("my-site-42")).toBe(true);
  });
  it("rejects reserved slugs", () => {
    for (const r of ["www", "api", "admin", "dashboard"]) {
      expect(RESERVED_SLUGS.has(r)).toBe(true);
      expect(isValidSlug(r)).toBe(false);
    }
  });
  it("rejects invalid DNS labels", () => {
    expect(isValidSlug("-bad")).toBe(false);
    expect(isValidSlug("bad-")).toBe(false);
    expect(isValidSlug("UPPER")).toBe(false);
    expect(isValidSlug("a b")).toBe(false);
  });
});

describe("slugCandidate", () => {
  it("falls back to a random slug for empty names", () => {
    expect(slugCandidate("")).toMatch(/^site-[a-z0-9]{6}$/);
  });
  it("never returns a reserved slug", () => {
    expect(slugCandidate("admin")).toMatch(/^site-/);
  });
});
