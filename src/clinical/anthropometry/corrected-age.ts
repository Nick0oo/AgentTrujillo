import type { ChronologicalAge } from "./age-policy.ts";
import type { GestationalAge, PrematurityPolicy } from "./prematurity-policy.ts";

export type CorrectedAgeResult = Readonly<{
  status: "calculated" | "not_eligible" | "rule_unavailable";
  chronologicalAgeDays: number;
  correctedAgeDays: number | null;
  correctionApplied: boolean;
  offsetDays: number | null;
  policyId: string | null;
  policyVersion: string | null;
  transition: "corrected" | "chronological" | "unavailable";
  warning: "corrected_age_unavailable" | "correction_not_eligible" | "negative_corrected_age" | null;
}>;

export function validateGestationalAge(gestation: GestationalAge): GestationalAge {
  if (!Number.isInteger(gestation.weeks) || gestation.weeks < 0 || gestation.weeks > 45) throw new Error("INVALID_GESTATIONAL_WEEKS");
  if (!Number.isInteger(gestation.days) || gestation.days < 0 || gestation.days > 6) throw new Error("INVALID_GESTATIONAL_DAYS");
  if (gestation.weeks === 45 && gestation.days > 0) throw new Error("INVALID_GESTATIONAL_AGE");
  return Object.freeze({ weeks: gestation.weeks, days: gestation.days });
}

export function calculateCorrectedAge(
  chronologicalAge: ChronologicalAge,
  rawGestation: GestationalAge | null,
  policy: PrematurityPolicy | null,
): CorrectedAgeResult {
  if (!rawGestation || !policy || !policy.approved) return Object.freeze({
    status: "rule_unavailable",
    chronologicalAgeDays: chronologicalAge.ageDays,
    correctedAgeDays: null,
    correctionApplied: false,
    offsetDays: null,
    policyId: policy?.policyId ?? null,
    policyVersion: policy?.version ?? null,
    transition: "unavailable",
    warning: "corrected_age_unavailable",
  });
  const gestation = validateGestationalAge(rawGestation);
  const offsetDays = policy.termGestationalWeeks * 7 - (gestation.weeks * 7 + gestation.days);
  const eligible = gestation.weeks < policy.eligibleBelowWeeks
    || (gestation.weeks === policy.eligibleBelowWeeks && gestation.days === 0);
  if (!eligible || chronologicalAge.ageDays > policy.correctionEndDays) return Object.freeze({
    status: "not_eligible",
    chronologicalAgeDays: chronologicalAge.ageDays,
    correctedAgeDays: null,
    correctionApplied: false,
    offsetDays,
    policyId: policy.policyId,
    policyVersion: policy.version,
    transition: "chronological",
    warning: "correction_not_eligible",
  });
  const correctedAgeDays = chronologicalAge.ageDays - offsetDays;
  if (correctedAgeDays < 0 && policy.negativeBehavior === "unavailable") return Object.freeze({
    status: "rule_unavailable",
    chronologicalAgeDays: chronologicalAge.ageDays,
    correctedAgeDays: null,
    correctionApplied: false,
    offsetDays,
    policyId: policy.policyId,
    policyVersion: policy.version,
    transition: "unavailable",
    warning: "negative_corrected_age",
  });
  return Object.freeze({
    status: "calculated",
    chronologicalAgeDays: chronologicalAge.ageDays,
    correctedAgeDays: Math.max(0, correctedAgeDays),
    correctionApplied: true,
    offsetDays,
    policyId: policy.policyId,
    policyVersion: policy.version,
    transition: "corrected",
    warning: null,
  });
}

export type { GestationalAge, PrematurityPolicy } from "./prematurity-policy.ts";
