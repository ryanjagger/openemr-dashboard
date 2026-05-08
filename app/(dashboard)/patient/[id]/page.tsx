import { AllergiesCard } from "@/components/cards/AllergiesCard";
import { CardShell } from "@/components/cards/CardShell";
import { CareTeamCard } from "@/components/cards/CareTeamCard";
import { MedicationsCard } from "@/components/cards/MedicationsCard";
import { PrescriptionsCard } from "@/components/cards/PrescriptionsCard";
import { ProblemsCard } from "@/components/cards/ProblemsCard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export default async function PatientDashboardPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  return (
    <div
      className="grid gap-4 md:grid-cols-2"
      aria-label="Clinical cards"
    >
      <CardShell title="Allergies">
        <AllergiesCard patientId={id} />
      </CardShell>

      <CardShell title="Problem List">
        <ProblemsCard patientId={id} />
      </CardShell>

      <CardShell title="Medications">
        <MedicationsCard patientId={id} />
      </CardShell>

      <CardShell title="Prescriptions">
        <PrescriptionsCard patientId={id} />
      </CardShell>

      <CardShell title="Care Team">
        <CareTeamCard patientId={id} />
      </CardShell>

      <Card aria-labelledby="card-encounters-title">
        <CardHeader>
          <CardTitle id="card-encounters-title">Recent Encounters</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Lands in Phase 5.</p>
        </CardContent>
      </Card>
    </div>
  );
}
