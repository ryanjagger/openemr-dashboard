// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isSafeReturnTo,
  resolveLoginReturnTo,
} from "@/lib/auth/post-login";

describe("post-login redirects", () => {
  it("accepts same-app absolute paths", () => {
    expect(isSafeReturnTo("/patient/abc")).toBe(true);
    expect(isSafeReturnTo("/patient/abc?tab=summary")).toBe(true);
  });

  it("rejects external and scheme-relative destinations", () => {
    expect(isSafeReturnTo("https://example.com/patient/abc")).toBe(false);
    expect(isSafeReturnTo("//example.com/patient/abc")).toBe(false);
    expect(isSafeReturnTo("patient/abc")).toBe(false);
    expect(isSafeReturnTo("/\\example.com")).toBe(false);
  });

  it("prefers a safe requested returnTo", () => {
    expect(
      resolveLoginReturnTo(
        "/patient/11111111-2222-3333-4444-555555555555/encounters",
      ),
    ).toBe("/patient/11111111-2222-3333-4444-555555555555/encounters");
  });

  it("replaces an unsafe or missing requested returnTo with the app root", () => {
    expect(resolveLoginReturnTo("//example.com")).toBe("/");
    expect(resolveLoginReturnTo(undefined)).toBe("/");
  });
});
