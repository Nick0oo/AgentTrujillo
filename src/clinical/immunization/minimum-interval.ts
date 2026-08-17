import { addCalendarInterval, compareCalendarDates, subtractCalendarInterval } from "./calendar.ts";
import type { CalendarDate, CalendarInterval, DoseValidity, ImmunizationRule, MinimumIntervalEvidence } from "./types.ts";
export type { MinimumIntervalEvidence } from "./types.ts";

export type CalendarBoundaryResult = Readonly<{ valid: boolean; earliestDate: string; reasonCode: string }>;

export function evaluateMinimumAge(dateOfBirth: string, minimumAge: CalendarInterval, administeredOn: string): CalendarBoundaryResult {
  const earliestDate = addCalendarInterval(dateOfBirth, minimumAge);
  return { valid: compareCalendarDates(administeredOn, earliestDate) >= 0, earliestDate, reasonCode: "MINIMUM_AGE" };
}

export function evaluateMinimumInterval(previousAdministrationOn: string, minimumInterval: CalendarInterval, administeredOn: string): CalendarBoundaryResult {
  const earliestDate = addCalendarInterval(previousAdministrationOn, minimumInterval);
  return { valid: compareCalendarDates(administeredOn, earliestDate) >= 0, earliestDate, reasonCode: "MINIMUM_INTERVAL" };
}

export type AdministrationValidityInput = Readonly<{ administeredOn: string; valid?: boolean; validity?: DoseValidity }>;
export type AdministrationValidityResult = Readonly<{
  validity: DoseValidity;
  reasonCode: string;
  earliestDate: string | null;
  ruleId: ImmunizationRule["id"];
  sourceReferences: readonly string[];
  evidence: MinimumIntervalEvidence | null;
  graceApplied: boolean;
}>;
export type ChildAgeContext = string | Readonly<{ dateOfBirth: string; administeredOn?: string }>;
export type MinimumIntervalPolicy = Readonly<{ administeredOn?: string; allowGrace?: boolean }>;

function result(rule: ImmunizationRule, validity: DoseValidity, reasonCode: string, earliestDate: string | null, evidence: MinimumIntervalEvidence | null, graceApplied = false): AdministrationValidityResult {
  return Object.freeze({ validity, reasonCode, earliestDate, ruleId: rule.id, sourceReferences: Object.freeze([...rule.sourceReferences]), evidence, graceApplied });
}

function boundaryWithGrace(earliestDate: string, rule: ImmunizationRule, policy: MinimumIntervalPolicy): Readonly<{ effectiveEarliestDate: CalendarDate; graceConfigured: boolean }> {
  const grace = policy.allowGrace === true ? rule.gracePeriod ?? null : null;
  return grace
    ? { effectiveEarliestDate: subtractCalendarInterval(earliestDate, grace), graceConfigured: true }
    : { effectiveEarliestDate: earliestDate as CalendarDate, graceConfigured: false };
}

export function evaluateAdministrationValidity(rule: ImmunizationRule, administrations: readonly AdministrationValidityInput[], childAge: ChildAgeContext, policy: MinimumIntervalPolicy | string): AdministrationValidityResult {
  const childBirthDate = typeof childAge === "string" ? childAge : childAge.dateOfBirth;
  const policyValue = typeof policy === "string" ? { administeredOn: policy } : policy;
  const administeredOn = policyValue.administeredOn ?? (typeof childAge === "string" ? childAge : childAge.administeredOn ?? childBirthDate);
  let boundaryEvidence: MinimumIntervalEvidence | null = null;
  let graceApplied = false;
  if (rule.minimumAge) {
    const age = evaluateMinimumAge(childBirthDate, rule.minimumAge, administeredOn);
    const boundary = boundaryWithGrace(age.earliestDate, rule, policyValue);
    const valid = compareCalendarDates(administeredOn, boundary.effectiveEarliestDate) >= 0;
    const evidence: MinimumIntervalEvidence = { basis: "birth_date", priorAdministrationOn: childBirthDate as CalendarDate, minimumInterval: rule.minimumAge, earliestEligibleOn: age.earliestDate as CalendarDate, graceApplied: boundary.graceConfigured && !age.valid && valid, valid };
    boundaryEvidence = evidence;
    graceApplied = evidence.graceApplied && evidence.valid;
    if (!evidence.valid) return result(rule, "invalid", "MINIMUM_AGE_NOT_MET", age.earliestDate, evidence, evidence.graceApplied);
    if (boundary.graceConfigured && !age.valid) return result(rule, "valid", "DOSE_VALID_WITH_GRACE", null, evidence, true);
  }
  if (rule.contraindicationReviewRequired) return result(rule, "review_required", "CONTRAINDICATION_REVIEW_REQUIRED", null, null);
  if (rule.minimumInterval) {
    const previous = administrations.filter((administration) => administration.valid !== false && administration.validity !== "invalid" && administration.validity !== "review_required" && compareCalendarDates(administration.administeredOn, administeredOn) < 0).sort((left, right) => compareCalendarDates(left.administeredOn, right.administeredOn)).at(-1);
    if (previous) {
      const interval = evaluateMinimumInterval(previous.administeredOn, rule.minimumInterval, administeredOn);
      const boundary = boundaryWithGrace(interval.earliestDate, rule, policyValue);
      const valid = compareCalendarDates(administeredOn, boundary.effectiveEarliestDate) >= 0;
      const evidence: MinimumIntervalEvidence = { basis: "prior_administration", priorAdministrationOn: previous.administeredOn as CalendarDate, minimumInterval: rule.minimumInterval, earliestEligibleOn: interval.earliestDate as CalendarDate, graceApplied: boundary.graceConfigured && !interval.valid && valid, valid };
      boundaryEvidence = evidence;
      graceApplied = evidence.graceApplied && evidence.valid;
      if (!evidence.valid) return result(rule, "invalid", "MINIMUM_INTERVAL_NOT_MET", interval.earliestDate, evidence, evidence.graceApplied);
      if (boundary.graceConfigured && !interval.valid) return result(rule, "valid", "DOSE_VALID_WITH_GRACE", null, evidence, true);
    }
  }
  return result(rule, "valid", graceApplied ? "DOSE_VALID_WITH_GRACE" : "DOSE_VALID", null, boundaryEvidence, graceApplied);
}
