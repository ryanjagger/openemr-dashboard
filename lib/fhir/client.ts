import type { z } from "zod";
import { forceRefresh, RefreshFailedError } from "@/lib/auth/refresh";
import type { Session } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { openemrFetch } from "@/lib/http";
import { audit, log } from "@/lib/log";

export class AuthExpiredError extends Error {
  constructor(message = "Access token expired and refresh failed") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

export class FhirServerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FhirServerError";
    this.status = status;
  }
}

export class FhirNetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FhirNetworkError";
  }
}

export class FhirNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FhirNotFoundError";
  }
}

export type FhirGetOptions<T> = {
  searchParams?: Record<string, string | undefined>;
  schema?: z.ZodSchema<T>;
  /** For audit logging only — never sent to OpenEMR. */
  patientIdForAudit?: string;
};

function buildUrl(path: string, searchParams?: Record<string, string | undefined>): URL {
  const env = serverEnv();
  const base = `${env.OPENEMR_BASE_URL}/apis/${env.OPENEMR_SITE}/fhir`;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }
  return url;
}

function resourceFromPath(path: string): string {
  // "/Patient/abc" -> "Patient"; "/Condition" -> "Condition"
  const m = path.replace(/^\//, "").split("/")[0] ?? "";
  return m;
}

async function rawGet(url: URL, accessToken: string): Promise<Response> {
  return openemrFetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/fhir+json",
    },
  });
}

const RETRY_BACKOFF_MS = 200;

export async function fhirGet<T = unknown>(
  session: Session,
  path: string,
  options: FhirGetOptions<T> = {},
): Promise<T> {
  if (!session.accessToken) {
    throw new AuthExpiredError("No access token in session");
  }

  const url = buildUrl(path, options.searchParams);
  const resource = resourceFromPath(path);
  const start = Date.now();

  let response: Response;
  try {
    response = await rawGet(url, session.accessToken);
  } catch (err) {
    log.error({ err, resource, path }, "fhir.network_error");
    throw new FhirNetworkError(`FHIR ${resource} fetch failed`, { cause: err });
  }

  // 401: force a refresh, then retry exactly once.
  if (response.status === 401) {
    log.debug({ resource }, "fhir.401.refresh_attempt");
    try {
      await forceRefresh(session);
    } catch (err) {
      if (err instanceof RefreshFailedError) throw new AuthExpiredError();
      throw err;
    }
    try {
      response = await rawGet(url, session.accessToken);
    } catch (err) {
      throw new FhirNetworkError(`FHIR ${resource} retry failed`, { cause: err });
    }
    if (response.status === 401) {
      throw new AuthExpiredError("Refreshed token still rejected by FHIR server");
    }
  }

  // 5xx: one retry with backoff.
  if (response.status >= 500 && response.status < 600) {
    log.warn(
      { status: response.status, resource },
      "fhir.5xx.retry_after_backoff",
    );
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    try {
      response = await rawGet(url, session.accessToken);
    } catch (err) {
      throw new FhirNetworkError(`FHIR ${resource} retry failed`, { cause: err });
    }
    if (response.status >= 500 && response.status < 600) {
      throw new FhirServerError(
        response.status,
        `FHIR ${resource} returned ${response.status} after retry`,
      );
    }
  }

  const durationMs = Date.now() - start;
  audit({
    userId: session.userId,
    patientId: options.patientIdForAudit,
    resource,
    action: "GET",
    status: response.status,
    durationMs,
  });

  if (response.status === 404) {
    // Treat 404 as a real condition the caller decides how to handle.
    throw new FhirNotFoundError(`FHIR ${resource} not found`);
  }
  if (!response.ok) {
    throw new FhirServerError(
      response.status,
      `FHIR ${resource} returned ${response.status}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    log.error({ err, resource }, "fhir.json_parse_failed");
    throw new FhirServerError(
      response.status,
      `FHIR ${resource} returned non-JSON body`,
    );
  }

  if (options.schema) {
    const parsed = options.schema.safeParse(json);
    if (!parsed.success) {
      log.warn(
        {
          resource,
          issueCount: parsed.error.issues.length,
          firstIssue: parsed.error.issues[0],
        },
        "fhir.schema_validation_warning",
      );
      // Best-effort: return the raw payload so the UI can still render.
      return json as T;
    }
    return parsed.data;
  }
  return json as T;
}
