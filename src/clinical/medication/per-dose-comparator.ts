import { decimalToCanonicalString, parseExactDecimal } from "./decimal.ts";
import type { MedicationDoseRule, MedicationUnit } from "./types.ts";

export type MedicationPerDoseComparison = Readonly<{
  status: "within" | "outside" | "insufficient_data" | "requires_professional_review";
  amount: string | null;
  lower: string | null;
  upper: string | null;
  explanationCodes: readonly string[];
}>;

const FACTORS: Readonly<Record<string, string>> = { mcg: "0.001", mg: "1", g: "1000" };

function convert(value: string, from: MedicationUnit, to: MedicationUnit): string | null {
  if (from === to) return decimalToCanonicalString(parseExactDecimal(value));
  const fromFactor = FACTORS[from];
  const toFactor = FACTORS[to];
  if (!fromFactor || !toFactor) return null;
  return parseExactDecimal(value).value.mul(parseExactDecimal(fromFactor).value).div(parseExactDecimal(toFactor).value).toFixed();
}

export function compareMedicationPerDose(input: Readonly<{ amount: string; unit: MedicationUnit; weightKg: string | null; rule: MedicationDoseRule }>): MedicationPerDoseComparison {
  if (!input.rule.perDoseUnit) return { status: "insufficient_data", amount: null, lower: null, upper: null, explanationCodes: ["PER_DOSE_UNIT_UNAVAILABLE"] };
  try { parseExactDecimal(input.amount, { strictlyPositive: true }); } catch {
    return { status: "insufficient_data", amount: null, lower: null, upper: null, explanationCodes: ["DECLARED_DOSE_INVALID"] };
  }
  const amount = convert(input.amount, input.unit, input.rule.perDoseUnit);
  if (amount === null) return { status: "insufficient_data", amount: null, lower: null, upper: null, explanationCodes: ["DOSE_DIMENSION_MISMATCH"] };
  const actual = parseExactDecimal(amount).value;
  let lower;
  let upper;
  try {
    lower = input.rule.perDoseMin ? parseExactDecimal(input.rule.perDoseMin, { strictlyPositive: true }).value : null;
    upper = input.rule.perDoseMax ? parseExactDecimal(input.rule.perDoseMax, { strictlyPositive: true }).value : null;
  } catch {
    return { status: "requires_professional_review", amount, lower: null, upper: null, explanationCodes: ["REFERENCE_LIMIT_INVALID"] };
  }
  if (input.rule.perKgMin || input.rule.perKgMax) {
    if (input.weightKg === null) return { status: "insufficient_data", amount, lower: null, upper: null, explanationCodes: ["WEIGHT_REQUIRED_FOR_RULE"] };
    let weight;
    let derivedLower;
    let derivedUpper;
    try { weight = parseExactDecimal(input.weightKg, { strictlyPositive: true }).value; } catch {
      return { status: "insufficient_data", amount, lower: lower?.toFixed() ?? null, upper: upper?.toFixed() ?? null, explanationCodes: ["WEIGHT_INPUT_INVALID"] };
    }
    try {
      derivedLower = input.rule.perKgMin ? weight.mul(parseExactDecimal(input.rule.perKgMin, { strictlyPositive: true }).value) : null;
      derivedUpper = input.rule.perKgMax ? weight.mul(parseExactDecimal(input.rule.perKgMax, { strictlyPositive: true }).value) : null;
    } catch {
      return { status: "requires_professional_review", amount, lower: lower?.toFixed() ?? null, upper: upper?.toFixed() ?? null, explanationCodes: ["REFERENCE_LIMIT_INVALID"] };
    }
    if (derivedLower) lower = lower === null || derivedLower.gt(lower) ? derivedLower : lower;
    if (derivedUpper) upper = upper === null ? derivedUpper : DecimalMin(upper, derivedUpper);
  }
  if (input.rule.absoluteSingleMax) {
    let absolute;
    try { absolute = parseExactDecimal(input.rule.absoluteSingleMax, { strictlyPositive: true }).value; } catch {
      return { status: "requires_professional_review", amount, lower: lower?.toFixed() ?? null, upper: upper?.toFixed() ?? null, explanationCodes: ["REFERENCE_LIMIT_INVALID"] };
    }
    upper = upper === null ? absolute : DecimalMin(upper, absolute);
  }
  if (lower === null && upper === null) return { status: "insufficient_data", amount, lower: null, upper: null, explanationCodes: ["REFERENCE_LIMIT_UNAVAILABLE"] };
  if (lower !== null && upper !== null && lower.gt(upper)) return { status: "requires_professional_review", amount, lower: lower.toFixed(), upper: upper.toFixed(), explanationCodes: ["REFERENCE_LIMITS_CONFLICT"] };
  const within = (lower === null || actual.gte(lower)) && (upper === null || actual.lte(upper));
  return { status: within ? "within" : "outside", amount, lower: lower?.toFixed() ?? null, upper: upper?.toFixed() ?? null, explanationCodes: [within ? "PER_DOSE_WITHIN_REFERENCE" : "PER_DOSE_OUTSIDE_REFERENCE"] };
}

export type PerDoseComparisonInput = Readonly<{ amount: string; unit: MedicationUnit; weightKg: string | null; rule: MedicationDoseRule }>;
export type PerDoseBound = Readonly<{ lower: string | null; upper: string | null }>;
export type IngredientPerDoseComparison = MedicationPerDoseComparison;
export const comparePerDoseLimits = compareMedicationPerDose;

function DecimalMin(left: import("decimal.js").default, right: import("decimal.js").default) {
  return left.lte(right) ? left : right;
}
