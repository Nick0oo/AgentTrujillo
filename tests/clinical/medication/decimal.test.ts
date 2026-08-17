import { describe, expect, it } from "vitest";

import { decimalToCanonicalString, parseExactDecimal } from "../../../src/clinical/medication/decimal.ts";

describe("exact medication decimals", () => {
  it("normalizes decimal strings without binary floating point", () => {
    const value = parseExactDecimal("0.125");
    expect(decimalToCanonicalString(value)).toBe("0.125");
    expect(decimalToCanonicalString(parseExactDecimal("10.5000"))).toBe("10.5");
  });

  it.each(["1e-3", "+1", "1,5", "NaN", "Infinity", "-1", ""]) (
    "rejects non-canonical or unsafe decimal %s",
    (value) => {
      expect(() => parseExactDecimal(value)).toThrow("INVALID_EXACT_DECIMAL");
    },
  );

  it("rejects zero when a strictly positive measurement is required", () => {
    expect(() => parseExactDecimal("0", { strictlyPositive: true })).toThrow("NON_POSITIVE_DECIMAL");
  });
});
