import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";

/**
 * Phase 3 placeholder body — the patient header is rendered by the
 * surrounding layout. The five clinical cards land in Phase 4 and
 * the encounters preview in Phase 5; this skeleton just keeps the
 * grid in place so the layout is visually settled.
 */
export default function PatientDashboardPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="Clinical cards">
      {[
        { id: "allergies", title: "Allergies" },
        { id: "problems", title: "Problem List" },
        { id: "medications", title: "Medications" },
        { id: "prescriptions", title: "Prescriptions" },
        { id: "care-team", title: "Care Team" },
        { id: "encounters", title: "Recent Encounters" },
      ].map((card) => (
        <Card key={card.id} aria-labelledby={`card-${card.id}-title`}>
          <CardHeader>
            <CardTitle id={`card-${card.id}-title`}>{card.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Lands in Phase 4 / Phase 5.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
