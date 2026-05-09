import { notFound } from "next/navigation";
import { PatientHeader } from "@/components/PatientHeader";
import { getSession } from "@/lib/auth/session";
import {
  AuthExpiredError,
  FhirNotFoundError,
} from "@/lib/fhir/client";
import { getPatient } from "@/lib/fhir/queries";
import {
  PatientIdLookupError,
  resolvePatientId,
} from "@/lib/openemr/resolvePatientId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EmbeddedPatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session.accessToken) throw new AuthExpiredError();

  let uuid: string;
  try {
    uuid = await resolvePatientId(session, id);
  } catch (err) {
    if (err instanceof PatientIdLookupError) notFound();
    throw err;
  }

  let patient: fhir4.Patient;
  try {
    patient = await getPatient(session, uuid);
  } catch (err) {
    if (err instanceof FhirNotFoundError) notFound();
    throw err;
  }

  return (
    <div className="min-h-screen bg-background">
      <PatientHeader patient={patient} />
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
