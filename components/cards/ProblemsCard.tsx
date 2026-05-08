import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { formatCodeableConcept } from "@/lib/fhir/extract";
import { getProblems } from "@/lib/fhir/queries";

const TITLE = "Problem List";
const TITLE_ID = "card-problems-title";

const ICD_SYSTEMS = [
  "http://hl7.org/fhir/sid/icd-10-cm",
  "http://hl7.org/fhir/sid/icd-10",
  "http://hl7.org/fhir/sid/icd-9-cm",
  "http://hl7.org/fhir/sid/icd-9",
];

function icdCode(c: fhir4.Condition): string | null {
  const coding = c.code?.coding ?? [];
  const icd = coding.find((cd) =>
    cd.system && ICD_SYSTEMS.some((s) => cd.system?.startsWith(s)),
  );
  return icd?.code ?? null;
}

function statusCode(c: fhir4.Condition): string {
  return c.clinicalStatus?.coding?.[0]?.code ?? "unknown";
}

function onsetDate(c: fhir4.Condition): string | null {
  return (
    c.onsetDateTime?.slice(0, 10) ??
    c.onsetPeriod?.start?.slice(0, 10) ??
    null
  );
}

export function ProblemsCardView({
  problems,
}: {
  problems: fhir4.Condition[];
}) {
  const sorted = [...problems].sort((a, b) => {
    // recordedDate desc, missing dates last
    const ad = a.recordedDate ?? "";
    const bd = b.recordedDate ?? "";
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
          <p className="text-muted-foreground text-sm">No active problems</p>
        ) : (
          <ul className="space-y-3" role="list">
            {sorted.map((c) => {
              const desc = formatCodeableConcept(c.code) || "Unknown condition";
              const icd = icdCode(c);
              const onset = onsetDate(c);
              const status = statusCode(c);
              return (
                <li key={c.id ?? desc} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{desc}</span>
                    {icd && (
                      <span className="text-muted-foreground font-mono text-xs">
                        {icd}
                      </span>
                    )}
                    {status !== "active" && (
                      <Badge variant="outline" className="text-xs">
                        {status}
                      </Badge>
                    )}
                  </div>
                  {onset && (
                    <p className="text-muted-foreground mt-0.5">
                      Onset {onset}
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

export async function ProblemsCard({ patientId }: { patientId: string }) {
  const session = await getSession();
  const problems = await getProblems(session, patientId);
  return <ProblemsCardView problems={problems} />;
}
