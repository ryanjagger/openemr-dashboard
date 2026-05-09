import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientHeader } from "@/components/PatientHeader";

function build(p: Partial<fhir4.Patient> = {}): fhir4.Patient {
  return { resourceType: "Patient", ...p };
}

describe("PatientHeader — happy path", () => {
  const patient = build({
    id: "abc-123",
    active: true,
    name: [
      { use: "nickname", given: ["Bob"], family: "X" },
      { use: "official", given: ["Robert"], family: "Smith" },
    ],
    gender: "male",
    birthDate: "1980-06-15",
    identifier: [
      { type: { coding: [{ code: "MR" }] }, value: "MRN-99001" },
    ],
  });

  it("renders all five fields with use=official name", () => {
    render(<PatientHeader patient={patient} />);
    expect(screen.getByTestId("patient-name")).toHaveTextContent("Smith, Robert");
    expect(screen.getByTestId("patient-status")).toHaveTextContent("Active");
    expect(screen.getByTestId("patient-dob")).toHaveTextContent("1980-06-15");
    expect(screen.getByTestId("patient-dob")).toHaveTextContent(/\(\d+y\)/);
    expect(screen.getByTestId("patient-sex")).toHaveTextContent("Male");
    expect(screen.getByTestId("patient-id")).toHaveTextContent("MRN-99001");
    expect(screen.getByTestId("patient-fhir-id")).toHaveTextContent("abc-123");
  });

  it("uses semantic banner role with accessible name", () => {
    render(<PatientHeader patient={patient} />);
    const banner = screen.getByRole("banner");
    const heading = within(banner).getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Smith, Robert");
  });

  it("status badge has accessible label", () => {
    render(<PatientHeader patient={patient} />);
    const badge = screen.getByLabelText("Patient status: Active");
    expect(badge).toHaveTextContent("Active");
  });

});

describe("PatientHeader — degenerate inputs", () => {
  it("falls back to first name when no use=official is present", () => {
    const patient = build({
      name: [{ given: ["Alex"], family: "Park" }],
    });
    render(<PatientHeader patient={patient} />);
    expect(screen.getByTestId("patient-name")).toHaveTextContent("Park, Alex");
  });

  it("shows '(no name on file)' when name array is missing", () => {
    render(<PatientHeader patient={build()} />);
    expect(screen.getByTestId("patient-name")).toHaveTextContent(
      "(no name on file)",
    );
  });

  it("falls back to External ID (pubpid) when no MRN", () => {
    const patient = build({
      identifier: [
        { type: { coding: [{ code: "PT" }] }, value: "66" },
      ],
    });
    render(<PatientHeader patient={patient} />);
    const idValue = screen.getByTestId("patient-id");
    expect(idValue).toHaveTextContent("66");
    expect(screen.getByText(/^External ID$/i)).toBeInTheDocument();
  });

  it("shows em-dash when neither MRN nor pubpid present", () => {
    render(<PatientHeader patient={build()} />);
    expect(screen.getByTestId("patient-id")).toHaveTextContent("—");
  });

  it("renders gray Inactive badge when active=false", () => {
    const patient = build({ active: false });
    render(<PatientHeader patient={patient} />);
    const badge = screen.getByTestId("patient-status");
    expect(badge).toHaveTextContent("Inactive");
    expect(badge).toHaveAccessibleName("Patient status: Inactive");
  });

  it("treats missing active flag as Active (default true)", () => {
    render(<PatientHeader patient={build()} />);
    expect(screen.getByTestId("patient-status")).toHaveTextContent("Active");
  });

  it("omits age when birthDate is missing", () => {
    render(<PatientHeader patient={build()} />);
    const dob = screen.getByTestId("patient-dob");
    expect(dob).toHaveTextContent("—");
    expect(dob).not.toHaveTextContent(/\d+y/);
  });

  it("shows em-dash for unknown gender", () => {
    render(<PatientHeader patient={build()} />);
    expect(screen.getByTestId("patient-sex")).toHaveTextContent("—");
  });
});
