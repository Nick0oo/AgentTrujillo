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
  options: Readonly<{ maxAgeHours: number }>,
): MedicationWeightResolution {
  const asOfMs = Date.parse(asOf);
  if (!options || !Number.isFinite(asOfMs) || !Number.isFinite(options.maxAgeHours) || options.maxAgeHours <= 0) {
    return { status: "insufficient_data", weight: null, explanationCodes: ["WEIGHT_EVIDENCE_INVALID"] };
  }
  const maxAgeMs = options.maxAgeHours * 60 * 60 * 1000;
  const candidates = measurements
    .filter((measurement) => measurement.childId === childId && measurement.validationStatus === "confirmed")
    .filter((measurement) => {
      const measuredAt = Date.parse(measurement.measuredAt);
      const confirmedAt = Date.parse(measurement.confirmedAt);
      return Number.isFinite(measuredAt)
        && Number.isFinite(confirmedAt)
        && measuredAt <= confirmedAt
        && confirmedAt <= asOfMs
        && measuredAt <= asOfMs
        && asOfMs - measuredAt <= maxAgeMs
        && /^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/.test(measurement.valueKg);
    })
    .sort((left, right) => Date.parse(right.measuredAt) - Date.parse(left.measuredAt));
  if (candidates.length === 0) return { status: "insufficient_data", weight: null, explanationCodes: ["RECENT_CONFIRMED_WEIGHT_UNAVAILABLE"] };
  const latestMeasuredAt = Date.parse(candidates[0]!.measuredAt);
  const latest = candidates.filter((candidate) => Date.parse(candidate.measuredAt) === latestMeasuredAt);
  if (new Set(latest.map((candidate) => candidate.valueKg)).size > 1) {
    return { status: "insufficient_data", weight: null, explanationCodes: ["CONFLICTING_RECENT_CONFIRMED_WEIGHTS"] };
  }
  return { status: "resolved", weight: candidates[0]!, explanationCodes: ["RECENT_CONFIRMED_SAME_CHILD_WEIGHT"] };
}

export type MedicationWeightRequest = Readonly<{ childId: string; cutoff: string }>;
export type MedicationWeightPolicy = Readonly<{ maxAgeHours: number }>;
export type VerifiedWeightResolution = MedicationWeightResolution;
export function resolveVerifiedWeight(scope: Readonly<{ childId: string }>, measurements: readonly MedicationWeightEvidence[], policy: MedicationWeightPolicy & { cutoff: string }): MedicationWeightResolution {
  return resolveRecentVerifiedWeight(scope.childId, policy.cutoff, measurements, policy);
}
