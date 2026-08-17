import type { MedicationWeightEvidence } from "./types.ts";

export type MedicationWeightResolution = Readonly<{
  status: "resolved" | "insufficient_data";
  weight: MedicationWeightEvidence | null;
  explanationCodes: readonly string[];
}>;

export function resolveRecentVerifiedWeight(
  childId: string,
  asOf: string,
  measurements: readonly MedicationWeightEvidence[],
  options: Readonly<{ maxAgeHours: number }> = { maxAgeHours: 720 },
): MedicationWeightResolution {
  const asOfMs = Date.parse(asOf);
  const maxAgeMs = options.maxAgeHours * 60 * 60 * 1000;
  const candidates = measurements
    .filter((measurement) => measurement.childId === childId && measurement.validationStatus === "confirmed")
    .filter((measurement) => {
      const measuredAt = Date.parse(measurement.measuredAt);
      return Number.isFinite(measuredAt) && measuredAt <= asOfMs && asOfMs - measuredAt <= maxAgeMs;
    })
    .sort((left, right) => Date.parse(right.measuredAt) - Date.parse(left.measuredAt));
  if (candidates.length === 0) return { status: "insufficient_data", weight: null, explanationCodes: ["RECENT_CONFIRMED_WEIGHT_UNAVAILABLE"] };
  return { status: "resolved", weight: candidates[0]!, explanationCodes: ["RECENT_CONFIRMED_SAME_CHILD_WEIGHT"] };
}

export type MedicationWeightRequest = Readonly<{ childId: string; cutoff: string }>;
export type MedicationWeightPolicy = Readonly<{ maxAgeHours: number }>;
export type VerifiedWeightResolution = MedicationWeightResolution;
export function resolveVerifiedWeight(scope: Readonly<{ childId: string }>, measurements: readonly MedicationWeightEvidence[], policy: MedicationWeightPolicy & { cutoff: string }): MedicationWeightResolution {
  return resolveRecentVerifiedWeight(scope.childId, policy.cutoff, measurements, policy);
}
