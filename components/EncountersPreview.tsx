import Link from "next/link";
import { EncountersList } from "@/components/EncountersList";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { bundleEntries } from "@/lib/fhir/extract";
import { getEncounters } from "@/lib/fhir/queries";

const TITLE_ID = "card-encounters-title";
const PREVIEW_LIMIT = 3;

export function EncountersPreviewView({
  encounters,
  patientId,
}: {
  encounters: fhir4.Encounter[];
  patientId: string;
}) {
  return (
    <Card aria-labelledby={TITLE_ID}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle id={TITLE_ID}>Recent Encounters</CardTitle>
          {encounters.length > 0 && (
            <Link
              href={`/patient/${patientId}/encounters`}
              className="text-sm underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              View all
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <EncountersList encounters={encounters} limit={PREVIEW_LIMIT} />
      </CardContent>
    </Card>
  );
}

export async function EncountersPreview({
  patientId,
}: {
  patientId: string;
}) {
  const session = await getSession();
  const bundle = await getEncounters(session, patientId, 20);
  const encs = bundleEntries<fhir4.Encounter>(bundle, "Encounter");
  return <EncountersPreviewView encounters={encs} patientId={patientId} />;
}
