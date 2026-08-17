import { describe, expect, it } from "vitest";

import { selectGrowthStandard } from "../../../src/clinical/anthropometry/standard-selector.ts";

describe("growth standard selector", () => {
  it("uses WHO for Colombia and carries the source identity", () => {
    const result = selectGrowthStandard({
      countryCode: "CO",
      sex: "male",
      measurementType: "weight",
      chronologicalAgeDays: 365,
      correctedAge: null,
    });

    expect(result.status).toBe("selected");
    expect(result.standard?.datasetKey).toBe("WHO_2006");
    expect(result.indicator).toBe("weight_for_age");
    expect(result.ageBasis).toBe("chronological");
    expect(result.ageMonths).toBeCloseTo(365 / 30.4375, 5);
    expect(result.standard?.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps the corrected-age request explicit instead of silently falling back", () => {
    const result = selectGrowthStandard({
      countryCode: "CO",
      sex: "male",
      measurementType: "weight",
      chronologicalAgeDays: 100,
      ageBasis: "corrected",
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
    });

    expect(result.status).toBe("unavailable");
    expect(result.warnings).toContain("corrected_age_unavailable");
  });

  it("switches from WHO to CDC at the explicit US transition", () => {
    const before = selectGrowthStandard({
      countryCode: "US",
      sex: "female",
      measurementType: "weight",
      chronologicalAgeDays: 729,
      correctedAge: null,
    });
    const at = selectGrowthStandard({
      countryCode: "US",
      sex: "female",
      measurementType: "weight",
      chronologicalAgeDays: 730,
      correctedAge: null,
    });

    expect(before.standard?.datasetKey).toBe("WHO_2006");
    expect(at.standard?.datasetKey).toBe("CDC_2000");
    expect(at.warnings).toContain("transition_boundary");
  });

  it("does not infer a standard for an unsupported country", () => {
    const result = selectGrowthStandard({
      countryCode: "CA" as never,
      sex: "male",
      measurementType: "weight",
      chronologicalAgeDays: 365,
      correctedAge: null,
    });

    expect(result.status).toBe("unavailable");
    expect(result.warnings).toContain("standard_unavailable");
  });
});
