import { describe, expect, it } from "vitest";

describe("phase 0 smoke", () => {
  it("vitest runs and resolves @ alias", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
