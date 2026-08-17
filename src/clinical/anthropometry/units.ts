import { addRational, decimalToRational, multiplyRational, parseClinicalDecimal, rationalToClinicalDecimal } from "./decimal.ts";
import type { AnthropometricUnit, MeasurementType, NormalizedMeasurementValue } from "./types.ts";

export const UNIT_CONVERSION_VERSION = "anthropometry-units.v1";

function assertPositive(value: ReturnType<typeof parseClinicalDecimal>): void {
  if (value.sign !== 1) throw new Error("NON_POSITIVE_MEASUREMENT");
}

function factor(numerator: bigint, denominator: bigint) {
  return { numerator, denominator };
}

function convert(value: ReturnType<typeof parseClinicalDecimal>, conversion: { numerator: bigint; denominator: bigint }) {
  return rationalToClinicalDecimal(multiplyRational(decimalToRational(value), factor(conversion.numerator, conversion.denominator)));
}

function isWeight(type: MeasurementType): boolean {
  return type === "weight";
}

function isLength(type: MeasurementType): boolean {
  return type === "recumbent_length" || type === "standing_height" || type === "head_circumference";
}

export function normalizeAnthropometricUnit(
  type: MeasurementType,
  rawValue: string | Readonly<{ pounds: string; ounces: string }>,
  unit: AnthropometricUnit,
): NormalizedMeasurementValue {
  if (unit === "lb_oz") {
    if (!isWeight(type) || typeof rawValue === "string") throw new Error("UNIT_TYPE_MISMATCH");
    const pounds = parseClinicalDecimal(rawValue.pounds);
    const ounces = parseClinicalDecimal(rawValue.ounces);
    assertPositive(pounds);
    if (ounces.sign < 0 || Number(ounces.canonical) >= 16) throw new Error("INVALID_OUNCES");
    const totalOunces = addRational(multiplyRational(decimalToRational(pounds), factor(16n, 1n)), decimalToRational(ounces));
    const normalized = rationalToClinicalDecimal(multiplyRational(totalOunces, factor(45359237n, 1600000000n)));
    return Object.freeze({
      original: rationalToClinicalDecimal(totalOunces),
      originalUnit: unit,
      normalized,
      normalizedUnit: "kg",
      conversionVersion: UNIT_CONVERSION_VERSION,
      roundingMode: "none",
    });
  }
  if (typeof rawValue !== "string") throw new Error("VALUE_SHAPE_INVALID");
  const original = parseClinicalDecimal(rawValue);
  assertPositive(original);
  if (isWeight(type) && !["kg", "g", "lb", "oz"].includes(unit)) throw new Error("UNIT_TYPE_MISMATCH");
  if (isLength(type) && !["cm", "mm", "in"].includes(unit)) throw new Error("UNIT_TYPE_MISMATCH");
  if (!isWeight(type) && !isLength(type)) throw new Error("MEASUREMENT_TYPE_UNSUPPORTED");
  const conversion = unit === "kg" || unit === "cm"
    ? factor(1n, 1n)
    : unit === "g" ? factor(1n, 1000n)
      : unit === "lb" ? factor(45359237n, 100000000n)
        : unit === "oz" ? factor(45359237n, 1600000000n)
          : unit === "mm" ? factor(1n, 10n)
            : factor(254n, 100n);
  const normalized = (unit === "kg" || unit === "cm") ? original : convert(original, conversion);
  return Object.freeze({
    original,
    originalUnit: unit,
    normalized,
    normalizedUnit: isWeight(type) ? "kg" : "cm",
    conversionVersion: UNIT_CONVERSION_VERSION,
    roundingMode: "none",
  });
}

export type { AnthropometricUnit } from "./types.ts";
