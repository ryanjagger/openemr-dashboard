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
  formatObservationValue,
  observationDate,
  observationInterpretationCode,
} from "@/lib/fhir/extract";
import { getLabObservations } from "@/lib/fhir/queries";

const TITLE = "Labs";
const TITLE_ID = "card-labs-title";
const DISPLAY_LIMIT = 10;

const ABNORMAL_CODES = new Set(["H", "HH", "L", "LL", "A", "AA"]);
const CRITICAL_CODES = new Set(["HH", "LL", "AA"]);

function interpretationVariant(code: string | null) {
  if (!code) return null;
  if (CRITICAL_CODES.has(code)) return "destructive" as const;
  if (ABNORMAL_CODES.has(code)) return "secondary" as const;
  return null;
}

export function LabsCardView({ labs }: { labs: fhir4.Bundle }) {
  const items = bundleEntries<fhir4.Observation>(labs, "Observation");

  // Newest first — server already sorts but be defensive against partial bundles.
  const sorted = [...items].sort((a, b) => {
    const da = observationDate(a);
    const db = observationDate(b);
    if (da === db) return 0;
    return da < db ? 1 : -1;
  });
  const visible = sorted.slice(0, DISPLAY_LIMIT);
  const hidden = sorted.length - visible.length;

  return (
    <Card aria-labelledby={TITLE_ID}>
      <CardHeader>
        <CardTitle id={TITLE_ID}>{TITLE}</CardTitle>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No lab results on file
          </p>
        ) : (
          <ul className="space-y-2" role="list">
            {visible.map((obs) => {
              const name =
                formatCodeableConcept(obs.code) || "Unknown test";
              const value = formatObservationValue(obs);
              const date = observationDate(obs);
              const interp = observationInterpretationCode(obs);
              const variant = interpretationVariant(interp);
              return (
                <li
                  key={obs.id ?? `${name}-${date}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {value || "—"}
                  </span>
                  {variant && interp && (
                    <Badge variant={variant} className="text-xs">
                      {interp}
                    </Badge>
                  )}
                  <span className="text-muted-foreground tabular-nums text-xs">
                    {date || "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 && (
          <p className="text-muted-foreground mt-3 text-xs">
            +{hidden} older result{hidden === 1 ? "" : "s"} not shown
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export async function LabsCard({ patientId }: { patientId: string }) {
  const session = await getSession();
  const bundle = await getLabObservations(session, patientId);
  return <LabsCardView labs={bundle} />;
}
