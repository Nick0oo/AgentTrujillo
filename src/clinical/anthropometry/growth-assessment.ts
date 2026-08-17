import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import { type Sha256Hex } from "../governance/source-types.ts";
import { createSha256Hex } from "./value-objects.ts";
import { calculatePercentile } from "./percentile.ts";
import { classifyGrowthResult, DEFAULT_GROWTH_ASSESSMENT_POLICY, type GrowthAssessmentPolicy } from "./assessment-policy.ts";
import { loadCdcDataset, type CdcLmsRow } from "./cdc-dataset.ts";
import type { CorrectedAgeResult } from "./corrected-age.ts";
import { interpolateLms, type LmsCoefficientRow } from "./interpolation.ts";
import { calculateLmsZScore } from "./z-score.ts";
import { selectGrowthStandard, type GrowthStandardSelection } from "./standard-selector.ts";
import { loadWhoDataset, type WhoReferenceRow } from "./who-dataset.ts";
import type { GrowthAgeContext, GrowthAssessmentResult, GrowthIndicator, GrowthInterpretation, GrowthSex, GrowthWarning, MeasurementType } from "./types.ts";

const EMPTY_DIGEST = createSha256Hex(createHash("sha256").update("").digest("hex"));

export type GrowthCompanion = Readonly<{
  measurementType: "recumbent_length" | "standing_height";
  normalizedValue: string;
  normalizedUnit: "cm";
}>;

export type GrowthAssessmentInput = Readonly<{
  measurementId: string;
  measurementType: MeasurementType;
  indicator?: GrowthIndicator;
  normalizedValue: string;
  normalizedUnit: "kg" | "cm";
  sex: GrowthSex;
  countryCode: string;
  chronologicalAgeDays: number;
  correctedAge: CorrectedAgeResult | null;
  ageBasis?: "chronological" | "corrected";
  companion?: GrowthCompanion;
  occurredAt: string;
  timeZone: string;
  measurementStatus?: "confirmed" | "excluded";
  rulePackId?: string;
  policy?: GrowthAssessmentPolicy;
}>;

function digestJson(value: unknown): Sha256Hex {
  return createSha256Hex(createHash("sha256").update(canonicalize(value)).digest("hex"));
}

function defaultIndicator(measurementType: MeasurementType): GrowthIndicator {
  if (measurementType === "weight") return "weight_for_age";
  if (measurementType === "recumbent_length") return "length_for_age";
  if (measurementType === "standing_height") return "height_for_age";
  return "head_circumference_for_age";
}

function ageContext(input: GrowthAssessmentInput, selection: GrowthStandardSelection): GrowthAgeContext {
  return Object.freeze({
    chronologicalAgeDays: input.chronologicalAgeDays,
    correctedAgeDays: input.correctedAge?.correctedAgeDays ?? null,
    basis: selection.ageBasis,
    referenceInstant: input.occurredAt,
    timeZone: input.timeZone,
    algorithmVersion: "growth-age-context.v1",
  });
}

function provenance(input: GrowthAssessmentInput, selection: GrowthStandardSelection, status: string, warnings: readonly GrowthWarning[], zScore: string | null): GrowthAssessmentResult["provenance"] {
  return {
    measurementId: input.measurementId,
    rulePackId: input.rulePackId ?? "growth-assessment.v1",
    algorithmId: "lms-zscore.v1|normal-cdf.v1|lms-interpolation.v1",
    datasetDigest: selection.standard?.sourceDigest ?? EMPTY_DIGEST,
    inputDigest: digestJson(input),
    decisionDigest: digestJson({ status, warnings, zScore, selection }),
  };
}

function common(input: GrowthAssessmentInput, selection: GrowthStandardSelection, warnings: readonly GrowthWarning[], interpretation: GrowthInterpretation, status: string, zScore: string | null) {
  return {
    standard: selection.standard,
    indicator: selection.indicator,
    age: ageContext(input, selection),
    warnings: [...new Set(warnings)],
    interpretation,
    provenance: provenance(input, selection, status, warnings, zScore),
  };
}

function failure(input: GrowthAssessmentInput, selection: GrowthStandardSelection, status: "rule_unavailable" | "insufficient_data" | "excluded", warnings: readonly GrowthWarning[]): GrowthAssessmentResult {
  return Object.freeze({ ...common(input, selection, warnings, "unavailable", status, null), status, zScore: null, percentile: null });
}

function decimalNumber(value: number): string {
  const rounded = value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return rounded === "-0" || rounded === "" ? "0" : rounded;
}

function asLmsRows(selection: GrowthStandardSelection, sex: GrowthSex): readonly LmsCoefficientRow[] {
  if (selection.datasetKey === "WHO_2006") {
    return loadWhoDataset().rows.filter((row: WhoReferenceRow) => row.indicator === selection.indicator && row.sex === sex);
  }
  const cdc = loadCdcDataset();
  const rows: readonly CdcLmsRow[] = selection.datasetKey === "CDC_2022_EXTENDED_BMI" ? cdc.extendedBmi.rows : cdc.rows;
  return rows.filter((row) => row.indicator === selection.indicator && row.sex === sex && row.coordinateKind === selection.coordinateKind);
}

function valueForAssessment(input: GrowthAssessmentInput): { value: string; coordinate: number | null; missingCompanion: boolean } {
  const measurement = Number(input.normalizedValue);
  if (!Number.isFinite(measurement) || measurement <= 0) return { value: input.normalizedValue, coordinate: null, missingCompanion: false };
  if (input.indicator === "bmi_for_age") {
    if (!input.companion || input.measurementType !== "weight") return { value: input.normalizedValue, coordinate: null, missingCompanion: true };
    const height = Number(input.companion.normalizedValue);
    if (!Number.isFinite(height) || height <= 0) return { value: input.normalizedValue, coordinate: null, missingCompanion: true };
    return { value: decimalNumber(measurement / ((height / 100) ** 2)), coordinate: null, missingCompanion: false };
  }
  if (input.indicator === "weight_for_length" || input.indicator === "weight_for_height") {
    if (!input.companion) return { value: input.normalizedValue, coordinate: null, missingCompanion: true };
    const coordinate = Number(input.companion.normalizedValue);
    return { value: input.normalizedValue, coordinate: Number.isFinite(coordinate) && coordinate > 0 ? coordinate : null, missingCompanion: false };
  }
  return { value: input.normalizedValue, coordinate: null, missingCompanion: false };
}

export function assessGrowth(input: GrowthAssessmentInput): GrowthAssessmentResult {
  const indicator = input.indicator ?? defaultIndicator(input.measurementType);
  const selection = selectGrowthStandard({ ...input, indicator });
  if (input.measurementStatus === "excluded") return failure(input, selection, "excluded", ["measurement_excluded", ...selection.warnings]);
  if (selection.status !== "selected") return failure(input, selection, "rule_unavailable", selection.warnings);

  const value = valueForAssessment(input);
  if (value.missingCompanion) return failure(input, selection, "insufficient_data", ["insufficient_companion", ...selection.warnings]);
  if (selection.coordinateKind === "age_months" && selection.ageMonths === null) return failure(input, selection, "rule_unavailable", ["age_unavailable", ...selection.warnings]);
  const coordinate = selection.coordinateKind === "age_months" ? selection.ageMonths : value.coordinate;
  if (coordinate === null) return failure(input, selection, "insufficient_data", ["insufficient_companion", ...selection.warnings]);
  const lms = interpolateLms(asLmsRows(selection, input.sex), coordinate);
  if (!lms) return failure(input, selection, "rule_unavailable", ["standard_unavailable", ...selection.warnings]);
  const z = calculateLmsZScore({ measurement: value.value, l: lms.l, m: lms.m, s: lms.s });
  if (z.status !== "calculated" || !z.zScore) return failure(input, selection, "rule_unavailable", [...z.warnings, ...selection.warnings]);
  const percentile = calculatePercentile(z.zScore);
  if (percentile.status !== "calculated" || !percentile.percentile) return failure(input, selection, "rule_unavailable", [...percentile.warnings, ...selection.warnings]);
  const numericZ = Number(z.zScore.canonical);
  const numericPercentile = Number(percentile.percentile.canonical);
  const warnings = [...selection.warnings, ...z.warnings, ...percentile.warnings, ...(lms.interpolated ? [] : [])];
  const interpretation = classifyGrowthResult(numericZ, numericPercentile, input.policy ?? DEFAULT_GROWTH_ASSESSMENT_POLICY);
  return Object.freeze({
    ...common(input, selection, warnings, interpretation, "calculated", z.zScore.canonical),
    status: "calculated",
    zScore: z.zScore,
    percentile: percentile.percentile,
  });
}
