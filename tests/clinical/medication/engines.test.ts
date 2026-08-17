import { describe, expect, it } from "vitest";

import { convertMedicationConcentration } from "../../../src/clinical/medication/concentration-converter.ts";
import { compareMedicationDailyExposure } from "../../../src/clinical/medication/daily-comparator.ts";
import { compareMedicationPerDose } from "../../../src/clinical/medication/per-dose-comparator.ts";
import { selectMedicationDoseRule } from "../../../src/clinical/medication/dose-limit-selector.ts";
import { mapMedicationValidationStatus } from "../../../src/clinical/medication/status-mapper.ts";
import { resolveRecentVerifiedWeight } from "../../../src/clinical/medication/weight-resolver.ts";
import type { MedicationDoseRule, MedicationPresentation } from "../../../src/clinical/medication/types.ts";

const presentation: MedicationPresentation = {
  id: "00000000-0000-0000-0000-000000000002" as MedicationPresentation["id"],
  conceptId: "00000000-0000-0000-0000-000000000001" as MedicationPresentation["conceptId"],
  country: "CO",
  form: "solution",
  route: "oral",
  release: "immediate",
  regulatoryIdentifier: "SYN-PRES-001",
  concentration: { numerator: "5" as never, numeratorUnit: "mg", denominator: "1" as never, denominatorUnit: "mL" },
  ingredients: [{ ingredientCode: "ING-A", codingSystem: "INVIMA", name: "Ingredient A" }],
};

const rule: MedicationDoseRule = {
  ruleId: "synthetic-rule",
  packageId: "synthetic-package",
  conceptCode: "SYN-001",
  route: "oral",
  indicationCode: "synthetic-indication",
  minAgeDays: 0,
  maxAgeDays: 3650,
  minWeightKg: "1" as never,
  maxWeightKg: "40" as never,
  perDoseMin: null,
  perDoseMax: null,
  perDoseUnit: "mg",
  perKgMin: "1" as never,
  perKgMax: "2" as never,
  absoluteSingleMax: "80" as never,
  dailyMax: "160" as never,
  dailyUnit: "mg",
  minimumIntervalHours: "6" as never,
  exclusions: [],
};

describe("deterministic medication engines", () => {
  it("converts a declared liquid quantity with exact decimal arithmetic", () => {
    const converted = convertMedicationConcentration({ presentation, quantity: "1.5", quantityUnit: "mL" });
    expect(converted.status).toBe("converted");
    expect(converted.ingredients[0]?.amount).toBe("7.5");
  });

  it("keeps all ingredient vectors and refuses ambiguous reconstitution", () => {
    const ambiguous = convertMedicationConcentration({ presentation: { ...presentation, concentration: null }, quantity: "1", quantityUnit: "mL" });
    expect(ambiguous.status).toBe("requires_professional_review");
  });

  it("selects a rule only when all explicit predicates identify one rule", () => {
    const selected = selectMedicationDoseRule({ conceptCode: "SYN-001", route: "oral", ageDays: 100, weightKg: "10", indicationCode: "synthetic-indication" }, [rule]);
    expect(selected.status).toBe("resolved");
    expect(selected.rule?.ruleId).toBe("synthetic-rule");
    expect(selectMedicationDoseRule({ conceptCode: "SYN-001", route: "oral", ageDays: 100, weightKg: "10", indicationCode: "other" }, [rule]).status).toBe("insufficient_data");
  });

  it("selects only a recent confirmed same-child weight", () => {
    const result = resolveRecentVerifiedWeight("child-1", "2026-08-16T12:00:00Z", [
      { measurementId: "old", childId: "child-1", valueKg: "9" as never, measuredAt: "2026-06-01T12:00:00Z", confirmedAt: "2026-06-01T12:00:00Z", validationStatus: "confirmed", provenance: "guardian" },
      { measurementId: "new", childId: "child-1", valueKg: "10" as never, measuredAt: "2026-08-15T12:00:00Z", confirmedAt: "2026-08-15T12:01:00Z", validationStatus: "confirmed", provenance: "professional" },
      { measurementId: "sibling", childId: "child-2", valueKg: "99" as never, measuredAt: "2026-08-16T11:00:00Z", confirmedAt: "2026-08-16T11:01:00Z", validationStatus: "confirmed", provenance: "professional" },
    ], { maxAgeHours: 720 });
    expect(result.status).toBe("resolved");
    expect(result.weight?.measurementId).toBe("new");
  });

  it("compares per-dose and daily exposure without offering a replacement", () => {
    const perDose = compareMedicationPerDose({ amount: "10", unit: "mg", weightKg: "10", rule });
    expect(perDose.status).toBe("within");
    const daily = compareMedicationDailyExposure({ perDoseAmount: "10", perDoseUnit: "mg", frequency: { kind: "interval", everyHours: "8" }, rule });
    expect(daily.status).toBe("within");
    expect(JSON.stringify(daily)).not.toMatch(/safe|alternative|recommendedDose|prescribed/i);
  });

  it("maps review and missing evidence ahead of numeric reassurance", () => {
    expect(mapMedicationValidationStatus({ within: true, outside: false, insufficient: false, professionalReview: true })).toBe("requires_professional_review");
    expect(mapMedicationValidationStatus({ within: true, outside: false, insufficient: true, professionalReview: false })).toBe("insufficient_data");
    expect(mapMedicationValidationStatus({ within: true, outside: true, insufficient: false, professionalReview: false })).toBe("outside_reference_limits");
  });
});
