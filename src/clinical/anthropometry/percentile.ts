import { parseClinicalDecimal } from "./decimal.ts";
import { createExactClinicalDecimal } from "./value-objects.ts";
import { NORMAL_CDF_ALGORITHM_VERSION, standardNormalCdf } from "./normal-cdf.ts";
import type { ExactClinicalDecimal, GrowthWarning } from "./types.ts";

export type PercentileResult = Readonly<{
  status: "calculated" | "unavailable";
  percentile: ExactClinicalDecimal | null;
  warnings: readonly GrowthWarning[];
  algorithmVersion: typeof NORMAL_CDF_ALGORITHM_VERSION;
}>;

function exactPercentile(value: number): ExactClinicalDecimal {
  const rounded = value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  return createExactClinicalDecimal(rounded === "-0" || rounded === "" ? "0" : rounded);
}

export function calculatePercentile(zScore: string | ExactClinicalDecimal): PercentileResult {
  const numeric = Number(typeof zScore === "string" ? parseClinicalDecimal(zScore).canonical : zScore.canonical);
  if (!Number.isFinite(numeric)) return Object.freeze({ status: "unavailable", percentile: null, warnings: ["numerical_instability"] as const, algorithmVersion: NORMAL_CDF_ALGORITHM_VERSION });
  const raw = standardNormalCdf(numeric) * 100;
  const warnings: GrowthWarning[] = [];
  const value = Math.min(100, Math.max(0, raw));
  if (numeric <= -8 || numeric >= 8 || value === 0 || value === 100) warnings.push("precision_limited");
  return Object.freeze({ status: "calculated", percentile: exactPercentile(value), warnings, algorithmVersion: NORMAL_CDF_ALGORITHM_VERSION });
}
