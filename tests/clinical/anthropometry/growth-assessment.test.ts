import { describe, expect, it } from "vitest";

import { assessGrowth } from "../../../src/clinical/anthropometry/growth-assessment.ts";

describe("growth assessment", () => {
  it("calculates a WHO weight-for-age assessment with provenance", () => {
    const result = assessGrowth({
      measurementId: "measurement-1",
      measurementType: "weight",
      normalizedValue: "3.3464",
      normalizedUnit: "kg",
      sex: "male",
      countryCode: "CO",
      chronologicalAgeDays: 0,
      correctedAge: null,
      occurredAt: "2026-08-16T12:00:00.000Z",
      timeZone: "America/Bogota",
    });

    expect(result.status).toBe("calculated");
    expect(result.standard?.datasetKey).toBe("WHO_2006");
    expect(result.zScore?.canonical).toBe("0");
    expect(result.percentile?.canonical).toBe("50");
    expect(result.interpretation).toBe("within_expected");
    expect(result.provenance.measurementId).toBe("measurement-1");
    expect(result.provenance.datasetDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns insufficient_data when BMI has no height companion", () => {
    const result = assessGrowth({
      measurementId: "measurement-2",
      measurementType: "weight",
      indicator: "bmi_for_age",
      normalizedValue: "12",
      normalizedUnit: "kg",
      sex: "female",
      countryCode: "US",
      chronologicalAgeDays: 3650,
      chronologicalCompletedMonths: 120,
      correctedAge: null,
      occurredAt: "2026-08-16T12:00:00.000Z",
      timeZone: "America/Bogota",
    });

    expect(result.status).toBe("insufficient_data");
    expect(result.zScore).toBeNull();
    expect(result.warnings).toContain("insufficient_companion");
  });

  it("uses the CDC extended algorithm only after a calculated BMI exceeds the eligibility threshold", () => {
    const result = assessGrowth({
      measurementId: "measurement-extended-bmi",
      measurementType: "weight",
      indicator: "bmi_for_age",
      normalizedValue: "22.6",
      normalizedUnit: "kg",
      companion: { measurementType: "standing_height", normalizedValue: "100", normalizedUnit: "cm" },
      sex: "male",
      countryCode: "US",
      chronologicalAgeDays: 1537,
      chronologicalCompletedMonths: 50,
      correctedAge: null,
      occurredAt: "2026-08-16T12:00:00.000Z",
      timeZone: "America/Bogota",
    });

    expect(result.status).toBe("calculated");
    expect(result.standard?.datasetKey).toBe("CDC_2022_EXTENDED_BMI");
    expect(Number(result.percentile?.canonical)).toBeGreaterThan(99);
    expect(result.provenance.algorithmId).toContain("cdc-extended-bmi.v1");
  });

  it("does not silently use chronological age when corrected age was requested but unavailable", () => {
    const result = assessGrowth({
      measurementId: "measurement-3",
      measurementType: "weight",
      normalizedValue: "3.3",
      normalizedUnit: "kg",
      sex: "male",
      countryCode: "CO",
      ageBasis: "corrected",
      chronologicalAgeDays: 100,
      correctedAge: {
        status: "rule_unavailable",
        chronologicalAgeDays: 100,
        correctedAgeDays: null,
        correctionApplied: false,
        offsetDays: null,
        policyId: null,
        policyVersion: null,
        transition: "unavailable",
        warning: "corrected_age_unavailable",
      },
      occurredAt: "2026-08-16T12:00:00.000Z",
      timeZone: "America/Bogota",
    });

    expect(result.status).toBe("rule_unavailable");
    expect(result.warnings).toContain("corrected_age_unavailable");
  });
});
