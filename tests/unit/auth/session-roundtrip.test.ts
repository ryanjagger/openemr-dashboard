// @vitest-environment node
import { sealData, unsealData } from "iron-session";
import { describe, expect, it } from "vitest";

// What we actually put in the cookie post-refactor: only a session id
// plus pre-callback transient PKCE/state. Tokens live server-side.
type CookiePayload = {
  sid: string;
  state?: string;
  codeVerifier?: string;
  nonce?: string;
  returnTo?: string;
};

const password = "x".repeat(64);

describe("session cookie encryption round-trip", () => {
  it("sealed payload decrypts back to the original shape", async () => {
    const payload: CookiePayload = {
      sid: "11111111-2222-3333-4444-555555555555",
      state: "state-value",
      codeVerifier: "verifier-value",
      nonce: "nonce-value",
      returnTo: "/patient/abc",
    };
    const sealed = await sealData(payload, { password });
    expect(typeof sealed).toBe("string");
    expect(sealed).not.toContain("verifier-value");

    const unsealed = await unsealData<CookiePayload>(sealed, { password });
    expect(unsealed).toEqual(payload);
  });

  it("a different password yields empty data (signature verification fails closed)", async () => {
    const payload: CookiePayload = { sid: "x" };
    const sealed = await sealData(payload, { password });
    // iron-session fails-closed: returns {} rather than throwing, so a
    // forged/stale cookie surfaces as an unauthenticated session.
    const result = await unsealData<CookiePayload>(sealed, {
      password: "y".repeat(64),
    });
    expect(result).toEqual({});
  });
});
