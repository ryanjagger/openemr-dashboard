import { AllergiesCard } from "@/components/cards/AllergiesCard";
import { CardShell } from "@/components/cards/CardShell";
import { CareTeamCard } from "@/components/cards/CareTeamCard";
import { LabsCard } from "@/components/cards/LabsCard";
import { MedicationsCard } from "@/components/cards/MedicationsCard";
import { PrescriptionsCard } from "@/components/cards/PrescriptionsCard";
import { ProblemsCard } from "@/components/cards/ProblemsCard";
import { EncountersPreview } from "@/components/EncountersPreview";
import { getSession } from "@/lib/auth/session";
import { resolvePatientId } from "@/lib/openemr/resolvePatientId";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export default async function PatientDashboardPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const session = await getSession();
  const uuid = await resolvePatientId(session, id);
  return (
    <div
      className="grid gap-4 md:grid-cols-2"
      aria-label="Clinical cards"
    >
      <CardShell title="Allergies">
        <AllergiesCard patientId={uuid} />
      </CardShell>

      <CardShell title="Problem List">
        <ProblemsCard patientId={uuid} />
      </CardShell>

      <CardShell title="Medications">
        <MedicationsCard patientId={uuid} />
      </CardShell>

      <CardShell title="Prescriptions">
        <PrescriptionsCard patientId={uuid} />
      </CardShell>

      <CardShell title="Care Team">
        <CareTeamCard patientId={uuid} />
      </CardShell>

      <CardShell title="Labs">
        <LabsCard patientId={uuid} />
      </CardShell>

      <CardShell title="Recent Encounters">
        <EncountersPreview patientId={uuid} />
      </CardShell>
    </div>
  );
}
