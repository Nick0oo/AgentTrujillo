import type { GrowthInterpretation } from "./types.ts";

export type GrowthAssessmentPolicy = Readonly<{
  policyId: string;
  version: string;
  reviewAbsoluteZ: number;
  urgentAbsoluteZ: number;
  reviewPercentileBounds: readonly [number, number];
  urgentPercentileBounds: readonly [number, number];
}>;

export const DEFAULT_GROWTH_ASSESSMENT_POLICY: GrowthAssessmentPolicy = Object.freeze({
  policyId: "growth-interpretation",
  version: "1.0.0",
  reviewAbsoluteZ: 2,
  urgentAbsoluteZ: 3,
  reviewPercentileBounds: [2.5, 97.5] as const,
  urgentPercentileBounds: [0.1, 99.9] as const,
});

export function classifyGrowthResult(zScore: number, percentile: number, policy: GrowthAssessmentPolicy = DEFAULT_GROWTH_ASSESSMENT_POLICY): GrowthInterpretation {
  const urgent = Math.abs(zScore) >= policy.urgentAbsoluteZ
    || percentile <= policy.urgentPercentileBounds[0]
    || percentile >= policy.urgentPercentileBounds[1];
  if (urgent) return "urgent_review";
  const review = Math.abs(zScore) >= policy.reviewAbsoluteZ
    || percentile <= policy.reviewPercentileBounds[0]
    || percentile >= policy.reviewPercentileBounds[1];
  return review ? "review_required" : "within_expected";
}
