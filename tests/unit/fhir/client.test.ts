// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  openemrFetch: vi.fn(),
}));
vi.mock("@/lib/auth/refresh", () => ({
  forceRefresh: vi.fn(),
  RefreshFailedError: class RefreshFailedError extends Error {},
}));

import { forceRefresh, RefreshFailedError } from "@/lib/auth/refresh";
import type { Session } from "@/lib/auth/session";
import {
  AuthExpiredError,
  FhirNetworkError,
  FhirNotFoundError,
  FhirServerError,
  fhirGet,
} from "@/lib/fhir/client";
import { openemrFetch } from "@/lib/http";

const fetchMock = vi.mocked(openemrFetch);
const refreshMock = vi.mocked(forceRefresh);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/fhir+json" },
  });
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    accessToken: "at-1",
    refreshToken: "rt-1",
    idToken: "id-1",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    userId: "sub",
    save: vi.fn(async () => {}),
    destroy: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  refreshMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fhirGet — happy path", () => {
  it("returns parsed JSON and sends the access token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ resourceType: "Patient", id: "p1" }),
    );
    const session = makeSession();
    const result = await fhirGet<fhir4.Patient>(session, "/Patient/p1");
    expect(result).toEqual({ resourceType: "Patient", id: "p1" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]![1];
    expect((init as RequestInit).method).toBe("GET");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer at-1");
    expect(headers.get("Accept")).toBe("application/fhir+json");
  });

  it("appends searchParams and skips undefined entries", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ resourceType: "Bundle" }));
    await fhirGet(makeSession(), "/Condition", {
      searchParams: { patient: "p1", category: "problem-list-item", _sort: undefined },
    });
    const [url] = fetchMock.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.searchParams.get("patient")).toBe("p1");
    expect(u.searchParams.get("category")).toBe("problem-list-item");
    expect(u.searchParams.has("_sort")).toBe(false);
  });
});

describe("fhirGet — 401 handling", () => {
  it("forces refresh once and retries on 401, succeeding the second time", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ resourceType: "Patient", id: "p1" }));
    refreshMock.mockImplementationOnce(async (s) => {
      s.accessToken = "at-NEW";
    });

    const session = makeSession();
    const result = await fhirGet<fhir4.Patient>(session, "/Patient/p1");
    expect(result).toEqual({ resourceType: "Patient", id: "p1" });
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const headersOnRetry = new Headers(
      (fetchMock.mock.calls[1]![1] as RequestInit).headers,
    );
    expect(headersOnRetry.get("Authorization")).toBe("Bearer at-NEW");
  });

  it("throws AuthExpiredError when refresh itself fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    refreshMock.mockRejectedValueOnce(new RefreshFailedError("nope"));
    await expect(
      fhirGet(makeSession(), "/Patient/p1"),
    ).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it("throws AuthExpiredError when the second 401 comes in after a successful refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    refreshMock.mockImplementationOnce(async (s) => {
      s.accessToken = "at-NEW";
    });
    await expect(
      fhirGet(makeSession(), "/Patient/p1"),
    ).rejects.toBeInstanceOf(AuthExpiredError);
  });
});

describe("fhirGet — 5xx handling", () => {
  it("retries once then throws FhirServerError on second 5xx", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(
      fhirGet(makeSession(), "/Patient/p1"),
    ).rejects.toBeInstanceOf(FhirServerError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the body when the retry succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 502))
      .mockResolvedValueOnce(jsonResponse({ resourceType: "Patient", id: "p1" }));
    const result = await fhirGet<fhir4.Patient>(makeSession(), "/Patient/p1");
    expect(result).toEqual({ resourceType: "Patient", id: "p1" });
  });
});

describe("fhirGet — error classes", () => {
  it("network errors become FhirNetworkError", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      fhirGet(makeSession(), "/Patient/p1"),
    ).rejects.toBeInstanceOf(FhirNetworkError);
  });

  it("404 becomes FhirNotFoundError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ issue: [] }, 404));
    await expect(
      fhirGet(makeSession(), "/Patient/p1"),
    ).rejects.toBeInstanceOf(FhirNotFoundError);
  });

  it("missing access token throws AuthExpiredError up front", async () => {
    await expect(
      fhirGet({ ...makeSession(), accessToken: undefined }, "/Patient/p1"),
    ).rejects.toBeInstanceOf(AuthExpiredError);
  });
});

describe("fhirGet — schema handling", () => {
  it("returns parsed data when the schema matches", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ resourceType: "Patient", id: "p1", active: true }),
    );
    const { PatientSchema } = await import("@/lib/fhir/schemas");
    const result = await fhirGet(makeSession(), "/Patient/p1", {
      schema: PatientSchema,
    });
    expect(result).toEqual({ resourceType: "Patient", id: "p1", active: true });
  });

  it("returns best-effort raw data when the schema fails (does NOT throw)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ resourceType: "NotPatient", id: "p1" }),
    );
    const { PatientSchema } = await import("@/lib/fhir/schemas");
    const result = await fhirGet(makeSession(), "/Patient/p1", {
      schema: PatientSchema,
    });
    expect(result).toEqual({ resourceType: "NotPatient", id: "p1" });
  });
});
