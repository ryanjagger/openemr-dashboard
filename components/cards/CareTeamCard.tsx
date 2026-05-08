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
import { getCareTeam } from "@/lib/fhir/queries";

const TITLE = "Care Team";
const TITLE_ID = "card-care-team-title";

const PRIMARY_HINTS = [
  "primary care provider",
  "primary",
  "pcp",
  "primary care physician",
];

type FlatParticipant = {
  key: string;
  name: string;
  role: string;
  isPrimary: boolean;
};

function flatten(teams: fhir4.CareTeam[]): FlatParticipant[] {
  const out: FlatParticipant[] = [];
  for (const team of teams) {
    for (const [i, p] of (team.participant ?? []).entries()) {
      const role = (p.role ?? [])
        .map(formatCodeableConcept)
        .filter(Boolean)
        .join(", ");
      const name =
        p.member?.display ??
        p.member?.reference ??
        "(unnamed)";
      const isPrimary = PRIMARY_HINTS.some((hint) =>
        role.toLowerCase().includes(hint),
      );
      out.push({
        key: `${team.id ?? "ct"}-${i}-${p.member?.reference ?? name}`,
        name,
        role,
        isPrimary,
      });
    }
  }
  return out;
}

export function CareTeamCardView({ careTeam }: { careTeam: fhir4.Bundle }) {
  const teams = bundleEntries<fhir4.CareTeam>(careTeam, "CareTeam");
  const participants = flatten(teams);
  const sorted = [...participants].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card aria-labelledby={TITLE_ID}>
      <CardHeader>
        <CardTitle id={TITLE_ID}>{TITLE}</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">No care team assigned</p>
        ) : (
          <ul className="space-y-3" role="list">
            {sorted.map((p) => (
              <li key={p.key} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.isPrimary && (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      Primary
                    </Badge>
                  )}
                </div>
                {p.role && (
                  <p className="text-muted-foreground mt-0.5">{p.role}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function CareTeamCard({ patientId }: { patientId: string }) {
  const session = await getSession();
  const bundle = await getCareTeam(session, patientId);
  return <CareTeamCardView careTeam={bundle} />;
}
