import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import {
  formatPatientName,
  bundleEntries,
  conditionCategoryCodes,
  extractMRN,
  extractPubPid,
  formatAge,
} from "@/lib/fhir/extract";
import {
  getAllergies,
  getCareTeam,
  getEncounters,
  getMedications,
  getPatient,
  getPrescriptions,
  getProblems,
} from "@/lib/fhir/queries";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase-2 smoke endpoint. Exercises every FHIR query against
 * TEST_PATIENT_ID and returns a small summary. Auth-gated by the
 * presence of a session token (no separate ACL — same trust boundary
 * as the dashboard itself). Will be removed once Phase 3's real
 * dashboard exists.
 */
export async function GET() {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const env = serverEnv();
  const patientId = env.TEST_PATIENT_ID;
  if (!patientId) {
    return NextResponse.json(
      { error: "TEST_PATIENT_ID not set in .env.local" },
      { status: 500 },
    );
  }

  const summary: Record<string, unknown> = { patientId };
  const errors: Record<string, string> = {};

  await Promise.all([
    (async () => {
      try {
        const p = await getPatient(session, patientId);
        summary.patient = {
          name: formatPatientName(p),
          gender: p.gender,
          birthDate: p.birthDate,
          age: formatAge(p.birthDate),
          mrn: extractMRN(p),
          pubpid: extractPubPid(p),
          active: p.active,
        };
      } catch (err) {
        errors.patient = String(err);
      }
    })(),
    (async () => {
      try {
        const b = await getAllergies(session, patientId);
        summary.allergies = { total: b.total, entries: b.entry?.length ?? 0 };
      } catch (err) {
        errors.allergies = String(err);
      }
    })(),
    (async () => {
      try {
        const probs = await getProblems(session, patientId);
        summary.problems = {
          total: probs.length,
          categories: Array.from(
            new Set(probs.flatMap(conditionCategoryCodes)),
          ),
        };
      } catch (err) {
        errors.problems = String(err);
      }
    })(),
    (async () => {
      try {
        const b = await getMedications(session, patientId);
        summary.medications = { total: b.total, entries: b.entry?.length ?? 0 };
      } catch (err) {
        errors.medications = String(err);
      }
    })(),
    (async () => {
      try {
        const b = await getPrescriptions(session, patientId);
        summary.prescriptions = {
          total: b.total,
          entries: b.entry?.length ?? 0,
        };
      } catch (err) {
        errors.prescriptions = String(err);
      }
    })(),
    (async () => {
      try {
        const b = await getCareTeam(session, patientId);
        const teams = bundleEntries<fhir4.CareTeam>(b, "CareTeam");
        summary.careTeam = {
          total: b.total,
          teams: teams.length,
          totalParticipants: teams.reduce(
            (n, t) => n + (t.participant?.length ?? 0),
            0,
          ),
        };
      } catch (err) {
        errors.careTeam = String(err);
      }
    })(),
    (async () => {
      try {
        const b = await getEncounters(session, patientId);
        const encs = bundleEntries<fhir4.Encounter>(b, "Encounter");
        summary.encounters = {
          total: b.total,
          entries: encs.length,
          latestPeriod: encs[0]?.period,
        };
      } catch (err) {
        errors.encounters = String(err);
      }
    })(),
  ]);

  log.info({ summary, errors }, "fhir.smoke.summary");

  return NextResponse.json({ summary, errors });
}
