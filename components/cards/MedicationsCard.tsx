import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import {
  bundleEntries,
  formatCodeableConcept,
} from "@/lib/fhir/extract";
import { getMedications } from "@/lib/fhir/queries";

const TITLE = "Medications";
const TITLE_ID = "card-medications-title";

function dosageSummary(mr: fhir4.MedicationRequest): string {
  const d = mr.dosageInstruction?.[0];
  if (!d) return "";
  if (d.text) return d.text;
  const dose = d.doseAndRate?.[0]?.doseQuantity;
  const doseText = dose
    ? `${dose.value ?? ""}${dose.unit ? ` ${dose.unit}` : ""}`.trim()
    : "";
  const route = formatCodeableConcept(d.route);
  return [doseText, route].filter(Boolean).join(" · ");
}

function medicationName(mr: fhir4.MedicationRequest): string {
  return (
    formatCodeableConcept(mr.medicationCodeableConcept) ||
    mr.medicationReference?.display ||
    "Unknown medication"
  );
}

export function MedicationsCardView({
  medications,
}: {
  medications: fhir4.Bundle;
}) {
  const items = bundleEntries<fhir4.MedicationRequest>(
    medications,
    "MedicationRequest",
  );

  // Status active first, then by name
  const sorted = [...items].sort((a, b) => {
    const sa = a.status === "active" ? 0 : 1;
    const sb = b.status === "active" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return medicationName(a).localeCompare(medicationName(b));
  });

  return (
    <Card aria-labelledby={TITLE_ID}>
      <CardHeader>
        <CardTitle id={TITLE_ID}>{TITLE}</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active medications</p>
        ) : (
          <ul className="space-y-3" role="list">
            {sorted.map((mr) => {
              const name = medicationName(mr);
              const dose = dosageSummary(mr);
              return (
                <li key={mr.id ?? name} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{name}</span>
                    {mr.status && mr.status !== "active" && (
                      <Badge variant="outline" className="text-xs">
                        {mr.status}
                      </Badge>
                    )}
                  </div>
                  {dose && (
                    <p className="text-muted-foreground mt-0.5">{dose}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function MedicationsCard({ patientId }: { patientId: string }) {
  const session = await getSession();
  const bundle = await getMedications(session, patientId);
  return <MedicationsCardView medications={bundle} />;
}
