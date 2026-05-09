import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  extractMRN,
  extractPubPid,
  formatAge,
  formatPatientName,
} from "@/lib/fhir/extract";

const HEADING_ID = "patient-header-name";

function genderLabel(gender: string | undefined): string {
  if (!gender) return "—";
  // Title-case the FHIR administrative-gender codes for display.
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

function FieldRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd className="font-medium text-foreground" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function PatientHeader({
  patient,
}: {
  patient: fhir4.Patient;
}) {
  const name = formatPatientName(patient);
  const mrn = extractMRN(patient);
  const pubpid = extractPubPid(patient);
  const idLabel = mrn ? "MRN" : "External ID";
  const idValue = mrn ?? pubpid ?? "—";
  const age = formatAge(patient.birthDate);
  const isActive = patient.active !== false; // default true if missing

  return (
    <header
      role="banner"
      aria-labelledby={HEADING_ID}
      className="border-b bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1
              id={HEADING_ID}
              className="text-2xl font-semibold tracking-tight"
              data-testid="patient-name"
            >
              {name}
            </h1>
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={
                isActive
                  ? "bg-emerald-600 text-white hover:bg-emerald-600"
                  : "bg-muted text-muted-foreground"
              }
              aria-label={`Patient status: ${isActive ? "Active" : "Inactive"}`}
              data-testid="patient-status"
            >
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        <Separator className="my-3" />

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <FieldRow
            label="DOB"
            value={
              patient.birthDate ? (
                <>
                  {patient.birthDate}
                  {age !== null && (
                    <span className="text-muted-foreground ml-1">
                      ({age}y)
                    </span>
                  )}
                </>
              ) : (
                "—"
              )
            }
            testId="patient-dob"
          />
          <FieldRow
            label="Sex"
            value={genderLabel(patient.gender)}
            testId="patient-sex"
          />
          <FieldRow
            label={idLabel}
            value={idValue}
            testId="patient-id"
          />
          <FieldRow
            label="FHIR id"
            value={
              <span className="font-mono text-xs">{patient.id ?? "—"}</span>
            }
            testId="patient-fhir-id"
          />
        </dl>
      </div>
    </header>
  );
}
