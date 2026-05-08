import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EncountersList } from "@/components/EncountersList";
import { EncountersPreviewView } from "@/components/EncountersPreview";

function enc(overrides: Partial<fhir4.Encounter> = {}): fhir4.Encounter {
  return {
    resourceType: "Encounter",
    id: overrides.id ?? "e1",
    status: overrides.status ?? "finished",
    class: overrides.class ?? { code: "AMB", display: "ambulatory" },
    ...overrides,
  };
}

describe("EncountersList", () => {
  it("empty → 'No encounters on file'", () => {
    render(<EncountersList encounters={[]} />);
    expect(screen.getByText("No encounters on file")).toBeInTheDocument();
  });

  it("renders date, class, type, provider, status for one row", () => {
    const e = enc({
      id: "e1",
      status: "finished",
      class: { code: "AMB", display: "ambulatory" },
      type: [{ text: "Office Visit" }],
      participant: [{ individual: { display: "Dr. Smith" } }],
      period: { start: "2024-04-12T10:00:00Z" },
    });
    render(<EncountersList encounters={[e]} />);
    const row = screen.getAllByRole("row")[1]!; // [0] is header
    expect(within(row).getByText("2024-04-12")).toBeInTheDocument();
    expect(within(row).getByText("ambulatory")).toBeInTheDocument();
    expect(within(row).getByText("Office Visit")).toBeInTheDocument();
    expect(within(row).getByText("Dr. Smith")).toBeInTheDocument();
    expect(within(row).getByText("finished")).toBeInTheDocument();
  });

  it("renders many rows in given order (sort handled upstream)", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      enc({
        id: `e${i}`,
        period: { start: `2024-0${i + 1}-01T00:00:00Z` },
      }),
    );
    render(<EncountersList encounters={rows} />);
    const dataRows = screen.getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(5);
    expect(within(dataRows[0]!).getByText("2024-01-01")).toBeInTheDocument();
    expect(within(dataRows[4]!).getByText("2024-05-01")).toBeInTheDocument();
  });

  it("`limit` prop trims the row count", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      enc({
        id: `e${i}`,
        period: { start: `2024-${String(i + 1).padStart(2, "0")}-01T00:00:00Z` },
      }),
    );
    render(<EncountersList encounters={rows} limit={3} />);
    const dataRows = screen.getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(3);
  });

  it("malformed (no period, no provider) renders em-dashes without crashing", () => {
    const e = enc({ id: "broken", status: "unknown", class: undefined });
    render(<EncountersList encounters={[e]} />);
    const row = screen.getAllByRole("row")[1]!;
    // 4 em-dashes for date/class/type/provider plus the status badge
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(within(row).getByText("unknown")).toBeInTheDocument();
  });
});

describe("EncountersPreviewView", () => {
  function many(n: number): fhir4.Encounter[] {
    return Array.from({ length: n }, (_, i) =>
      enc({
        id: `e${i}`,
        period: { start: `2024-${String(i + 1).padStart(2, "0")}-01T00:00:00Z` },
      }),
    );
  }

  it("renders the title and (when non-empty) a 'View all' link to the full page", () => {
    render(
      <EncountersPreviewView encounters={many(5)} patientId="abc-123" />,
    );
    expect(screen.getByText("Recent Encounters")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view all/i });
    expect(link).toHaveAttribute("href", "/patient/abc-123/encounters");
  });

  it("limits to 3 rows even when given more", () => {
    render(
      <EncountersPreviewView encounters={many(10)} patientId="abc-123" />,
    );
    const dataRows = screen.getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(3);
  });

  it("hides the 'View all' link when there are no encounters", () => {
    render(
      <EncountersPreviewView encounters={[]} patientId="abc-123" />,
    );
    expect(
      screen.queryByRole("link", { name: /view all/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No encounters on file")).toBeInTheDocument();
  });
});
