import { cache } from "react";
import type { Session } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { openemrFetch } from "@/lib/http";
import { log } from "@/lib/log";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PID_RE = /^\d+$/;

export class PatientIdLookupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PatientIdLookupError";
  }
}

type StandardApiPatientList = {
  data?: Array<{ uuid?: string }>;
};

/**
 * The patient left-nav bridge sends OpenEMR's internal pid; FHIR keys
 * off Patient.id (uuid). This resolves pid → uuid via the Standard API
 * (GET /apis/<site>/api/patient?pid=<pid>) and returns UUIDs unchanged
 * so internal navigation that already carries a uuid still works.
 *
 * Cached with React.cache so layout/page/cards in the same request
 * share one lookup.
 */
export const resolvePatientId = cache(
  async (session: Session, idFromUrl: string): Promise<string> => {
    if (UUID_RE.test(idFromUrl)) return idFromUrl;
    if (!PID_RE.test(idFromUrl)) {
      throw new PatientIdLookupError(`Invalid patient id: ${idFromUrl}`);
    }
    if (!session.accessToken) {
      throw new PatientIdLookupError("No access token in session");
    }

    const env = serverEnv();
    const url = new URL(
      `${env.OPENEMR_BASE_URL}/apis/${env.OPENEMR_SITE}/api/patient`,
    );
    url.searchParams.set("pid", idFromUrl);

    let resp: Response;
    try {
      resp = await openemrFetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (err) {
      log.error({ err, pid: idFromUrl }, "openemr.pid_lookup.network_error");
      throw new PatientIdLookupError("pid lookup network error", {
        cause: err,
      });
    }

    if (!resp.ok) {
      log.warn(
        { status: resp.status, pid: idFromUrl },
        "openemr.pid_lookup.non_2xx",
      );
      throw new PatientIdLookupError(
        `pid lookup returned ${resp.status}`,
      );
    }

    let body: StandardApiPatientList;
    try {
      body = (await resp.json()) as StandardApiPatientList;
    } catch (err) {
      throw new PatientIdLookupError(
        "pid lookup returned non-JSON body",
        { cause: err },
      );
    }

    const uuid = Array.isArray(body.data) ? body.data[0]?.uuid : undefined;
    if (!uuid) {
      throw new PatientIdLookupError(`No patient with pid=${idFromUrl}`);
    }
    return uuid;
  },
);
