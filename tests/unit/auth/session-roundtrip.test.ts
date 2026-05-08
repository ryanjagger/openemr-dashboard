// @vitest-environment node
import { sealData, unsealData } from "iron-session";
import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/session";

const password = "x".repeat(64);

describe("session encryption round-trip", () => {
  it("sealed payload decrypts back to the original Session shape", async () => {
    const payload: Session = {
      accessToken: "at-secret",
      refreshToken: "rt-secret",
      idToken: "id-token",
      expiresAt: 1_700_000_000,
      userId: "sub-123",
      fhirUser: "Practitioner/p-1",
    };
    const sealed = await sealData(payload, { password });
    expect(typeof sealed).toBe("string");
    expect(sealed).not.toContain("at-secret");

    const unsealed = await unsealData<Session>(sealed, { password });
    expect(unsealed).toEqual(payload);
  });

  it("a different password yields empty data (signature verification fails closed)", async () => {
    const payload: Session = { accessToken: "at" };
    const sealed = await sealData(payload, { password });
    // iron-session fails-closed: returns {} rather than throwing, so a
    // forged/stale cookie surfaces as an unauthenticated session.
    const result = await unsealData<Session>(sealed, {
      password: "y".repeat(64),
    });
    expect(result).toEqual({});
  });
});
