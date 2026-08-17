export const NORMAL_CDF_ALGORITHM_VERSION = "normal-cdf.v1";

// Abramowitz and Stegun 26.2.17, pinned for reproducible tail behavior.
export function standardNormalCdf(z: number): number {
  if (Number.isNaN(z)) return Number.NaN;
  if (z === 0) return 0.5;
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export const normalCdf = standardNormalCdf;
