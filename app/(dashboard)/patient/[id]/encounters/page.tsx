import Link from "next/link";
import { EncountersList } from "@/components/EncountersList";
import { getSession } from "@/lib/auth/session";
import { bundleEntries } from "@/lib/fhir/extract";
import { getEncounters } from "@/lib/fhir/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EncountersPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const session = await getSession();
  const bundle = await getEncounters(session, id, 20);
  const encs = bundleEntries<fhir4.Encounter>(bundle, "Encounter");

  return (
    <section aria-labelledby="encounters-heading" className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1
          id="encounters-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Encounters
        </h1>
        <Link
          href={`/patient/${id}`}
          className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
        >
          ← Back to dashboard
        </Link>
      </div>
      <EncountersList encounters={encs} />
    </section>
  );
}
