import { compareCalendarDates } from "./calendar.ts";
import type { AntigenId, ImmunizationRule } from "./types.ts";

export type CatchUpAdministration = Readonly<{ administeredOn: string; antigenIds: readonly AntigenId[]; validity: "valid" | "invalid" | "review_required" }>;
export type CatchUpInput = Readonly<{ rule: ImmunizationRule; administrations: readonly CatchUpAdministration[]; childBirthDate: string; asOfDate: string }>;
export type CatchUpEvaluation = Readonly<{ status: "eligible" | "applied" | "review_required" | "not_applicable"; nextDoseNumber: number | null; reasonCode: string }>;
export type CatchUpRuleResult = CatchUpEvaluation;

export function evaluateCatchUp(input: CatchUpInput, _pack?: unknown): CatchUpEvaluation {
  if (!input.rule.catchUp) return { status: "not_applicable", nextDoseNumber: null, reasonCode: "CATCH_UP_NOT_ALLOWED" };
  if (input.administrations.some((administration) => administration.validity === "review_required")) return { status: "review_required", nextDoseNumber: null, reasonCode: "HISTORY_REVIEW_REQUIRED" };
  const matching = input.administrations.filter((administration) => administration.validity === "valid" && administration.antigenIds.includes(input.rule.antigenId)).sort((left, right) => compareCalendarDates(left.administeredOn, right.administeredOn));
  const ambiguous = input.administrations.some((administration) => administration.validity === "valid" && !administration.antigenIds.includes(input.rule.antigenId));
  if (ambiguous) return { status: "review_required", nextDoseNumber: null, reasonCode: "PRODUCT_OR_ANTIGEN_HISTORY_AMBIGUOUS" };
  if (matching.length >= input.rule.doseNumber) return { status: "applied", nextDoseNumber: null, reasonCode: "DOSE_ALREADY_SATISFIED" };
  return { status: "eligible", nextDoseNumber: input.rule.doseNumber, reasonCode: "CATCH_UP_ELIGIBLE" };
}
