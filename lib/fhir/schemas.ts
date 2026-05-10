/**
 * Zod boundary schemas for the FHIR R4 resources we consume. Real EHR
 * data is messy: every nested object is `.passthrough()` so unknown
 * fields don't trip us up, and almost everything is optional. We only
 * encode the *shape* we depend on for rendering.
 *
 * Validation failure inside fhirGet is a logged warning, never a
 * thrown error — see lib/fhir/client.ts.
 */
import { z } from "zod";

const Coding = z
  .object({
    system: z.string().optional(),
    code: z.string().optional(),
    display: z.string().optional(),
  })
  .passthrough();

const CodeableConcept = z
  .object({
    coding: z.array(Coding).optional(),
    text: z.string().optional(),
  })
  .passthrough();

const Period = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
  })
  .passthrough();

const Reference = z
  .object({
    reference: z.string().optional(),
    display: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

const Identifier = z
  .object({
    use: z.string().optional(),
    type: CodeableConcept.optional(),
    system: z.string().optional(),
    value: z.string().optional(),
  })
  .passthrough();

const HumanName = z
  .object({
    use: z.string().optional(),
    text: z.string().optional(),
    family: z.string().optional(),
    given: z.array(z.string()).optional(),
  })
  .passthrough();

const Annotation = z
  .object({
    text: z.string().optional(),
    time: z.string().optional(),
  })
  .passthrough();

const Quantity = z
  .object({
    value: z.number().optional(),
    unit: z.string().optional(),
    code: z.string().optional(),
    system: z.string().optional(),
  })
  .passthrough();

const Dosage = z
  .object({
    text: z.string().optional(),
    route: CodeableConcept.optional(),
    timing: z.unknown().optional(),
    doseAndRate: z
      .array(
        z
          .object({
            doseQuantity: Quantity.optional(),
            doseRange: z.unknown().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const PatientSchema = z
  .object({
    resourceType: z.literal("Patient"),
    id: z.string().optional(),
    identifier: z.array(Identifier).optional(),
    active: z.boolean().optional(),
    name: z.array(HumanName).optional(),
    gender: z.string().optional(),
    birthDate: z.string().optional(),
  })
  .passthrough();

export const AllergyIntoleranceSchema = z
  .object({
    resourceType: z.literal("AllergyIntolerance"),
    id: z.string().optional(),
    clinicalStatus: CodeableConcept.optional(),
    verificationStatus: CodeableConcept.optional(),
    type: z.string().optional(),
    category: z.array(z.string()).optional(),
    criticality: z.string().optional(),
    code: CodeableConcept.optional(),
    patient: Reference.optional(),
    onsetDateTime: z.string().optional(),
    recordedDate: z.string().optional(),
    note: z.array(Annotation).optional(),
    reaction: z
      .array(
        z
          .object({
            manifestation: z.array(CodeableConcept).optional(),
            severity: z.string().optional(),
            description: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const ConditionSchema = z
  .object({
    resourceType: z.literal("Condition"),
    id: z.string().optional(),
    clinicalStatus: CodeableConcept.optional(),
    verificationStatus: CodeableConcept.optional(),
    category: z.array(CodeableConcept).optional(),
    severity: CodeableConcept.optional(),
    code: CodeableConcept.optional(),
    subject: Reference.optional(),
    onsetDateTime: z.string().optional(),
    onsetPeriod: Period.optional(),
    recordedDate: z.string().optional(),
    note: z.array(Annotation).optional(),
  })
  .passthrough();

export const MedicationRequestSchema = z
  .object({
    resourceType: z.literal("MedicationRequest"),
    id: z.string().optional(),
    status: z.string().optional(),
    intent: z.string().optional(),
    medicationCodeableConcept: CodeableConcept.optional(),
    medicationReference: Reference.optional(),
    subject: Reference.optional(),
    authoredOn: z.string().optional(),
    requester: Reference.optional(),
    dosageInstruction: z.array(Dosage).optional(),
    note: z.array(Annotation).optional(),
  })
  .passthrough();

export const CareTeamSchema = z
  .object({
    resourceType: z.literal("CareTeam"),
    id: z.string().optional(),
    status: z.string().optional(),
    category: z.array(CodeableConcept).optional(),
    name: z.string().optional(),
    subject: Reference.optional(),
    participant: z
      .array(
        z
          .object({
            role: z.array(CodeableConcept).optional(),
            member: Reference.optional(),
            onBehalfOf: Reference.optional(),
            period: Period.optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const EncounterSchema = z
  .object({
    resourceType: z.literal("Encounter"),
    id: z.string().optional(),
    status: z.string().optional(),
    class: Coding.optional(),
    type: z.array(CodeableConcept).optional(),
    serviceType: CodeableConcept.optional(),
    subject: Reference.optional(),
    participant: z
      .array(
        z
          .object({
            type: z.array(CodeableConcept).optional(),
            individual: Reference.optional(),
            period: Period.optional(),
          })
          .passthrough(),
      )
      .optional(),
    period: Period.optional(),
    location: z
      .array(
        z
          .object({ location: Reference.optional() }).passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const ObservationSchema = z
  .object({
    resourceType: z.literal("Observation"),
    id: z.string().optional(),
    status: z.string().optional(),
    category: z.array(CodeableConcept).optional(),
    code: CodeableConcept.optional(),
    subject: Reference.optional(),
    effectiveDateTime: z.string().optional(),
    effectivePeriod: Period.optional(),
    issued: z.string().optional(),
    valueQuantity: Quantity.optional(),
    valueCodeableConcept: CodeableConcept.optional(),
    valueString: z.string().optional(),
    interpretation: z.array(CodeableConcept).optional(),
    referenceRange: z
      .array(
        z
          .object({
            low: Quantity.optional(),
            high: Quantity.optional(),
            text: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    note: z.array(Annotation).optional(),
  })
  .passthrough();

export const BundleSchema = z
  .object({
    resourceType: z.literal("Bundle"),
    type: z.string().optional(),
    total: z.number().optional(),
    link: z.array(z.unknown()).optional(),
    entry: z
      .array(
        z
          .object({
            fullUrl: z.string().optional(),
            resource: z.unknown().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const ResourceSchemas = {
  Patient: PatientSchema,
  AllergyIntolerance: AllergyIntoleranceSchema,
  Condition: ConditionSchema,
  MedicationRequest: MedicationRequestSchema,
  CareTeam: CareTeamSchema,
  Encounter: EncounterSchema,
  Observation: ObservationSchema,
  Bundle: BundleSchema,
} as const;

export type ResourceSchemaName = keyof typeof ResourceSchemas;
