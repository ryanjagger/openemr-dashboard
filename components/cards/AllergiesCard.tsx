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
import { getAllergies } from "@/lib/fhir/queries";

const TITLE = "Allergies";
const TITLE_ID = "card-allergies-title";

function statusCode(a: fhir4.AllergyIntolerance): string {
  return a.clinicalStatus?.coding?.[0]?.code ?? "unknown";
}

function severityVariant(severity: string | undefined) {
  if (severity === "severe") return "destructive";
  return "secondary";
}

export function AllergiesCardView({ allergies }: { allergies: fhir4.Bundle }) {
  const items = bundleEntries<fhir4.AllergyIntolerance>(
    allergies,
    "AllergyIntolerance",
  );

  // Active first, then alphabetical by substance.
  const sorted = [...items].sort((a, b) => {
    const sa = statusCode(a) === "active" ? 0 : 1;
    const sb = statusCode(b) === "active" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return formatCodeableConcept(a.code).localeCompare(
      formatCodeableConcept(b.code),
    );
  });

  return (
    <Card aria-labelledby={TITLE_ID}>
      <CardHeader>
        <CardTitle id={TITLE_ID}>{TITLE}</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">No known allergies</p>
        ) : (
          <ul className="space-y-3" role="list">
            {sorted.map((a) => {
              const reaction = a.reaction?.[0];
              const reactionText =
                reaction?.description ??
                reaction?.manifestation
                  ?.map(formatCodeableConcept)
                  .filter(Boolean)
                  .join(", ");
              const severity = reaction?.severity;
              const status = statusCode(a);
              return (
                <li key={a.id ?? formatCodeableConcept(a.code)} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">
                      {formatCodeableConcept(a.code) || "Unknown substance"}
                    </span>
                    {severity && (
                      <Badge variant={severityVariant(severity)}>
                        {severity}
                      </Badge>
                    )}
                    {status !== "active" && (
                      <Badge variant="outline" className="text-xs">
                        {status}
                      </Badge>
                    )}
                  </div>
                  {reactionText && (
                    <p className="text-muted-foreground mt-0.5">
                      Reaction: {reactionText}
                    </p>
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

export async function AllergiesCard({ patientId }: { patientId: string }) {
  const session = await getSession();
  const bundle = await getAllergies(session, patientId);
  return <AllergiesCardView allergies={bundle} />;
}
