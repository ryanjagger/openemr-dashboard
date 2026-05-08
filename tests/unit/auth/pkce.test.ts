// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  generateChallenge,
  generateNonce,
  generateState,
  generateVerifier,
} from "@/lib/auth/pkce";

describe("PKCE helpers", () => {
  it("verifier is RFC 7636 length and charset", async () => {
    const v = await generateVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9_~.-]+$/);
  });

  it("challenge is base64url SHA-256 (43 chars, URL-safe)", async () => {
    const v = await generateVerifier();
    const c = await generateChallenge(v);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(c).toHaveLength(43);
    expect(c).not.toContain("=");
  });

  it("challenge is deterministic for a given verifier", async () => {
    const v = await generateVerifier();
    const c1 = await generateChallenge(v);
    const c2 = await generateChallenge(v);
    expect(c1).toBe(c2);
  });

  it("two verifiers produce different challenges", async () => {
    const v1 = await generateVerifier();
    const v2 = await generateVerifier();
    expect(v1).not.toBe(v2);
    expect(await generateChallenge(v1)).not.toBe(await generateChallenge(v2));
  });

  it("state and nonce are URL-safe random strings", async () => {
    const s = await generateState();
    const n = await generateNonce();
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s).not.toBe(n);
  });
});
