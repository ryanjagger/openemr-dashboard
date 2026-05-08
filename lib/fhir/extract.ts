/**
 * Pure FHIR R4 extraction helpers. No I/O. Forgiving — every helper
 * tolerates missing/partial data and returns a sensible string fallback
 * rather than throwing, because real EHR data is messy.
 */

export function formatHumanName(name: fhir4.HumanName | undefined): string {
  if (!name) return "";
  if (name.text) return name.text;
  const given = (name.given ?? []).join(" ").trim();
  const family = name.family ?? "";
  if (family && given) return `${family}, ${given}`;
  return family || given || "";
}

export function formatPatientName(patient: fhir4.Patient | undefined): string {
  if (!patient?.name?.length) return "(no name on file)";
  const official = patient.name.find((n) => n.use === "official");
  return formatHumanName(official ?? patient.name[0]);
}

export function formatCodeableConcept(
  cc: fhir4.CodeableConcept | undefined,
): string {
  if (!cc) return "";
  if (cc.text) return cc.text;
  const first = cc.coding?.[0];
  if (!first) return "";
  return first.display ?? first.code ?? "";
}

export function formatPeriod(period: fhir4.Period | undefined): string {
  if (!period) return "";
  const start = period.start?.slice(0, 10) ?? "";
  const end = period.end?.slice(0, 10) ?? "present";
  if (!start && end === "present") return "";
  return `${start} → ${end}`;
}

/**
 * Pull the MRN from `Patient.identifier`. Prefers identifier with
 * type.coding[].code === 'MR' (HL7 v2-0203). Returns null if none.
 */
export function extractMRN(patient: fhir4.Patient | undefined): string | null {
  if (!patient?.identifier?.length) return null;
  const mr = patient.identifier.find((id) =>
    id.type?.coding?.some((c) => c.code === "MR"),
  );
  return mr?.value ?? null;
}

/**
 * Pull the public/external patient identifier (OpenEMR pubpid maps to
 * type.coding[].code === 'PT' on Patient.identifier in 8.1.x).
 */
export function extractPubPid(
  patient: fhir4.Patient | undefined,
): string | null {
  if (!patient?.identifier?.length) return null;
  const pt = patient.identifier.find((id) =>
    id.type?.coding?.some((c) => c.code === "PT"),
  );
  return pt?.value ?? null;
}

/**
 * Years between birthDate and today. Returns null if birthDate missing
 * or unparseable. Naive on leap-day birthdays — close enough for a
 * dashboard header.
 */
export function formatAge(birthDate: string | undefined): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * Filter a Bundle's entries to a single resource type and return them
 * as a typed array. Tolerates missing entries.
 */
export function bundleEntries<T extends fhir4.FhirResource>(
  bundle: fhir4.Bundle | undefined,
  resourceType: T["resourceType"],
): T[] {
  if (!bundle?.entry?.length) return [];
  const out: T[] = [];
  for (const entry of bundle.entry) {
    const r = entry.resource;
    if (r && (r as { resourceType: string }).resourceType === resourceType) {
      out.push(r as T);
    }
  }
  return out;
}

/**
 * Extract the FHIR Condition's category code. Used to filter
 * problem-list-item Conditions client-side because OpenEMR 8.1.x
 * doesn't expose `category` as a server-side searchParam.
 */
export function conditionCategoryCodes(
  condition: fhir4.Condition,
): string[] {
  return (condition.category ?? [])
    .flatMap((c) => c.coding ?? [])
    .map((c) => c.code)
    .filter((c): c is string => typeof c === "string");
}
