import { createExactClinicalDecimal } from "./value-objects.ts";
import type { ExactClinicalDecimal } from "./types.ts";

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:[.,]\d+)?$/;

type Rational = Readonly<{ numerator: bigint; denominator: bigint }>;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function reduce(value: Rational): Rational {
  const divisor = gcd(value.numerator, value.denominator);
  return { numerator: value.numerator / divisor, denominator: value.denominator / divisor };
}

export function parseClinicalDecimal(input: string): ExactClinicalDecimal {
  if (!DECIMAL.test(input) || (input.includes(",") && input.includes("."))) throw new Error("AMBIGUOUS_CLINICAL_DECIMAL");
  const canonical = input.replace(",", ".");
  return createExactClinicalDecimal(canonical);
}

export function decimalToRational(value: ExactClinicalDecimal): Rational {
  return reduce({ numerator: BigInt(value.scaledInteger), denominator: 10n ** BigInt(value.scale) });
}

export function rationalToClinicalDecimal(value: Rational): ExactClinicalDecimal {
  const reduced = reduce(value);
  let denominator = reduced.denominator;
  if (denominator <= 0n) throw new Error("INVALID_RATIONAL");
  let scale = 0;
  let multiplier = 1n;
  while (denominator % 2n === 0n) {
    denominator /= 2n;
    multiplier *= 5n;
    scale += 1;
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n;
    multiplier *= 2n;
    scale += 1;
  }
  if (denominator !== 1n) throw new Error("NON_TERMINATING_CLINICAL_DECIMAL");
  const scaled = reduced.numerator * multiplier;
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale) || "0";
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return createExactClinicalDecimal(`${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`);
}

export function addRational(left: Rational, right: Rational): Rational {
  return reduce({ numerator: left.numerator * right.denominator + right.numerator * left.denominator, denominator: left.denominator * right.denominator });
}

export function multiplyRational(left: Rational, right: Rational): Rational {
  return reduce({ numerator: left.numerator * right.numerator, denominator: left.denominator * right.denominator });
}

export function compareClinicalDecimal(value: ExactClinicalDecimal, limit: ExactClinicalDecimal): number {
  const left = decimalToRational(value);
  const right = decimalToRational(limit);
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
