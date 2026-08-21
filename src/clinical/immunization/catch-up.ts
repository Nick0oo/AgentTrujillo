import { addCalendarInterval, compareCalendarDates, isCalendarDate } from "./calendar.ts";
import type { AntigenId, ImmunizationCountry, ImmunizationRule } from "./types.ts";

export type CatchUpAdministration = Readonly<{ administeredOn: string; antigenIds: readonly AntigenId[]; countryCode: ImmunizationCountry; productResolution?: "resolved" | "ambiguous" | "unknown"; validity: "valid" | "invalid" | "review_required" }>;
export type CatchUpInput = Readonly<{ rule: ImmunizationRule; administrations: readonly CatchUpAdministration[]; childBirthDate: string; asOfDate: string }>;
export type CatchUpEvaluation = Readonly<{ status: "eligible" | "applied" | "review_required" | "not_applicable"; nextDoseNumber: number | null; reasonCode: string }>;
export type CatchUpRuleResult = CatchUpEvaluation;

export function evaluateCatchUp(input: CatchUpInput, _pack?: unknown): CatchUpEvaluation {
  if (!isCalendarDate(input.childBirthDate) || !isCalendarDate(input.asOfDate) || compareCalendarDates(input.childBirthDate, input.asOfDate) > 0) return { status: "review_required", nextDoseNumber: null, reasonCode: "TRUSTED_DATE_CONTEXT_INVALID" };
  if (!input.rule.catchUp) return { status: "not_applicable", nextDoseNumber: null, reasonCode: "CATCH_UP_NOT_ALLOWED" };
  if (["special_population", "campaign", "outbreak", "review_only"].includes(input.rule.kind)
    || Object.keys(input.rule.eligibilityCriteria).length > 0 || input.rule.contraindicationReviewRequired) return { status: "review_required", nextDoseNumber: null, reasonCode: "CATCH_UP_CRITERIA_REQUIRES_REVIEW" };
  const relevant = input.administrations.filter((administration) => administration.antigenIds.includes(input.rule.antigenId));
  if (relevant.some((administration) => !isCalendarDate(administration.administeredOn)
    || compareCalendarDates(administration.administeredOn, input.childBirthDate) < 0
    || compareCalendarDates(administration.administeredOn, input.asOfDate) > 0)) return { status: "review_required", nextDoseNumber: null, reasonCode: "HISTORY_DATE_INVALID" };
  if (relevant.some((administration) => administration.validity === "review_required")) return { status: "review_required", nextDoseNumber: null, reasonCode: "HISTORY_REVIEW_REQUIRED" };
  if (relevant.some((administration) => administration.countryCode !== input.rule.countryCode)) return { status: "review_required", nextDoseNumber: null, reasonCode: "CROSS_COUNTRY_HISTORY" };
  if (relevant.some((administration) => administration.productResolution === "ambiguous" || administration.productResolution === "unknown")) return { status: "review_required", nextDoseNumber: null, reasonCode: "PRODUCT_OR_ANTIGEN_HISTORY_AMBIGUOUS" };
  const matching = relevant.filter((administration) => administration.countryCode === input.rule.countryCode && administration.validity === "valid").sort((left, right) => compareCalendarDates(left.administeredOn, right.administeredOn));
  if (matching.length >= input.rule.doseNumber) return { status: "applied", nextDoseNumber: null, reasonCode: "DOSE_ALREADY_SATISFIED" };
  if (input.rule.minimumAge !== null && compareCalendarDates(input.asOfDate, addCalendarInterval(input.childBirthDate, input.rule.minimumAge)) < 0) return { status: "not_applicable", nextDoseNumber: null, reasonCode: "MINIMUM_AGE_NOT_REACHED" };
  if (input.rule.targetAgeUntil !== null && compareCalendarDates(input.asOfDate, addCalendarInterval(input.childBirthDate, input.rule.targetAgeUntil)) > 0) return { status: "not_applicable", nextDoseNumber: null, reasonCode: "CATCH_UP_AGE_WINDOW_EXPIRED" };
  if (input.rule.doseNumber > 1 && matching.length < input.rule.doseNumber - 1) return { status: "review_required", nextDoseNumber: null, reasonCode: "PRIOR_VALID_DOSE_REQUIRED" };
  if (input.rule.minimumInterval !== null && matching.length > 0) {
    const last = matching.at(-1)!;
    if (compareCalendarDates(input.asOfDate, addCalendarInterval(last.administeredOn, input.rule.minimumInterval)) < 0) return { status: "not_applicable", nextDoseNumber: input.rule.doseNumber, reasonCode: "MINIMUM_INTERVAL_NOT_REACHED" };
  }
  return { status: "eligible", nextDoseNumber: input.rule.doseNumber, reasonCode: "CATCH_UP_ELIGIBLE" };
}
