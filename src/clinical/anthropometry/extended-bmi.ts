import { standardNormalCdf } from "./normal-cdf.ts";
import type { GrowthSex } from "./types.ts";

export const EXTENDED_BMI_ALGORITHM_VERSION = "cdc-extended-bmi.v1";
const Z_95 = 1.6448536269514722;

export type ExtendedBmiInput = Readonly<{
  bmi: number;
  ageMonths: number;
  sex: GrowthSex;
  l: string;
  m: string;
  s: string;
}>;

export type ExtendedBmiResult = Readonly<{
  status: "calculated" | "unavailable";
  zScore: number | null;
  percentile: number | null;
  p95: number | null;
  sigma: number | null;
  algorithmVersion: typeof EXTENDED_BMI_ALGORITHM_VERSION;
}>;

function inverseStandardNormal(probability: number): number {
  let lower = -10;
  let upper = 10;
  for (let index = 0; index < 80; index += 1) {
    const midpoint = (lower + upper) / 2;
    if (standardNormalCdf(midpoint) < probability) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) / 2;
}

function unavailable(): ExtendedBmiResult {
  return Object.freeze({ status: "unavailable", zScore: null, percentile: null, p95: null, sigma: null, algorithmVersion: EXTENDED_BMI_ALGORITHM_VERSION });
}

export function calculateExtendedBmi(input: ExtendedBmiInput): ExtendedBmiResult {
  const l = Number(input.l);
  const m = Number(input.m);
  const s = Number(input.s);
  if (!(input.bmi > 0) || !(input.ageMonths >= 24 && input.ageMonths < 240) || !(m > 0) || !(s > 0) || !Number.isFinite(l)) return unavailable();
  const base = 1 + l * s * Z_95;
  if (!(base > 0)) return unavailable();
  const p95 = Math.abs(l) < Number.EPSILON ? m * Math.exp(s * Z_95) : m * Math.pow(base, 1 / l);
  const ageYears = input.ageMonths / 12;
  const sigma = input.sex === "male"
    ? 0.3728 + 0.5196 * ageYears - 0.0091 * ageYears ** 2
    : 0.8334 + 0.3712 * ageYears - 0.0011 * ageYears ** 2;
  if (!(p95 > 0) || !(sigma > 0)) return unavailable();

  const percentileProbability = 0.9 + 0.1 * standardNormalCdf((input.bmi - p95) / sigma);
  const probability = Math.min(0.999999999999999, Math.max(0.000000000000001, percentileProbability));
  return Object.freeze({
    status: "calculated",
    zScore: inverseStandardNormal(probability),
    percentile: probability * 100,
    p95,
    sigma,
    algorithmVersion: EXTENDED_BMI_ALGORITHM_VERSION,
  });
}
