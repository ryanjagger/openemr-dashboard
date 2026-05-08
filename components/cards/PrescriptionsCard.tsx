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
import { getPrescriptions } from "@/lib/fhir/queries";

const TITLE = "Prescriptions";
const TITLE_ID = "card-prescriptions-title";

function statusVariant(status: string | undefined) {
  if (status === "active") return "default";
  if (status === "completed") return "secondary";
  if (status === "stopped" || status === "cancelled") return "destructive";
  return "outline";
}

function medicationName(mr: fhir4.MedicationRequest): string {
  return (
    formatCodeableConcept(mr.medicationCodeableConcept) ||
    mr.medicationReference?.display ||
    "Unknown medication"
  );
}

function doseInstruction(mr: fhir4.MedicationRequest): string {
  return mr.dosageInstruction?.[0]?.text ?? "";
}

export function PrescriptionsCardView({
  prescriptions,
}: {
  prescriptions: fhir4.Bundle;
}) {
  const items = bundleEntries<fhir4.MedicationRequest>(
    prescriptions,
    "MedicationRequest",
  );

  const sorted = [...items].sort((a, b) => {
    const ad = a.authoredOn ?? "";
    const bd = b.authoredOn ?? "";
    if (ad === bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return bd.localeCompare(ad);
  });

  return (
    <Card aria-labelledby={TITLE_ID}>
      <CardHeader>
        <CardTitle id={TITLE_ID}>{TITLE}</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No prescriptions on file
          </p>
        ) : (
          <ul className="space-y-3" role="list">
            {sorted.map((mr) => {
              const name = medicationName(mr);
              const dose = doseInstruction(mr);
              const authored = mr.authoredOn?.slice(0, 10);
              return (
                <li key={mr.id ?? name} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{name}</span>
                    {mr.status && (
                      <Badge variant={statusVariant(mr.status)}>
                        {mr.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5">
                    {dose ? `${dose} · ` : ""}
                    {authored ? `Ordered ${authored}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function PrescriptionsCard({ patientId }: { patientId: string }) {
  const session = await getSession();
  const bundle = await getPrescriptions(session, patientId);
  return <PrescriptionsCardView prescriptions={bundle} />;
}
