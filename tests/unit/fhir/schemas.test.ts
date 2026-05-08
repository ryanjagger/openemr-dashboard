// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AllergyIntoleranceSchema,
  BundleSchema,
  CareTeamSchema,
  ConditionSchema,
  EncounterSchema,
  MedicationRequestSchema,
  PatientSchema,
} from "@/lib/fhir/schemas";

// Real Patient resource captured from OpenEMR 8.1.1 dev instance on
// 2026-05-08 (id=a1b77856…, the patient with pubpid=66).
const REAL_PATIENT = {
  resourceType: "Patient",
  id: "a1b77856-fda0-4c4b-a5b8-6333a329585c",
  meta: {
    versionId: "1",
    lastUpdated: "2026-05-06T18:55:00+00:00",
    profile: [
      "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
    ],
  },
  identifier: [
    {
      use: "official",
      type: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0203",
            code: "PT",
          },
        ],
      },
      system: "http://terminology.hl7.org/CodeSystem/v2-0203",
      value: "66",
    },
  ],
  active: true,
  name: [{ use: "official", family: "Hoppe518", given: ["Dirk334"] }],
  gender: "male",
  birthDate: "1983-12-06",
  deceasedBoolean: false,
};

describe("schemas accept real OpenEMR 8.1.x payloads", () => {
  it("PatientSchema accepts the live Patient resource", () => {
    const result = PatientSchema.safeParse(REAL_PATIENT);
    expect(result.success).toBe(true);
  });

  it("BundleSchema accepts a Bundle wrapping the Patient", () => {
    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      total: 1,
      entry: [
        {
          fullUrl: "https://localhost:9300/apis/default/fhir/Patient/abc",
          resource: REAL_PATIENT,
        },
      ],
    };
    expect(BundleSchema.safeParse(bundle).success).toBe(true);
  });

  it("AllergyIntoleranceSchema accepts a minimal active allergy", () => {
    const allergy = {
      resourceType: "AllergyIntolerance",
      id: "al-1",
      clinicalStatus: {
        coding: [{ code: "active", display: "Active" }],
      },
      verificationStatus: { coding: [{ code: "confirmed" }] },
      type: "allergy",
      criticality: "high",
      code: { text: "Penicillin" },
      patient: { reference: "Patient/abc" },
      reaction: [
        {
          manifestation: [{ text: "Hives" }],
          severity: "moderate",
        },
      ],
    };
    expect(AllergyIntoleranceSchema.safeParse(allergy).success).toBe(true);
  });

  it("ConditionSchema accepts a problem-list-item Condition", () => {
    const condition = {
      resourceType: "Condition",
      id: "co-1",
      clinicalStatus: { coding: [{ code: "active" }] },
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/condition-category",
              code: "problem-list-item",
            },
          ],
        },
      ],
      code: { text: "Hypertension" },
      subject: { reference: "Patient/abc" },
      recordedDate: "2024-03-01",
    };
    expect(ConditionSchema.safeParse(condition).success).toBe(true);
  });

  it("MedicationRequestSchema accepts both intent=plan and intent=order", () => {
    for (const intent of ["plan", "order"]) {
      const mr = {
        resourceType: "MedicationRequest",
        id: `mr-${intent}`,
        status: "active",
        intent,
        medicationCodeableConcept: { text: "Lisinopril 10mg" },
        subject: { reference: "Patient/abc" },
        authoredOn: "2024-01-15",
        dosageInstruction: [{ text: "Take 1 tablet daily" }],
      };
      expect(MedicationRequestSchema.safeParse(mr).success).toBe(true);
    }
  });

  it("CareTeamSchema accepts a team with multiple participants", () => {
    const ct = {
      resourceType: "CareTeam",
      id: "ct-1",
      status: "active",
      subject: { reference: "Patient/abc" },
      participant: [
        {
          role: [{ text: "Primary Care Provider" }],
          member: { display: "Dr. Smith", reference: "Practitioner/p1" },
        },
        {
          role: [{ text: "Care Coordinator" }],
          member: { display: "Jane RN" },
        },
      ],
    };
    expect(CareTeamSchema.safeParse(ct).success).toBe(true);
  });

  it("EncounterSchema accepts an Encounter with class + period + participant", () => {
    const enc = {
      resourceType: "Encounter",
      id: "e-1",
      status: "finished",
      class: { code: "AMB", display: "ambulatory" },
      type: [{ text: "Office Visit" }],
      subject: { reference: "Patient/abc" },
      participant: [
        {
          individual: { display: "Dr. Smith", reference: "Practitioner/p1" },
        },
      ],
      period: { start: "2024-04-12T10:00:00Z", end: "2024-04-12T10:30:00Z" },
    };
    expect(EncounterSchema.safeParse(enc).success).toBe(true);
  });

  it("schemas tolerate unknown extra fields (passthrough)", () => {
    const polluted = {
      ...REAL_PATIENT,
      _vendorSpecificField: { foo: "bar", deep: { nested: 123 } },
    };
    expect(PatientSchema.safeParse(polluted).success).toBe(true);
  });

  it("schemas reject obviously wrong resourceType", () => {
    const wrong = { ...REAL_PATIENT, resourceType: "Encounter" };
    expect(PatientSchema.safeParse(wrong).success).toBe(false);
  });
});
