import { addCalendarInterval, compareCalendarDates } from "./calendar.ts";
import type { CalendarInterval, DoseValidity, ImmunizationRule } from "./types.ts";
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
export type AdministrationValidityResult = Readonly<{ validity: DoseValidity; reasonCode: string; earliestDate: string | null }>;
export type ChildAgeContext = string | Readonly<{ dateOfBirth: string; administeredOn?: string }>;
export type MinimumIntervalPolicy = Readonly<{ administeredOn?: string }>;

export function evaluateAdministrationValidity(rule: ImmunizationRule, administrations: readonly AdministrationValidityInput[], childAge: ChildAgeContext, policy: MinimumIntervalPolicy | string): AdministrationValidityResult {
  const childBirthDate = typeof childAge === "string" ? childAge : childAge.dateOfBirth;
  const administeredOn = typeof policy === "string" ? policy : policy.administeredOn ?? (typeof childAge === "string" ? childAge : childAge.administeredOn ?? childBirthDate);
  if (rule.minimumAge) {
    const age = evaluateMinimumAge(childBirthDate, rule.minimumAge, administeredOn);
    if (!age.valid) return { validity: "invalid", reasonCode: "MINIMUM_AGE_NOT_MET", earliestDate: age.earliestDate };
  }
  if (rule.contraindicationReviewRequired) return { validity: "review_required", reasonCode: "CONTRAINDICATION_REVIEW_REQUIRED", earliestDate: null };
  if (rule.minimumInterval) {
    const previous = administrations.filter((administration) => administration.valid !== false && administration.validity !== "invalid" && administration.validity !== "review_required" && compareCalendarDates(administration.administeredOn, administeredOn) < 0).sort((left, right) => compareCalendarDates(left.administeredOn, right.administeredOn)).at(-1);
    if (previous) {
      const interval = evaluateMinimumInterval(previous.administeredOn, rule.minimumInterval, administeredOn);
      if (!interval.valid) return { validity: "invalid", reasonCode: "MINIMUM_INTERVAL_NOT_MET", earliestDate: interval.earliestDate };
    }
  }
  return { validity: "valid", reasonCode: "DOSE_VALID", earliestDate: null };
}
