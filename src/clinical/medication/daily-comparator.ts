import { parseExactDecimal } from "./decimal.ts";
import type { MedicationDoseRule, MedicationFrequency, MedicationUnit } from "./types.ts";

const MASS_FACTORS: Readonly<Record<string, string>> = { mcg: "0.001", mg: "1", g: "1000" };

export type MedicationDailyComparison = Readonly<{
  status: "within" | "outside" | "insufficient_data" | "requires_professional_review";
  dailyAmount: string | null;
  expectedDoses: string | null;
  explanationCodes: readonly string[];
}>;

export function compareMedicationDailyExposure(input: Readonly<{ perDoseAmount: string; perDoseUnit: MedicationUnit; frequency: MedicationFrequency; rule: MedicationDoseRule }>): MedicationDailyComparison {
  if (!input.rule.dailyMax || !input.rule.dailyUnit) return { status: "insufficient_data", dailyAmount: null, expectedDoses: null, explanationCodes: ["DAILY_LIMIT_UNAVAILABLE"] };
  if (input.frequency.kind === "as_needed") return { status: "requires_professional_review", dailyAmount: null, expectedDoses: null, explanationCodes: ["PRN_FREQUENCY_NOT_EXPANDED"] };
  let perDose;
  try { perDose = parseExactDecimal(input.perDoseAmount, { strictlyPositive: true }).value; } catch {
    return { status: "insufficient_data", dailyAmount: null, expectedDoses: null, explanationCodes: ["DECLARED_DOSE_INVALID"] };
  }
  let dailyLimit;
  try { dailyLimit = parseExactDecimal(input.rule.dailyMax, { strictlyPositive: true }).value; } catch {
    return { status: "requires_professional_review", dailyAmount: null, expectedDoses: null, explanationCodes: ["DAILY_REFERENCE_INVALID"] };
  }
  let expectedDoses;
  if (input.frequency.kind === "times_of_day") {
    if (new Set(input.frequency.times).size !== input.frequency.times.length) return { status: "requires_professional_review", dailyAmount: null, expectedDoses: null, explanationCodes: ["DUPLICATE_DECLARED_TIMES"] };
    if (input.frequency.times.length === 0) return { status: "insufficient_data", dailyAmount: null, expectedDoses: null, explanationCodes: ["DECLARED_FREQUENCY_INVALID"] };
    if (input.rule.minimumIntervalHours) {
      let minimumMinutes;
      try { minimumMinutes = parseExactDecimal(input.rule.minimumIntervalHours, { strictlyPositive: true }).value.mul(60); } catch {
        return { status: "requires_professional_review", dailyAmount: null, expectedDoses: null, explanationCodes: ["DAILY_REFERENCE_INVALID"] };
      }
      const minutes = input.frequency.times.map((time) => {
        const [hour, minute] = time.split(":").map(Number);
        return hour! * 60 + minute!;
      }).sort((left, right) => left - right);
      const intervals = minutes.map((value, index) => {
        const next = index === minutes.length - 1 ? minutes[0]! + 24 * 60 : minutes[index + 1]!;
        return next - value;
      });
      if (intervals.some((interval) => minimumMinutes.gt(interval))) {
        return { status: "outside", dailyAmount: null, expectedDoses: String(minutes.length), explanationCodes: ["MINIMUM_INTERVAL_EXCEEDED"] };
      }
    }
    expectedDoses = parseExactDecimal(String(input.frequency.times.length), { strictlyPositive: true });
  } else {
    let interval;
    try { interval = parseExactDecimal(input.frequency.everyHours, { strictlyPositive: true }).value; } catch {
      return { status: "insufficient_data", dailyAmount: null, expectedDoses: null, explanationCodes: ["DECLARED_FREQUENCY_INVALID"] };
    }
    const day = parseExactDecimal("24").value;
    const count = day.div(interval);
    if (!count.isInteger()) return { status: "requires_professional_review", dailyAmount: null, expectedDoses: null, explanationCodes: ["NON_INTEGRAL_DAILY_FREQUENCY"] };
    if (input.rule.minimumIntervalHours) {
      let minimumInterval;
      try { minimumInterval = parseExactDecimal(input.rule.minimumIntervalHours, { strictlyPositive: true }).value; } catch {
        return { status: "requires_professional_review", dailyAmount: null, expectedDoses: count.toFixed(), explanationCodes: ["DAILY_REFERENCE_INVALID"] };
      }
      if (interval.lt(minimumInterval)) return { status: "outside", dailyAmount: null, expectedDoses: count.toFixed(), explanationCodes: ["MINIMUM_INTERVAL_EXCEEDED"] };
    }
    expectedDoses = { value: count, lexeme: count.toFixed() };
  }
  const fromFactor = MASS_FACTORS[input.perDoseUnit];
  const toFactor = MASS_FACTORS[input.rule.dailyUnit];
  const amountFactor = input.perDoseUnit === input.rule.dailyUnit
    ? parseExactDecimal("1").value
    : fromFactor && toFactor
      ? parseExactDecimal(fromFactor).value.div(parseExactDecimal(toFactor).value)
      : null;
  if (amountFactor === null) return { status: "insufficient_data", dailyAmount: null, expectedDoses: expectedDoses.lexeme, explanationCodes: ["DAILY_UNIT_DIMENSION_MISMATCH"] };
  const dailyAmount = perDose.mul(expectedDoses.value).mul(amountFactor);
  const within = dailyAmount.lte(dailyLimit);
  return { status: within ? "within" : "outside", dailyAmount: dailyAmount.toFixed(), expectedDoses: expectedDoses.lexeme, explanationCodes: [within ? "DAILY_WITHIN_REFERENCE" : "DAILY_OUTSIDE_REFERENCE"] };
}

export type DailyExposureInput = Readonly<{ perDoseAmount: string; perDoseUnit: MedicationUnit; frequency: MedicationFrequency; rule: MedicationDoseRule }>;
export type FrequencyInterpretation = Readonly<{ expectedDoses: string; explanationCodes: readonly string[] }>;
export type IngredientDailyComparison = MedicationDailyComparison;
export const compareDailyAndAbsoluteLimits = compareMedicationDailyExposure;
