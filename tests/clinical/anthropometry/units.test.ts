import { describe, expect, it } from "vitest";

import { normalizeAnthropometricUnit } from "../../../src/clinical/anthropometry/units.ts";
import { parseClinicalDecimal } from "../../../src/clinical/anthropometry/decimal.ts";

describe("anthropometric unit normalization", () => {
  it("converts weight and length with exact decimal output", () => {
    const weight = normalizeAnthropometricUnit("weight", "453.59237", "g");
    const length = normalizeAnthropometricUnit("standing_height", "70", "in");

    expect(weight.normalizedUnit).toBe("kg");
    expect(weight.normalized.canonical).toBe("0.45359237");
    expect(length.normalizedUnit).toBe("cm");
    expect(length.normalized.canonical).toBe("177.8");
    expect(weight.original.lexeme).toBe("453.59237");
  });

  it("accepts decimal comma but rejects ambiguous or scientific values", () => {
    expect(parseClinicalDecimal("12,50").canonical).toBe("12.50");
    expect(() => parseClinicalDecimal("1,234.5")).toThrow();
    expect(() => parseClinicalDecimal("1e2")).toThrow();
  });

  it("supports exact pounds plus ounces and rejects type/unit mismatch", () => {
    const result = normalizeAnthropometricUnit("weight", { pounds: "2", ounces: "8" }, "lb_oz");

    expect(result.normalized.canonical).toBe("1.133980925");
    expect(() => normalizeAnthropometricUnit("head_circumference", "10", "kg")).toThrow();
  });
});
