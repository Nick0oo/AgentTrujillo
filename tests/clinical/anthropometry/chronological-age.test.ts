import { describe, expect, it } from "vitest";

import { AgeEngine, AgeCalculationError } from "../../../src/clinical/anthropometry/chronological-age.ts";

describe("chronological age engine", () => {
  it("calculates exact days and completed calendar units at a leap boundary", () => {
    const age = AgeEngine.calculateChronologicalAge({
      birthDate: "2024-02-29",
      birthDatePrecision: "date",
      referenceInstant: "2025-02-28T23:30:00.000Z",
      timeZone: "America/Bogota",
    });

    expect(age.ageDays).toBe(365);
    expect(age.completedMonths).toBe(12);
    expect(age.completedYears).toBe(1);
    expect(age.birthLocalDate).toBe("2024-02-29");
    expect(age.referenceLocalDate).toBe("2025-02-28");
  });

  it("uses the explicit timezone, not the host timezone, for a boundary instant", () => {
    const age = AgeEngine.calculateChronologicalAge({
      birthDate: "2026-08-16",
      birthDatePrecision: "date",
      referenceInstant: "2026-08-17T00:15:00.000Z",
      timeZone: "America/Bogota",
    });

    expect(age.referenceLocalDate).toBe("2026-08-16");
    expect(age.ageDays).toBe(0);
  });

  it("rejects invalid temporal input without estimating", () => {
    expect(() => AgeEngine.calculateChronologicalAge({
      birthDate: "2026-08-18",
      birthDatePrecision: "date",
      referenceInstant: "2026-08-17T00:00:00.000Z",
      timeZone: "UTC",
    })).toThrowError(AgeCalculationError);
  });
});
