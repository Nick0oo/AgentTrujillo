import { parseClinicalDecimal } from "./decimal.ts";
import { createExactClinicalDecimal } from "./value-objects.ts";
import type { ExactClinicalDecimal, GrowthWarning } from "./types.ts";

export const LMS_Z_SCORE_ALGORITHM_VERSION = "lms-zscore.v1";

export type ZScoreInput = Readonly<{
  measurement: string | ExactClinicalDecimal;
  l: string;
  m: string;
  s: string;
}>;

export type ZScoreResult = Readonly<{
  status: "calculated" | "unavailable";
  zScore: ExactClinicalDecimal | null;
  warnings: readonly GrowthWarning[];
  algorithmVersion: typeof LMS_Z_SCORE_ALGORITHM_VERSION;
}>;

function asNumber(value: string | ExactClinicalDecimal): number {
  return Number(typeof value === "string" ? parseClinicalDecimal(value).canonical : value.canonical);
}

function exactNumber(value: number): ExactClinicalDecimal {
  if (!Number.isFinite(value)) throw new Error("Z_SCORE_NON_FINITE");
  const rounded = value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return createExactClinicalDecimal(rounded === "-0" || rounded === "" ? "0" : rounded);
}

export function calculateLmsZScore(input: ZScoreInput): ZScoreResult {
  try {
    const measurement = asNumber(input.measurement);
    const l = asNumber(input.l);
    const m = asNumber(input.m);
    const s = asNumber(input.s);
    if (!(measurement > 0) || !(m > 0) || !(s > 0) || !Number.isFinite(l)) throw new Error("LMS_DOMAIN_INVALID");
    const z = Math.abs(l) < Number.EPSILON
      ? Math.log(measurement / m) / s
      : (Math.pow(measurement / m, l) - 1) / (l * s);
    if (!Number.isFinite(z)) throw new Error("LMS_RESULT_NON_FINITE");
    return Object.freeze({ status: "calculated", zScore: exactNumber(z), warnings: [], algorithmVersion: LMS_Z_SCORE_ALGORITHM_VERSION });
  } catch {
    return Object.freeze({ status: "unavailable", zScore: null, warnings: ["numerical_instability"] as const, algorithmVersion: LMS_Z_SCORE_ALGORITHM_VERSION });
  }
}
