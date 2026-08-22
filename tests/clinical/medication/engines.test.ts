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

  it("applies the concentration denominator to every combination ingredient and fails closed on unit mismatch", () => {
    const combination = {
      ...presentation,
      concentration: { numerator: "5" as never, numeratorUnit: "mg" as const, denominator: "2" as never, denominatorUnit: "mL" as const },
      ingredients: [
        { ingredientCode: "ING-A", codingSystem: "INVIMA" as const, name: "Ingredient A", amount: "5" as never, amountUnit: "mg" as const },
        { ingredientCode: "ING-B", codingSystem: "INVIMA" as const, name: "Ingredient B", amount: "10" as never, amountUnit: "mg" as const },
      ],
    };
    const converted = convertMedicationConcentration({ presentation: combination, quantity: "4", quantityUnit: "mL" });
    expect(converted.ingredients.map((value) => value.amount)).toEqual(["10", "20"]);

    const mismatch = convertMedicationConcentration({
      presentation: { ...combination, ingredients: [{ ...combination.ingredients[0]!, amountUnit: "mL" }, combination.ingredients[1]!] },
      quantity: "4",
      quantityUnit: "mL",
    });
    expect(mismatch.status).toBe("requires_professional_review");
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

  it("refuses conflicting latest weights and invalid confirmation chronology", () => {
    const measurements = [
      { measurementId: "one", childId: "child-1", valueKg: "10" as never, measuredAt: "2026-08-15T12:00:00Z", confirmedAt: "2026-08-15T12:01:00Z", validationStatus: "confirmed" as const, provenance: "professional" as const },
      { measurementId: "two", childId: "child-1", valueKg: "11" as never, measuredAt: "2026-08-15T12:00:00Z", confirmedAt: "2026-08-15T12:02:00Z", validationStatus: "confirmed" as const, provenance: "professional" as const },
    ];
    expect(resolveRecentVerifiedWeight("child-1", "2026-08-16T12:00:00Z", measurements, { maxAgeHours: 720 }).status).toBe("insufficient_data");
    expect(resolveRecentVerifiedWeight("child-1", "2026-08-16T12:00:00Z", [{ ...measurements[0]!, confirmedAt: "2026-08-14T12:00:00Z" }], { maxAgeHours: 720 }).status).toBe("insufficient_data");
    expect(resolveRecentVerifiedWeight("child-1", "2026-08-16T12:00:00Z", [{ ...measurements[0]!, confirmedAt: "2026-08-17T12:00:00Z" }], { maxAgeHours: 720 }).status).toBe("insufficient_data");
    expect(resolveRecentVerifiedWeight("child-1", "2026-08-16T12:00:00Z", [measurements[0]!], undefined as never).status).toBe("insufficient_data");
  });

  it("compares per-dose and daily exposure without offering a replacement", () => {
    const perDose = compareMedicationPerDose({ amount: "10", unit: "mg", weightKg: "10", rule });
    expect(perDose.status).toBe("within");
    const daily = compareMedicationDailyExposure({ perDoseAmount: "10", perDoseUnit: "mg", frequency: { kind: "interval", everyHours: "8" }, rule });
    expect(daily.status).toBe("within");
    expect(JSON.stringify(daily)).not.toMatch(/safe|alternative|recommendedDose|prescribed/i);
  });

  it("intersects fixed and weight-derived per-dose limits", () => {
    const result = compareMedicationPerDose({
      amount: "12",
      unit: "mg",
      weightKg: "10",
      rule: { ...rule, perDoseMin: "15" as never, perDoseMax: "18" as never },
    });
    expect(result.lower).toBe("15");
    expect(result.upper).toBe("18");
    expect(result.status).toBe("outside");
  });

  it("converts compatible daily mass units and rejects duplicate declared times", () => {
    const converted = compareMedicationDailyExposure({ perDoseAmount: "0.01", perDoseUnit: "g", frequency: { kind: "times_of_day", times: ["08:00", "20:00"] }, rule });
    expect(converted.dailyAmount).toBe("20");
    expect(converted.status).toBe("within");
    const duplicate = compareMedicationDailyExposure({ perDoseAmount: "10", perDoseUnit: "mg", frequency: { kind: "times_of_day", times: ["08:00", "08:00"] }, rule });
    expect(duplicate.status).toBe("requires_professional_review");
  });

  it("fails closed instead of throwing for invalid rule-selection inputs", () => {
    expect(selectMedicationDoseRule({ conceptCode: "SYN-001", route: "oral", ageDays: -1, weightKg: "10", indicationCode: "synthetic-indication" }, [rule]).status).toBe("insufficient_data");
    expect(selectMedicationDoseRule({ conceptCode: "SYN-001", route: "oral", ageDays: 100, weightKg: "not-a-number", indicationCode: "synthetic-indication" }, [rule]).status).toBe("insufficient_data");
  });

  it("fails closed instead of throwing for malformed declared arithmetic", () => {
    expect(convertMedicationConcentration({ presentation, quantity: "not-a-decimal", quantityUnit: "mL" }).status).toBe("insufficient_data");
    expect(compareMedicationPerDose({ amount: "not-a-decimal", unit: "mg", weightKg: "10", rule }).status).toBe("insufficient_data");
    expect(compareMedicationDailyExposure({ perDoseAmount: "not-a-decimal", perDoseUnit: "mg", frequency: { kind: "interval", everyHours: "8" }, rule }).status).toBe("insufficient_data");
  });

  it("maps review and missing evidence ahead of numeric reassurance", () => {
    expect(mapMedicationValidationStatus({ within: true, outside: false, insufficient: false, professionalReview: true })).toBe("requires_professional_review");
    expect(mapMedicationValidationStatus({ within: true, outside: false, insufficient: true, professionalReview: false })).toBe("insufficient_data");
    expect(mapMedicationValidationStatus({ within: true, outside: true, insufficient: false, professionalReview: false })).toBe("outside_reference_limits");
  });
});
