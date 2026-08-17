import { describe, expect, it } from "vitest";

import {
  measurementCommandSchema,
  growthAssessmentResultSchema,
} from "../../../src/clinical/anthropometry/schemas.ts";
import {
  createExactClinicalDecimal,
  isSha256Hex,
} from "../../../src/clinical/anthropometry/value-objects.ts";

describe("anthropometry domain contracts", () => {
  it("accepts only the untrusted measurement declaration", () => {
    const command = measurementCommandSchema.parse({
      measurementType: "weight",
      value: "12.30",
      unit: "kg",
      occurredAt: "2026-08-16T12:00:00.000Z",
      localDate: "2026-08-16",
      timeZone: "America/Bogota",
      measurementMethod: "digital_scale",
      provenanceType: "guardian",
    });

    expect(command.value).toBe("12.30");
    expect(command).not.toHaveProperty("childId");
  });

  it("rejects authority, derived, and unknown fields", () => {
    expect(() => measurementCommandSchema.parse({
      measurementType: "weight",
      value: "12.3",
      unit: "kg",
      occurredAt: "2026-08-16T12:00:00.000Z",
      localDate: "2026-08-16",
      timeZone: "America/Bogota",
      childId: "00000000-0000-4000-8000-000000000001",
    })).toThrow();
  });

  it("keeps a clinical decimal exact without using a float", () => {
    const value = createExactClinicalDecimal("12.30");

    expect(value.lexeme).toBe("12.30");
    expect(value.canonical).toBe("12.30");
    expect(value.scaledInteger).toBe("1230");
    expect(value.scale).toBe(2);
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("validates digests and permits only calculated numeric results", () => {
    expect(isSha256Hex("a".repeat(64))).toBe(true);
    expect(isSha256Hex("not-a-digest")).toBe(false);

    expect(() => growthAssessmentResultSchema.parse({
      status: "calculated",
      standard: { key: "WHO_2006", datasetKey: "WHO_2006", version: "1.0.0", sourceDigest: "a".repeat(64) },
      indicator: "weight_for_age",
      age: { chronologicalAgeDays: 365, correctedAgeDays: null, basis: "chronological", referenceInstant: "2026-08-16T12:00:00.000Z", timeZone: "UTC" },
      zScore: null,
      percentile: 50,
      warnings: [],
      provenance: { measurementId: "00000000-0000-4000-8000-000000000001", rulePackId: "pack", algorithmId: "algorithm", datasetDigest: "a".repeat(64), inputDigest: "b".repeat(64), decisionDigest: "c".repeat(64) },
    })).toThrow();
  });
});
