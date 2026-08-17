import { describe, expect, it } from "vitest";

import { calculateCorrectedAge, validateGestationalAge } from "../../../src/clinical/anthropometry/corrected-age.ts";
import type { ChronologicalAge } from "../../../src/clinical/anthropometry/age-policy.ts";

const chronological: ChronologicalAge = {
  ageDays: 100,
  completedWeeks: 14,
  completedMonths: 3,
  completedYears: 0,
  birthLocalDate: "2026-01-01",
  referenceLocalDate: "2026-04-11",
  referenceInstant: "2026-04-11T12:00:00.000Z",
  timeZone: "UTC",
  datasetAgeDays: 100,
  algorithmVersion: "chronological.v1",
};

describe("corrected age engine", () => {
  it("returns unavailable when no approved prematurity package exists", () => {
    const result = calculateCorrectedAge(chronological, { weeks: 32, days: 0 }, null);

    expect(result.status).toBe("rule_unavailable");
    expect(result.chronologicalAgeDays).toBe(100);
    expect(result.correctedAgeDays).toBeNull();
    expect(result.warning).toBe("corrected_age_unavailable");
  });

  it("applies an approved policy at exact inclusive boundaries", () => {
    const result = calculateCorrectedAge(chronological, { weeks: 37, days: 0 }, {
      policyId: "prematurity.v1",
      version: "1.0.0",
      approved: true,
      termGestationalWeeks: 40,
      correctionEndDays: 730,
      eligibleBelowWeeks: 37,
      negativeBehavior: "unavailable",
    });

    expect(result.status).toBe("calculated");
    expect(result.correctedAgeDays).toBe(79);
    expect(result.offsetDays).toBe(21);
    expect(result.correctionApplied).toBe(true);
  });

  it("rejects malformed gestational age instead of inferring", () => {
    expect(() => validateGestationalAge({ weeks: 37, days: 7 })).toThrow();
  });
});
