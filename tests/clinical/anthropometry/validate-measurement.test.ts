import { describe, expect, it } from "vitest";

import { AgeEngine } from "../../../src/clinical/anthropometry/chronological-age.ts";
import { normalizeAnthropometricUnit } from "../../../src/clinical/anthropometry/units.ts";
import { validateMeasurementCapture } from "../../../src/clinical/anthropometry/validate-measurement.ts";
import type { MeasurementCommand } from "../../../src/clinical/anthropometry/types.ts";

const command: MeasurementCommand = {
  measurementType: "weight",
  value: "12.30",
  unit: "kg",
  occurredAt: "2026-08-16T12:00:00.000Z",
  localDate: "2026-08-16",
  timeZone: "UTC",
  measurementMethod: "digital_scale",
  provenanceType: "guardian",
};
const age = AgeEngine.calculateChronologicalAge({ birthDate: "2025-08-16", birthDatePrecision: "date", referenceInstant: "2026-08-16T12:00:00.000Z", timeZone: "UTC" });
const policy = {
  policyId: "capture.v1",
  version: "1.0.0",
  futureSkewSeconds: 0,
  maxAgeDays: 30,
};

describe("measurement capture validation", () => {
  it("returns a valid immutable candidate with material facts echoed", () => {
    const normalized = normalizeAnthropometricUnit(command.measurementType, command.value, command.unit);
    const result = validateMeasurementCapture(command, normalized, age, policy, new Date("2026-08-16T12:01:00.000Z"));

    expect(result.status).toBe("valid");
    expect(result.candidate?.normalizedValue.normalized.canonical).toBe("12.30");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects future, stale, and impossible measurements without correction", () => {
    const future = { ...command, occurredAt: "2026-08-17T12:00:00.000Z", localDate: "2026-08-17" };
    const normalized = normalizeAnthropometricUnit(command.measurementType, command.value, command.unit);
    expect(validateMeasurementCapture(future, normalized, age, policy, new Date("2026-08-16T12:01:00.000Z")).status).toBe("rejected");

    const old = { ...command, occurredAt: "2025-01-01T12:00:00.000Z", localDate: "2025-01-01" };
    expect(validateMeasurementCapture(old, normalized, age, policy, new Date("2026-08-16T12:01:00.000Z")).status).toBe("excluded");
  });
});
