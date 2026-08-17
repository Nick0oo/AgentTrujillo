import { compareCalendarDates } from "./calendar.ts";
import type { CalendarDate, ImmunizationStatus } from "./types.ts";

export type DoseStatusReasonCode = "UNRESOLVED_EVIDENCE" | "CONTRADICTORY_EVIDENCE" | "REVIEW_REQUIRED" | "DOSE_APPLIED" | "NOT_APPLICABLE" | "NOT_YET_DUE" | "DOSE_DUE" | "DOSE_OVERDUE";
export type DoseStatusInput = Readonly<{ asOfDate: CalendarDate | string; dueFrom?: CalendarDate | string | null; dueUntil?: CalendarDate | string | null; applied?: boolean; notApplicable?: boolean; unresolved?: boolean; contradictory?: boolean; unresolvedEvidence?: boolean; contradictoryEvidence?: boolean; reviewRequired?: boolean; ruleCode?: string; matchedAdministrationIds?: readonly string[]; packageId?: string; algorithmId?: string; sourceDigest?: string; [key: string]: unknown }>;
export type DoseStatusResult = Readonly<{ status: ImmunizationStatus; reasonCode: DoseStatusReasonCode; dueFrom: CalendarDate | string | null; dueUntil: CalendarDate | string | null; matchedAdministrationIds: readonly string[]; decisionMaterial: Readonly<Record<string, unknown>> }>;

export function classifyDoseStatus(input: DoseStatusInput): DoseStatusResult {
  const dueFrom = input.dueFrom ?? null;
  const dueUntil = input.dueUntil ?? null;
  const unresolved = input.unresolved ?? input.unresolvedEvidence ?? false;
  const contradictory = input.contradictory ?? input.contradictoryEvidence ?? false;
  const material = Object.freeze({ asOfDate: input.asOfDate, dueFrom, dueUntil, applied: input.applied ?? false, notApplicable: input.notApplicable ?? false, unresolved, contradictory, reviewRequired: input.reviewRequired ?? false });
  const common = { dueFrom, dueUntil, matchedAdministrationIds: Object.freeze([...(input.matchedAdministrationIds ?? [])]), decisionMaterial: material };
  if (unresolved) return { ...common, status: "review_required", reasonCode: "UNRESOLVED_EVIDENCE" };
  if (contradictory) return { ...common, status: "review_required", reasonCode: "CONTRADICTORY_EVIDENCE" };
  if (input.reviewRequired) return { ...common, status: "review_required", reasonCode: "REVIEW_REQUIRED" };
  if (input.applied) return { ...common, status: "applied", reasonCode: "DOSE_APPLIED" };
  if (input.notApplicable) return { ...common, status: "not_applicable", reasonCode: "NOT_APPLICABLE" };
  if (dueFrom !== null && compareCalendarDates(input.asOfDate, dueFrom) < 0) return { ...common, status: "upcoming", reasonCode: "NOT_YET_DUE" };
  if (dueUntil !== null && compareCalendarDates(input.asOfDate, dueUntil) > 0) return { ...common, status: "overdue", reasonCode: "DOSE_OVERDUE" };
  return { ...common, status: "due", reasonCode: "DOSE_DUE" };
}
