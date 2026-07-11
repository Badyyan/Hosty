import { describe, it, expect } from "vitest";
import {
  sign,
  verifySignature,
  unlockCookieValue,
  verifyUnlockCookie,
  isSafeExternalUrl,
} from "../security";

describe("HMAC signing", () => {
  it("round-trips", () => {
    const sig = sign("hello");
    expect(verifySignature("hello", sig)).toBe(true);
    expect(verifySignature("hello!", sig)).toBe(false);
  });
});

describe("unlock cookies", () => {
  it("verifies a valid cookie", () => {
    const v = unlockCookieValue("proj1", 0);
    expect(verifyUnlockCookie("proj1", 0, v)).toBe(true);
  });
  it("invalidates when the password version bumps", () => {
    const v = unlockCookieValue("proj1", 0);
    expect(verifyUnlockCookie("proj1", 1, v)).toBe(false);
  });
  it("does not leak across projects", () => {
    const v = unlockCookieValue("proj1", 0);
    expect(verifyUnlockCookie("proj2", 0, v)).toBe(false);
  });
  it("rejects missing cookies", () => {
    expect(verifyUnlockCookie("proj1", 0, undefined)).toBe(false);
  });
});

describe("SSRF guard", () => {
  it("allows public https urls", () => {
    expect(isSafeExternalUrl("https://hooks.example.com/x")).toBe(true);
  });
  it("blocks private and local targets", () => {
    expect(isSafeExternalUrl("http://localhost/x")).toBe(false);
    expect(isSafeExternalUrl("http://127.0.0.1/x")).toBe(false);
    expect(isSafeExternalUrl("http://10.0.0.5/x")).toBe(false);
    expect(isSafeExternalUrl("http://192.168.1.1/x")).toBe(false);
    expect(isSafeExternalUrl("http://169.254.169.254/meta")).toBe(false);
    expect(isSafeExternalUrl("ftp://example.com/x")).toBe(false);
  });
});
