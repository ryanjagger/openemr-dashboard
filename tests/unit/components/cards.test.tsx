import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AllergiesCardView } from "@/components/cards/AllergiesCard";
import { CardErrorBoundary } from "@/components/cards/CardErrorBoundary";
import { CareTeamCardView } from "@/components/cards/CareTeamCard";
import { MedicationsCardView } from "@/components/cards/MedicationsCard";
import { PrescriptionsCardView } from "@/components/cards/PrescriptionsCard";
import { ProblemsCardView } from "@/components/cards/ProblemsCard";

const emptyBundle: fhir4.Bundle = { resourceType: "Bundle", type: "searchset" };
function bundle(...resources: fhir4.FhirResource[]): fhir4.Bundle {
  return {
    resourceType: "Bundle",
    type: "searchset",
    entry: resources.map((r) => ({ resource: r })),
  };
}

// ─────────────────────────────────────────────── Allergies

describe("AllergiesCardView", () => {
  it("empty → 'No known allergies'", () => {
    render(<AllergiesCardView allergies={emptyBundle} />);
    expect(screen.getByText("No known allergies")).toBeInTheDocument();
  });

  it("single item renders substance + reaction + severity", () => {
    const a: fhir4.AllergyIntolerance = {
      resourceType: "AllergyIntolerance",
      id: "a1",
      patient: { reference: "Patient/p" },
      clinicalStatus: { coding: [{ code: "active" }] },
      code: { text: "Penicillin" },
      reaction: [
        {
          manifestation: [{ text: "Hives" }],
          severity: "moderate",
        },
      ],
    };
    render(<AllergiesCardView allergies={bundle(a)} />);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Penicillin");
    expect(items[0]).toHaveTextContent("moderate");
    expect(items[0]).toHaveTextContent("Hives");
  });

  it("sorts active before resolved", () => {
    const active: fhir4.AllergyIntolerance = {
      resourceType: "AllergyIntolerance",
      id: "active",
      patient: { reference: "Patient/p" },
      clinicalStatus: { coding: [{ code: "active" }] },
      code: { text: "Z-Active-Latex" },
    };
    const resolved: fhir4.AllergyIntolerance = {
      resourceType: "AllergyIntolerance",
      id: "resolved",
      patient: { reference: "Patient/p" },
      clinicalStatus: { coding: [{ code: "resolved" }] },
      code: { text: "A-Resolved-Peanuts" },
    };
    render(<AllergiesCardView allergies={bundle(resolved, active)} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Z-Active-Latex");
    expect(items[1]).toHaveTextContent("A-Resolved-Peanuts");
  });

  it("malformed item (no code) renders 'Unknown substance' without crashing", () => {
    const a: fhir4.AllergyIntolerance = {
      resourceType: "AllergyIntolerance",
      id: "broken",
      patient: { reference: "Patient/p" },
      clinicalStatus: { coding: [{ code: "active" }] },
    };
    render(<AllergiesCardView allergies={bundle(a)} />);
    expect(screen.getByText("Unknown substance")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────── Problems

describe("ProblemsCardView", () => {
  it("empty → 'No active problems'", () => {
    render(<ProblemsCardView problems={[]} />);
    expect(screen.getByText("No active problems")).toBeInTheDocument();
  });

  it("renders description + ICD code + onset", () => {
    const c: fhir4.Condition = {
      resourceType: "Condition",
      id: "c1",
      subject: { reference: "Patient/p" },
      clinicalStatus: { coding: [{ code: "active" }] },
      code: {
        text: "Hypertension",
        coding: [
          { system: "http://hl7.org/fhir/sid/icd-10-cm", code: "I10" },
        ],
      },
      onsetDateTime: "2023-04-12",
      recordedDate: "2023-04-12",
    };
    render(<ProblemsCardView problems={[c]} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Hypertension");
    expect(item).toHaveTextContent("I10");
    expect(item).toHaveTextContent("2023-04-12");
  });

  it("sorts by recordedDate desc", () => {
    const old: fhir4.Condition = {
      resourceType: "Condition",
      id: "old",
      subject: { reference: "Patient/p" },
      code: { text: "Older problem" },
      recordedDate: "2020-01-01",
    };
    const newest: fhir4.Condition = {
      resourceType: "Condition",
      id: "new",
      subject: { reference: "Patient/p" },
      code: { text: "Newer problem" },
      recordedDate: "2024-08-30",
    };
    render(<ProblemsCardView problems={[old, newest]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Newer problem");
    expect(items[1]).toHaveTextContent("Older problem");
  });

  it("malformed (no code) renders 'Unknown condition'", () => {
    const c: fhir4.Condition = {
      resourceType: "Condition",
      id: "broken",
      subject: { reference: "Patient/p" },
    };
    render(<ProblemsCardView problems={[c]} />);
    expect(screen.getByText("Unknown condition")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────── Medications

describe("MedicationsCardView", () => {
  it("empty → 'No active medications'", () => {
    render(<MedicationsCardView medications={emptyBundle} />);
    expect(screen.getByText("No active medications")).toBeInTheDocument();
  });

  it("renders name + dosage text", () => {
    const m: fhir4.MedicationRequest = {
      resourceType: "MedicationRequest",
      id: "m1",
      status: "active",
      intent: "plan",
      subject: { reference: "Patient/p" },
      medicationCodeableConcept: { text: "Lisinopril 10mg tablet" },
      dosageInstruction: [{ text: "Take 1 tablet by mouth daily" }],
    };
    render(<MedicationsCardView medications={bundle(m)} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Lisinopril 10mg tablet");
    expect(item).toHaveTextContent("Take 1 tablet by mouth daily");
  });

  it("falls back to dose+route when no dosageInstruction.text", () => {
    const m: fhir4.MedicationRequest = {
      resourceType: "MedicationRequest",
      id: "m2",
      status: "active",
      intent: "plan",
      subject: { reference: "Patient/p" },
      medicationCodeableConcept: { text: "Med" },
      dosageInstruction: [
        {
          doseAndRate: [{ doseQuantity: { value: 250, unit: "mg" } }],
          route: { text: "oral" },
        },
      ],
    };
    render(<MedicationsCardView medications={bundle(m)} />);
    expect(screen.getByText(/250 mg.*oral/)).toBeInTheDocument();
  });

  it("malformed (no name) renders 'Unknown medication'", () => {
    const m: fhir4.MedicationRequest = {
      resourceType: "MedicationRequest",
      id: "broken",
      status: "active",
      intent: "plan",
      subject: { reference: "Patient/p" },
    };
    render(<MedicationsCardView medications={bundle(m)} />);
    expect(screen.getByText("Unknown medication")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────── Prescriptions

describe("PrescriptionsCardView", () => {
  it("empty → 'No prescriptions on file'", () => {
    render(<PrescriptionsCardView prescriptions={emptyBundle} />);
    expect(screen.getByText("No prescriptions on file")).toBeInTheDocument();
  });

  it("sorts by authoredOn desc", () => {
    const old: fhir4.MedicationRequest = {
      resourceType: "MedicationRequest",
      id: "old",
      status: "completed",
      intent: "order",
      subject: { reference: "Patient/p" },
      medicationCodeableConcept: { text: "Older Rx" },
      authoredOn: "2020-01-01",
    };
    const newest: fhir4.MedicationRequest = {
      resourceType: "MedicationRequest",
      id: "new",
      status: "active",
      intent: "order",
      subject: { reference: "Patient/p" },
      medicationCodeableConcept: { text: "Newer Rx" },
      authoredOn: "2024-09-15",
    };
    render(<PrescriptionsCardView prescriptions={bundle(old, newest)} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Newer Rx");
    expect(items[1]).toHaveTextContent("Older Rx");
  });

  it("renders status badge + authored date", () => {
    const m: fhir4.MedicationRequest = {
      resourceType: "MedicationRequest",
      id: "m1",
      status: "active",
      intent: "order",
      subject: { reference: "Patient/p" },
      medicationCodeableConcept: { text: "Atorvastatin 20mg" },
      authoredOn: "2024-09-15",
      dosageInstruction: [{ text: "Take 1 at bedtime" }],
    };
    render(<PrescriptionsCardView prescriptions={bundle(m)} />);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Atorvastatin 20mg");
    expect(item).toHaveTextContent("active");
    expect(item).toHaveTextContent("Take 1 at bedtime");
    expect(item).toHaveTextContent("Ordered 2024-09-15");
  });

  it("malformed (no name, no date) still renders something", () => {
    const m: fhir4.MedicationRequest = {
      resourceType: "MedicationRequest",
      id: "broken",
      status: "unknown",
      intent: "order",
      subject: { reference: "Patient/p" },
    };
    render(<PrescriptionsCardView prescriptions={bundle(m)} />);
    expect(screen.getByText("Unknown medication")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────── Care Team

describe("CareTeamCardView", () => {
  it("empty → 'No care team assigned'", () => {
    render(<CareTeamCardView careTeam={emptyBundle} />);
    expect(screen.getByText("No care team assigned")).toBeInTheDocument();
  });

  it("renders one participant per row", () => {
    const team: fhir4.CareTeam = {
      resourceType: "CareTeam",
      id: "t1",
      status: "active",
      subject: { reference: "Patient/p" },
      participant: [
        {
          role: [{ text: "Primary Care Provider" }],
          member: { display: "Dr. Smith" },
        },
        {
          role: [{ text: "Care Coordinator" }],
          member: { display: "Jane RN" },
        },
      ],
    };
    render(<CareTeamCardView careTeam={bundle(team)} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("primary role sorts first and gets a Primary badge", () => {
    const team: fhir4.CareTeam = {
      resourceType: "CareTeam",
      id: "t1",
      status: "active",
      subject: { reference: "Patient/p" },
      participant: [
        { role: [{ text: "Care Coordinator" }], member: { display: "Aaron" } },
        {
          role: [{ text: "Primary Care Provider" }],
          member: { display: "Zoe" },
        },
      ],
    };
    render(<CareTeamCardView careTeam={bundle(team)} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Zoe");
    expect(items[0]).toHaveTextContent("Primary");
    expect(items[1]).toHaveTextContent("Aaron");
  });

  it("malformed (no member name) renders '(unnamed)'", () => {
    const team: fhir4.CareTeam = {
      resourceType: "CareTeam",
      id: "t1",
      status: "active",
      subject: { reference: "Patient/p" },
      participant: [{ role: [{ text: "Nurse" }] }],
    };
    render(<CareTeamCardView careTeam={bundle(team)} />);
    expect(screen.getByText("(unnamed)")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────── CardErrorBoundary smoke

describe("CardErrorBoundary", () => {
  it("catches a render error and shows the per-card fallback", () => {
    // Suppress the expected error in test output.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): never {
      throw new Error("boom");
    }
    render(
      <CardErrorBoundary title="Allergies">
        <Boom />
      </CardErrorBoundary>,
    );
    expect(screen.getByText(/Couldn.t load allergies/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
    spy.mockRestore();
  });
});
