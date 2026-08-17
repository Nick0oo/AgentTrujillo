import { describe, expect, it } from "vitest";

import {
  medicationPlanInputSchema,
  medicationValidationResultSchema,
  type MedicationValidationResult,
} from "../../../src/clinical/medication/types.ts";

describe("medication domain contracts", () => {
  it("exposes exactly the four conservative public validation outcomes", () => {
    const values: MedicationValidationResult["outcome"][] = [
      "within_reference_limits",
      "outside_reference_limits",
      "insufficient_data",
      "requires_professional_review",
    ];

    expect(values).toHaveLength(4);
    for (const outcome of values) {
      expect(medicationValidationResultSchema.shape.outcome.safeParse(outcome).success).toBe(true);
    }
    expect(medicationValidationResultSchema.shape.outcome.safeParse("safe").success).toBe(false);
    expect(medicationValidationResultSchema.shape.outcome.safeParse("rule_unavailable").success).toBe(false);
  });

  it("rejects scope, authority, and recommendation fields from model-facing plan input", () => {
    const result = medicationPlanInputSchema.safeParse({
      displayName: "medication",
      conceptCode: "synthetic-identity",
      codingSystem: "INVIMA",
      care_space_id: "space-from-model",
      child_id: "child-from-model",
      recommendedDose: "5",
      safeToAdminister: true,
    });

    expect(result.success).toBe(false);
  });

  it("does not accept a validation outcome as client input", () => {
    const result = medicationPlanInputSchema.safeParse({
      displayName: "medication",
      conceptCode: "synthetic-identity",
      codingSystem: "INVIMA",
      validationOutcome: "within_reference_limits",
    });

    expect(result.success).toBe(false);
  });
});
