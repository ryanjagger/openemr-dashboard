// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/oauth", () => ({
  refreshTokens: vi.fn(),
}));

import { refreshTokens } from "@/lib/auth/oauth";
import {
  RefreshFailedError,
  isExpired,
  refreshIfNeeded,
} from "@/lib/auth/refresh";
import type { Session } from "@/lib/auth/session";

const refreshMock = vi.mocked(refreshTokens);

type FakeSession = Session & {
  save: () => Promise<void>;
  destroy: () => void;
};

function makeSession(overrides: Partial<Session> = {}): FakeSession {
  return {
    accessToken: "old-at",
    refreshToken: "rt",
    idToken: "old-id",
    expiresAt: Math.floor(Date.now() / 1000) - 60,
    userId: "sub",
    ...overrides,
    save: vi.fn(async () => {}),
    destroy: vi.fn(),
  };
}

beforeEach(() => {
  refreshMock.mockReset();
});

describe("isExpired", () => {
  it("treats missing expiresAt as expired", () => {
    expect(isExpired({})).toBe(true);
  });
  it("treats past expiresAt as expired", () => {
    expect(isExpired({ expiresAt: Math.floor(Date.now() / 1000) - 1 })).toBe(true);
  });
  it("treats future-but-within-skew as expired", () => {
    expect(
      isExpired({ expiresAt: Math.floor(Date.now() / 1000) + 10 }, 30),
    ).toBe(true);
  });
  it("treats well-in-future as fresh", () => {
    expect(
      isExpired({ expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
    ).toBe(false);
  });
});

describe("refreshIfNeeded", () => {
  it("no-op when not authenticated", async () => {
    const session = makeSession({ accessToken: undefined, refreshToken: undefined });
    const did = await refreshIfNeeded(session as never);
    expect(did).toBe(false);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("no-op when token is fresh", async () => {
    const session = makeSession({
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const did = await refreshIfNeeded(session as never);
    expect(did).toBe(false);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes expired token and saves the session", async () => {
    refreshMock.mockResolvedValueOnce({
      access_token: "new-at",
      refresh_token: "new-rt",
      id_token: "new-id",
      token_type: "Bearer",
      expires_in: 3600,
    } as never);

    const session = makeSession();
    const did = await refreshIfNeeded(session as never);

    expect(did).toBe(true);
    expect(session.accessToken).toBe("new-at");
    expect(session.refreshToken).toBe("new-rt");
    expect(session.idToken).toBe("new-id");
    expect(session.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(session.save).toHaveBeenCalledOnce();
  });

  it("preserves refresh token when server doesn't issue a new one", async () => {
    refreshMock.mockResolvedValueOnce({
      access_token: "new-at",
      token_type: "Bearer",
      expires_in: 3600,
    } as never);

    const session = makeSession({ refreshToken: "kept-rt" });
    await refreshIfNeeded(session as never);
    expect(session.refreshToken).toBe("kept-rt");
  });

  it("wraps refresh failures in RefreshFailedError", async () => {
    refreshMock.mockRejectedValueOnce(new Error("bad refresh"));
    const session = makeSession();
    await expect(refreshIfNeeded(session as never)).rejects.toBeInstanceOf(
      RefreshFailedError,
    );
  });
});
