export const LMS_INTERPOLATION_ALGORITHM_VERSION = "lms-interpolation.v1";

export type LmsCoefficientRow = Readonly<{
  coordinateValue: string;
  l: string;
  m: string;
  s: string;
}>;

export type InterpolatedLms = Readonly<{
  l: string;
  m: string;
  s: string;
  lowerCoordinate: string;
  upperCoordinate: string;
  weight: string;
  interpolated: boolean;
  algorithmVersion: typeof LMS_INTERPOLATION_ALGORITHM_VERSION;
}>;

function finiteDecimal(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error("INTERPOLATION_NON_FINITE");
  const fixed = value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return fixed === "-0" || fixed === "" ? "0" : fixed;
}

export function interpolateLms(rows: readonly LmsCoefficientRow[], coordinate: number): InterpolatedLms | null {
  if (!Number.isFinite(coordinate) || rows.length === 0) return null;
  const sorted = rows
    .map((row) => ({ row, coordinate: finiteDecimal(row.coordinateValue) }))
    .filter((value): value is { row: LmsCoefficientRow; coordinate: number } => value.coordinate !== null)
    .sort((left, right) => left.coordinate - right.coordinate);
  if (sorted.length === 0 || coordinate < sorted[0].coordinate || coordinate > sorted[sorted.length - 1].coordinate) return null;

  const exact = sorted.find((value) => Math.abs(value.coordinate - coordinate) < 1e-10);
  if (exact) return Object.freeze({
    l: exact.row.l,
    m: exact.row.m,
    s: exact.row.s,
    lowerCoordinate: exact.row.coordinateValue,
    upperCoordinate: exact.row.coordinateValue,
    weight: "0",
    interpolated: false,
    algorithmVersion: LMS_INTERPOLATION_ALGORITHM_VERSION,
  });

  let upperIndex = sorted.findIndex((value) => value.coordinate > coordinate);
  if (upperIndex < 1) upperIndex = 1;
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  const weight = (coordinate - lower.coordinate) / (upper.coordinate - lower.coordinate);
  const coefficient = (key: "l" | "m" | "s") => {
    const left = finiteDecimal(lower.row[key]);
    const right = finiteDecimal(upper.row[key]);
    if (left === null || right === null) throw new Error("INTERPOLATION_COEFFICIENT_INVALID");
    return decimal(left + (right - left) * weight);
  };

  return Object.freeze({
    l: coefficient("l"),
    m: coefficient("m"),
    s: coefficient("s"),
    lowerCoordinate: lower.row.coordinateValue,
    upperCoordinate: upper.row.coordinateValue,
    weight: decimal(weight),
    interpolated: true,
    algorithmVersion: LMS_INTERPOLATION_ALGORITHM_VERSION,
  });
}
