import { parseExactDecimal } from "./decimal.ts";
import type { MedicationDoseRule, MedicationRoute } from "./types.ts";

export type MedicationDoseRuleQuery = Readonly<{
  conceptCode: string;
  route: MedicationRoute;
  ageDays: number;
  weightKg: string | null;
  indicationCode: string | null;
  exclusionCodes?: readonly string[];
}>;

export type MedicationDoseRuleResolution = Readonly<{
  status: "resolved" | "insufficient_data" | "requires_professional_review";
  rule: MedicationDoseRule | null;
  explanationCodes: readonly string[];
}>;

function inRange(value: number, min: number | null, max: number | null): boolean {
  return (min === null || value >= min) && (max === null || value <= max);
}

function weightInRange(value: string | null, min: string | null, max: string | null): boolean {
  if (min === null && max === null) return true;
  if (value === null) return false;
  const decimal = parseExactDecimal(value).value;
  return (min === null || decimal.gte(parseExactDecimal(min).value)) && (max === null || decimal.lte(parseExactDecimal(max).value));
}

export function selectMedicationDoseRule(query: MedicationDoseRuleQuery, rules: readonly MedicationDoseRule[]): MedicationDoseRuleResolution {
  const candidates = rules.filter((rule) => rule.conceptCode === query.conceptCode
    && rule.route === query.route
    && inRange(query.ageDays, rule.minAgeDays, rule.maxAgeDays)
    && weightInRange(query.weightKg, rule.minWeightKg, rule.maxWeightKg)
    && (rule.indicationCode === null || rule.indicationCode === query.indicationCode));
  if (query.exclusionCodes?.some((code) => candidates.some((rule) => rule.exclusions.includes(code)))) {
    return { status: "requires_professional_review", rule: null, explanationCodes: ["EXCLUSION_TAKES_PRECEDENCE"] };
  }
  if (candidates.length === 1) return { status: "resolved", rule: candidates[0]!, explanationCodes: ["EXACT_RULE"] };
  if (candidates.length > 1) return { status: "requires_professional_review", rule: null, explanationCodes: ["OVERLAPPING_RULES"] };
  return { status: "insufficient_data", rule: null, explanationCodes: ["NO_EXACT_RULE"] };
}

export type DoseLimitSelectionInput = MedicationDoseRuleQuery;
export type DoseLimitRule = MedicationDoseRule;
export type DoseLimitSelection = MedicationDoseRuleResolution;
export const selectDoseLimitRule = selectMedicationDoseRule;
