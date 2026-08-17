import { parseExactDecimal } from "./decimal.ts";
import type { MedicationDoseRule, MedicationFrequency, MedicationUnit } from "./types.ts";

export type MedicationDailyComparison = Readonly<{
  status: "within" | "outside" | "insufficient_data" | "requires_professional_review";
  dailyAmount: string | null;
  expectedDoses: string | null;
  explanationCodes: readonly string[];
}>;

export function compareMedicationDailyExposure(input: Readonly<{ perDoseAmount: string; perDoseUnit: MedicationUnit; frequency: MedicationFrequency; rule: MedicationDoseRule }>): MedicationDailyComparison {
  if (!input.rule.dailyMax || !input.rule.dailyUnit) return { status: "insufficient_data", dailyAmount: null, expectedDoses: null, explanationCodes: ["DAILY_LIMIT_UNAVAILABLE"] };
  if (input.frequency.kind === "as_needed") return { status: "requires_professional_review", dailyAmount: null, expectedDoses: null, explanationCodes: ["PRN_FREQUENCY_NOT_EXPANDED"] };
  let expectedDoses;
  if (input.frequency.kind === "times_of_day") {
    expectedDoses = parseExactDecimal(String(input.frequency.times.length), { strictlyPositive: true });
  } else {
    const interval = parseExactDecimal(input.frequency.everyHours, { strictlyPositive: true }).value;
    const day = parseExactDecimal("24").value;
    const count = day.div(interval);
    if (!count.isInteger()) return { status: "requires_professional_review", dailyAmount: null, expectedDoses: null, explanationCodes: ["NON_INTEGRAL_DAILY_FREQUENCY"] };
    if (input.rule.minimumIntervalHours && interval.lt(parseExactDecimal(input.rule.minimumIntervalHours).value)) {
      return { status: "outside", dailyAmount: null, expectedDoses: count.toFixed(), explanationCodes: ["MINIMUM_INTERVAL_EXCEEDED"] };
    }
    expectedDoses = { value: count, lexeme: count.toFixed() };
  }
  const amountFactor = input.perDoseUnit === input.rule.dailyUnit ? parseExactDecimal("1").value : null;
  if (amountFactor === null) return { status: "insufficient_data", dailyAmount: null, expectedDoses: expectedDoses.lexeme, explanationCodes: ["DAILY_UNIT_DIMENSION_MISMATCH"] };
  const dailyAmount = parseExactDecimal(input.perDoseAmount).value.mul(expectedDoses.value).mul(amountFactor);
  const within = dailyAmount.lte(parseExactDecimal(input.rule.dailyMax).value);
  return { status: within ? "within" : "outside", dailyAmount: dailyAmount.toFixed(), expectedDoses: expectedDoses.lexeme, explanationCodes: [within ? "DAILY_WITHIN_REFERENCE" : "DAILY_OUTSIDE_REFERENCE"] };
}

export type DailyExposureInput = Readonly<{ perDoseAmount: string; perDoseUnit: MedicationUnit; frequency: MedicationFrequency; rule: MedicationDoseRule }>;
export type FrequencyInterpretation = Readonly<{ expectedDoses: string; explanationCodes: readonly string[] }>;
export type IngredientDailyComparison = MedicationDailyComparison;
export const compareDailyAndAbsoluteLimits = compareMedicationDailyExposure;
