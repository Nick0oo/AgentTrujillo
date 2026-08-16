import { deepFreeze } from "./message-types";
import type { MeasurementMethod, MeasurementUnit } from "./measurement-units";

export type ExactDecimal = Readonly<{
  numerator: bigint;
  denominator: bigint;
  scale: number;
  text: string;
}>;

export type TemperatureMeasurement = Readonly<{
  status: "valid" | "ambiguous" | "invalid";
  original: string;
  unit: MeasurementUnit;
  milliCelsius: ExactDecimal | null;
  method: MeasurementMethod;
  ambiguity: "none" | "approximate" | "range" | "implausible" | "conversion_precision" | "invalid" | "conflicting";
}>;

export class MeasurementError extends Error {
  readonly code: "INVALID_DECIMAL" | "UNSUPPORTED_UNIT" | "OVERFLOW";
  constructor(code: MeasurementError["code"]) { super(code); this.name = "MeasurementError"; this.code = code; }
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function decimal(value: string): ExactDecimal {
  const normalized = value.trim().replace(",", ".");
  if (!/^-?(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/u.test(normalized)) throw new MeasurementError("INVALID_DECIMAL");
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || "0");
  const sign = negative ? -1n : 1n;
  const divisor = gcd(sign * numerator, denominator);
  return deepFreeze({ numerator: (sign * numerator) / divisor, denominator: denominator / divisor, scale: fraction.length, text: normalized });
}

function add(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  const numerator = left.numerator * right.denominator + right.numerator * left.denominator;
  const denominator = left.denominator * right.denominator;
  const divisor = gcd(numerator, denominator);
  return deepFreeze({ numerator: numerator / divisor, denominator: denominator / divisor, scale: Math.max(left.scale, right.scale), text: `${numerator}/${denominator}` });
}

function multiply(left: ExactDecimal, numerator: bigint, denominator: bigint): ExactDecimal {
  const n = left.numerator * numerator;
  const d = left.denominator * denominator;
  const divisor = gcd(n, d);
  return deepFreeze({ numerator: n / divisor, denominator: d / divisor, scale: left.scale, text: `${n}/${d}` });
}

export function normalizeTemperature(value: string, unit: string, method: MeasurementMethod = "unknown"): TemperatureMeasurement {
  const parsed = decimal(value);
  const normalizedUnit = unit.trim().toLocaleLowerCase("en-US") as MeasurementUnit;
  if (normalizedUnit !== "celsius" && normalizedUnit !== "fahrenheit") throw new MeasurementError("UNSUPPORTED_UNIT");
  const milliCelsius = normalizedUnit === "celsius"
    ? multiply(parsed, 1000n, 1n)
    : multiply(multiply(add(parsed, decimal("-32")), 5n, 9n), 1000n, 1n);
  const approximate = milliCelsius.numerator < -100_000n * milliCelsius.denominator || milliCelsius.numerator > 200_000n * milliCelsius.denominator;
  return deepFreeze({ status: approximate ? "ambiguous" : "valid", original: value, unit: normalizedUnit, milliCelsius, method, ambiguity: approximate ? "implausible" : "none" });
}

export function compareExact(left: ExactDecimal, right: ExactDecimal): -1 | 0 | 1 {
  const result = left.numerator * right.denominator - right.numerator * left.denominator;
  return result < 0n ? -1 : result > 0n ? 1 : 0;
}

export function parseExactDecimal(value: string): ExactDecimal { return decimal(value); }
