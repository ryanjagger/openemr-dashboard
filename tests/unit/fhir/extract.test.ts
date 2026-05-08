// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  bundleEntries,
  conditionCategoryCodes,
  extractMRN,
  extractPubPid,
  formatAge,
  formatCodeableConcept,
  formatHumanName,
  formatPatientName,
  formatPeriod,
} from "@/lib/fhir/extract";

describe("formatHumanName", () => {
  it("prefers .text when present", () => {
    expect(formatHumanName({ text: "Dr. Jane Doe" })).toBe("Dr. Jane Doe");
  });
  it("formats family + given as 'Family, Given'", () => {
    expect(formatHumanName({ family: "Hoppe", given: ["Dirk"] })).toBe(
      "Hoppe, Dirk",
    );
  });
  it("falls back to family-only or given-only", () => {
    expect(formatHumanName({ family: "Hoppe" })).toBe("Hoppe");
    expect(formatHumanName({ given: ["Dirk", "F"] })).toBe("Dirk F");
  });
  it("returns empty string for missing/empty input", () => {
    expect(formatHumanName(undefined)).toBe("");
    expect(formatHumanName({})).toBe("");
  });
});

describe("formatPatientName", () => {
  it("returns no-name placeholder when missing", () => {
    expect(formatPatientName(undefined)).toBe("(no name on file)");
    expect(formatPatientName({ resourceType: "Patient" })).toBe(
      "(no name on file)",
    );
  });
  it("prefers use=official", () => {
    expect(
      formatPatientName({
        resourceType: "Patient",
        name: [
          { use: "nickname", given: ["Bob"], family: "X" },
          { use: "official", given: ["Robert"], family: "Smith" },
        ],
      }),
    ).toBe("Smith, Robert");
  });
  it("falls back to first name when no official", () => {
    expect(
      formatPatientName({
        resourceType: "Patient",
        name: [{ given: ["Alex"], family: "P" }],
      }),
    ).toBe("P, Alex");
  });
});

describe("formatCodeableConcept", () => {
  it("prefers .text", () => {
    expect(formatCodeableConcept({ text: "Penicillin allergy" })).toBe(
      "Penicillin allergy",
    );
  });
  it("falls back to coding[0].display, then code", () => {
    expect(
      formatCodeableConcept({ coding: [{ display: "Active" }] }),
    ).toBe("Active");
    expect(formatCodeableConcept({ coding: [{ code: "active" }] })).toBe(
      "active",
    );
  });
  it("returns empty for missing/empty", () => {
    expect(formatCodeableConcept(undefined)).toBe("");
    expect(formatCodeableConcept({})).toBe("");
    expect(formatCodeableConcept({ coding: [] })).toBe("");
  });
});

describe("formatPeriod", () => {
  it("formats start → end", () => {
    expect(
      formatPeriod({ start: "2024-01-15", end: "2024-02-01" }),
    ).toBe("2024-01-15 → 2024-02-01");
  });
  it("uses 'present' when end is missing", () => {
    expect(formatPeriod({ start: "2024-01-15" })).toBe(
      "2024-01-15 → present",
    );
  });
  it("returns empty string for entirely missing data", () => {
    expect(formatPeriod(undefined)).toBe("");
    expect(formatPeriod({})).toBe("");
  });
});

describe("extractMRN / extractPubPid", () => {
  const patient: fhir4.Patient = {
    resourceType: "Patient",
    identifier: [
      {
        type: { coding: [{ code: "PT" }] },
        value: "66",
      },
      {
        type: { coding: [{ code: "MR" }] },
        value: "MRN-00099",
      },
    ],
  };
  it("pulls MR identifier as MRN", () => {
    expect(extractMRN(patient)).toBe("MRN-00099");
  });
  it("pulls PT identifier as pubpid", () => {
    expect(extractPubPid(patient)).toBe("66");
  });
  it("returns null when nothing matches", () => {
    expect(extractMRN({ resourceType: "Patient" })).toBeNull();
    expect(extractPubPid({ resourceType: "Patient" })).toBeNull();
  });
});

describe("formatAge", () => {
  it("computes whole-year age", () => {
    const fortyYearsAgo = new Date();
    fortyYearsAgo.setFullYear(fortyYearsAgo.getFullYear() - 40);
    fortyYearsAgo.setDate(fortyYearsAgo.getDate() - 1);
    expect(formatAge(fortyYearsAgo.toISOString().slice(0, 10))).toBe(40);
  });
  it("returns null on missing or unparseable dob", () => {
    expect(formatAge(undefined)).toBeNull();
    expect(formatAge("not-a-date")).toBeNull();
  });
  it("never returns negative for future dob", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 5);
    expect(formatAge(future.toISOString().slice(0, 10))).toBeNull();
  });
});

describe("bundleEntries", () => {
  it("filters by resourceType", () => {
    const bundle: fhir4.Bundle = {
      resourceType: "Bundle",
      type: "searchset",
      entry: [
        { resource: { resourceType: "Condition", id: "c1" } as fhir4.Condition },
        { resource: { resourceType: "Patient", id: "p1" } as fhir4.Patient },
        { resource: { resourceType: "Condition", id: "c2" } as fhir4.Condition },
      ],
    };
    const conds = bundleEntries<fhir4.Condition>(bundle, "Condition");
    expect(conds.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
  it("returns [] for missing/empty bundle", () => {
    expect(bundleEntries(undefined, "Patient")).toEqual([]);
    expect(
      bundleEntries({ resourceType: "Bundle", type: "searchset" }, "Patient"),
    ).toEqual([]);
  });
});

describe("conditionCategoryCodes", () => {
  it("flattens all category coding codes", () => {
    const c: fhir4.Condition = {
      resourceType: "Condition",
      subject: { reference: "Patient/1" },
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/condition-category",
              code: "problem-list-item",
            },
          ],
        },
        { coding: [{ code: "encounter-diagnosis" }] },
      ],
    };
    expect(conditionCategoryCodes(c)).toEqual([
      "problem-list-item",
      "encounter-diagnosis",
    ]);
  });
  it("handles missing category", () => {
    expect(
      conditionCategoryCodes({
        resourceType: "Condition",
        subject: { reference: "Patient/1" },
      }),
    ).toEqual([]);
  });
});
