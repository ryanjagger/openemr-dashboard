import { cache } from "react";
import type { Session } from "@/lib/auth/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PatientIdLookupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PatientIdLookupError";
  }
}

/**
 * The dashboard's patient routes are keyed off the FHIR Patient.id (uuid).
 * The PHP bridge link in OpenEMR's left-nav resolves the internal pid to
 * a uuid before constructing the link (see openemr-patches/), so by the
 * time the URL hits Next.js it should already be a uuid. Reject anything
 * else rather than silently 404'ing later in the FHIR fetch.
 *
 * Wrapped in React.cache so layout/page/cards in the same request share
 * one validation pass.
 */
export const resolvePatientId = cache(
  // Session is unused now but kept in the signature so callers don't
  // have to change shape if a future lookup path needs auth again.
  async (_session: Session, idFromUrl: string): Promise<string> => {
    if (UUID_RE.test(idFromUrl)) return idFromUrl;
    throw new PatientIdLookupError(
      `Invalid patient id: ${idFromUrl} — expected a FHIR Patient.id (uuid).`,
    );
  },
);
