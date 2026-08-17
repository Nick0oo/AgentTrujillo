import type { AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope";
import { isAuthorizedChildScopeActive } from "../../agent/lib/access/authorized-child-scope";

export type AgeEngine = Readonly<{
  calculateChronologicalAge(input: Readonly<{ childId: string; referenceInstant: Date; timezone: string }>): Readonly<{ ageDays: number; dobEvidenceVersion: string }>;
  calculateCorrectedAge?: (input: Readonly<{ childId: string; referenceInstant: Date; timezone: string }>) => Readonly<{ ageDays: number; evidenceVersion: string }> | null;
}>;

export type SafetyAgeContext = Readonly<{
  scopeFingerprint: string;
  chronologicalAgeDays: number;
  correctedAgeDays: number | null;
  correctedAgeEvidenceVersion: string | null;
  dobEvidenceVersion: string;
  referenceInstant: Date;
  referenceCalendarDate: string;
  timezone: string;
  countryOfCare: "CO" | "US";
  warnings: readonly ("stale_scope" | "invalid_age" | "corrected_age_unavailable")[];
}>;

export class SafetyAgeContextError extends Error {
  readonly code: "STALE_SCOPE" | "INVALID_AGE" | "AGE_ENGINE_UNAVAILABLE";
  constructor(code: SafetyAgeContextError["code"]) { super(code); this.name = "SafetyAgeContextError"; this.code = code; }
}

function calendarDate(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildSafetyAgeContext(scope: AuthorizedChildScope, referenceInstant: Date, ageEngine: AgeEngine): SafetyAgeContext {
  if (!(referenceInstant instanceof Date) || !Number.isFinite(referenceInstant.getTime())) throw new SafetyAgeContextError("INVALID_AGE");
  if (!isAuthorizedChildScopeActive(scope, referenceInstant)) throw new SafetyAgeContextError("STALE_SCOPE");
  const calculated = ageEngine.calculateChronologicalAge({ childId: scope.childId, referenceInstant: new Date(referenceInstant.getTime()), timezone: scope.timezone });
  if (!Number.isInteger(calculated.ageDays) || calculated.ageDays < 0 || calculated.ageDays > 18 * 366 || !calculated.dobEvidenceVersion) throw new SafetyAgeContextError("INVALID_AGE");
  const corrected = ageEngine.calculateCorrectedAge?.({ childId: scope.childId, referenceInstant: new Date(referenceInstant.getTime()), timezone: scope.timezone }) ?? null;
  if (corrected && (!Number.isInteger(corrected.ageDays) || corrected.ageDays < 0 || corrected.ageDays > 18 * 366)) throw new SafetyAgeContextError("INVALID_AGE");
  return Object.freeze({
    scopeFingerprint: `${scope.actorUserId}:${scope.careSpaceId}:${scope.childId}:${scope.authorizationVersion}`.replace(/[0-9a-f-]{8,}/giu, "scope"),
    chronologicalAgeDays: calculated.ageDays,
    correctedAgeDays: corrected?.ageDays ?? null,
    correctedAgeEvidenceVersion: corrected?.evidenceVersion ?? null,
    dobEvidenceVersion: calculated.dobEvidenceVersion,
    referenceInstant: Object.freeze(new Date(referenceInstant.getTime())),
    referenceCalendarDate: calendarDate(referenceInstant, scope.timezone),
    timezone: scope.timezone,
    countryOfCare: scope.countryOfCare,
    warnings: Object.freeze(corrected ? [] as const : ["corrected_age_unavailable"] as const),
  });
}
