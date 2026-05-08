import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function PatientDashboardPlaceholder({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const session = await getSession();
  const expiresAtIso = session.expiresAt
    ? new Date(session.expiresAt * 1000).toISOString()
    : "—";

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8 font-sans">
      <header>
        <h1 className="text-2xl font-semibold">Patient dashboard (placeholder)</h1>
        <p className="text-muted-foreground text-sm">
          Phase 1 acceptance shim — replaced in Phase 3 by the real header + cards.
        </p>
      </header>

      <section className="rounded-lg border p-6">
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="font-medium">Route param :id</dt>
          <dd className="font-mono">{id}</dd>

          <dt className="font-medium">Logged in as</dt>
          <dd className="font-mono break-all">
            {session.fhirUser ?? session.userId ?? "(unknown)"}
          </dd>

          <dt className="font-medium">User id (sub)</dt>
          <dd className="font-mono">{session.userId ?? "—"}</dd>

          <dt className="font-medium">Access token expires</dt>
          <dd className="font-mono">{expiresAtIso}</dd>

          <dt className="font-medium">Has refresh token</dt>
          <dd className="font-mono">{session.refreshToken ? "yes" : "no"}</dd>
        </dl>
      </section>

      <p className="text-muted-foreground text-sm">
        <a className="underline" href="/logout">
          Sign out
        </a>
        {" — destroys the Next.js session and ends the OpenEMR SSO session."}
      </p>
    </main>
  );
}
