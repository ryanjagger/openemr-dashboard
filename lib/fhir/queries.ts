import type { Session } from "@/lib/auth/session";
import { fhirGet } from "@/lib/fhir/client";
import { bundleEntries, conditionCategoryCodes } from "@/lib/fhir/extract";
import {
  AllergyIntoleranceSchema,
  BundleSchema,
  CareTeamSchema,
  ConditionSchema,
  EncounterSchema,
  MedicationRequestSchema,
  ObservationSchema,
  PatientSchema,
} from "@/lib/fhir/schemas";

export async function getPatient(
  session: Session,
  id: string,
): Promise<fhir4.Patient> {
  return fhirGet<fhir4.Patient>(session, `/Patient/${id}`, {
    schema: PatientSchema as never,
    patientIdForAudit: id,
  });
}

export async function getAllergies(
  session: Session,
  patientId: string,
): Promise<fhir4.Bundle> {
  return fhirGet<fhir4.Bundle>(session, "/AllergyIntolerance", {
    searchParams: { patient: patientId },
    schema: BundleSchema as never,
    patientIdForAudit: patientId,
  });
}

/**
 * OpenEMR 8.1.x doesn't list `category` as a Condition searchParam in
 * its CapabilityStatement, but the SMART scope grammar does include
 * `Condition.rs?category=...|problem-list-item`. Try the server-side
 * filter first; if the Bundle comes back with non-problem-list-item
 * entries (i.e. the param was ignored), filter client-side.
 */
export async function getProblems(
  session: Session,
  patientId: string,
): Promise<fhir4.Condition[]> {
  const bundle = await fhirGet<fhir4.Bundle>(session, "/Condition", {
    searchParams: {
      patient: patientId,
      category: "problem-list-item",
    },
    schema: BundleSchema as never,
    patientIdForAudit: patientId,
  });
  const all = bundleEntries<fhir4.Condition>(bundle, "Condition");
  // Client-side filter as a safety net regardless of whether the
  // server honored `category=`.
  return all.filter((c) =>
    conditionCategoryCodes(c).includes("problem-list-item"),
  );
}

/**
 * MedicationStatement isn't exposed by OpenEMR 8.1.x's FHIR server,
 * so the Medications card uses MedicationRequest filtered to active
 * plans (the patient's current med list, as opposed to the eRx orders
 * on the Prescriptions card which use intent=order).
 */
export async function getMedications(
  session: Session,
  patientId: string,
): Promise<fhir4.Bundle> {
  return fhirGet<fhir4.Bundle>(session, "/MedicationRequest", {
    searchParams: {
      patient: patientId,
      intent: "plan",
      status: "active",
    },
    schema: BundleSchema as never,
    patientIdForAudit: patientId,
  });
}

export async function getPrescriptions(
  session: Session,
  patientId: string,
): Promise<fhir4.Bundle> {
  return fhirGet<fhir4.Bundle>(session, "/MedicationRequest", {
    searchParams: {
      patient: patientId,
      intent: "order",
    },
    schema: BundleSchema as never,
    patientIdForAudit: patientId,
  });
}

export async function getCareTeam(
  session: Session,
  patientId: string,
): Promise<fhir4.Bundle> {
  return fhirGet<fhir4.Bundle>(session, "/CareTeam", {
    searchParams: { patient: patientId, status: "active" },
    schema: BundleSchema as never,
    patientIdForAudit: patientId,
  });
}

export async function getEncounters(
  session: Session,
  patientId: string,
  count = 20,
): Promise<fhir4.Bundle> {
  return fhirGet<fhir4.Bundle>(session, "/Encounter", {
    searchParams: {
      patient: patientId,
      _sort: "-date",
      _count: String(count),
    },
    schema: BundleSchema as never,
    patientIdForAudit: patientId,
  });
}

/**
 * OpenEMR's FhirObservationLaboratoryService exposes lab results as
 * Observation with category=laboratory (LOINC-coded). Sort newest first
 * by report date and cap at `count` so the dashboard card stays cheap.
 */
export async function getLabObservations(
  session: Session,
  patientId: string,
  count = 50,
): Promise<fhir4.Bundle> {
  return fhirGet<fhir4.Bundle>(session, "/Observation", {
    searchParams: {
      patient: patientId,
      category: "laboratory",
      _sort: "-date",
      _count: String(count),
    },
    schema: BundleSchema as never,
    patientIdForAudit: patientId,
  });
}

// Re-export schemas under their source-of-truth names so callers can
// pass them ad-hoc without import sprawl.
export {
  AllergyIntoleranceSchema,
  BundleSchema,
  CareTeamSchema,
  ConditionSchema,
  EncounterSchema,
  MedicationRequestSchema,
  ObservationSchema,
  PatientSchema,
};
