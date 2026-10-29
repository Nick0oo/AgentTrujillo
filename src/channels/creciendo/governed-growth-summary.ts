import { createCitationHandle } from "../../../agent/lib/runtime/safe-to-model.ts";
import { AgeEngine } from "../../clinical/anthropometry/chronological-age.ts";
import { assessGrowth } from "../../clinical/anthropometry/growth-assessment.ts";
import { GROWTH_AGE_MONTH_DAYS } from "../../clinical/anthropometry/standard-selector.ts";
import type { GrowthSummaryResponse } from "./routes/anthropometry.ts";

import { isResolvedGrowthPackage, type ResolvedGrowthPackage } from "./growth-package-provider.ts";

type ReadySummary = Extract<GrowthSummaryResponse, { status: "ready" }>;
type ReadySummaryBody = Omit<ReadySummary, "version" | "requestId">;
type SummaryBody = ReadySummaryBody | Omit<Extract<GrowthSummaryResponse, { status: "unavailable" }>, "version" | "requestId">;

export type GovernedGrowthChild = Readonly<{
  gestationalAgeWeeks: number | null;
  gestationalAgeDays: number | null;
  dateOfBirth: string;
  sexForGrowth: "female" | "male";
  countryOfCare: "CO" | "US";
  timeZone: string;
}>;

export type GovernedGrowthMeasurement = Readonly<{
  id: string;
  measurementType: "weight" | "recumbent_length" | "standing_height" | "head_circumference";
  value: string;
  unit: "kg" | "cm";
  occurredAt: string;
  measurementMethod: "digital_scale" | "mechanical_scale" | "length_board" | "stadiometer" | "tape_measure" | "unknown";
}>;

export type GovernedGrowthSummaryInput = Readonly<{
  package: ResolvedGrowthPackage;
  child: GovernedGrowthChild;
  measurements: readonly GovernedGrowthMeasurement[];
  now: Date;
}>;

function pointFor(input: GovernedGrowthSummaryInput, measurement: GovernedGrowthMeasurement): ReadySummaryBody["points"][number] | null {
  const age = AgeEngine.calculateChronologicalAge({
    birthDate: input.child.dateOfBirth,
    birthDatePrecision: "date",
    referenceInstant: measurement.occurredAt,
    timeZone: input.child.timeZone,
  });
  const assessment = assessGrowth({
    measurementId: measurement.id,
    measurementType: measurement.measurementType,
    normalizedValue: measurement.value,
    normalizedUnit: measurement.unit,
    sex: input.child.sexForGrowth,
    countryCode: input.child.countryOfCare,
    chronologicalAgeDays: age.ageDays,
    chronologicalCompletedMonths: age.completedMonths,
    correctedAge: null,
    ageBasis: "chronological",
    occurredAt: measurement.occurredAt,
    timeZone: input.child.timeZone,
    measurementStatus: "confirmed",
    rulePackId: input.package.packId,
    policy: undefined,
  });
  if (!assessment.standard) return null;
  const payload = input.package.identity.artifact.payload;
  const digests: Readonly<Record<string, string>> = payload.datasetDigests;
  if (!payload.allowedIndicators.includes(assessment.indicator) || digests[assessment.standard.datasetKey] !== assessment.provenance.datasetDigest) return null;
  const referenceCode = payload.packageKey + "." + assessment.standard.datasetKey;
  const provenance = {
    standardKey: assessment.standard.key,
    standardVersion: assessment.standard.version,
    referenceCode,
    citationHandle: createCitationHandle("get_growth_summary", {
      sourceDigest: assessment.provenance.datasetDigest,
      referenceCode,
    }),
  };
  const ageDays = assessment.age.basis === "corrected" ? assessment.age.correctedAgeDays : assessment.age.chronologicalAgeDays;
  if (ageDays === null) return null;
  const common = {
    occurredAt: measurement.occurredAt,
    measurementType: measurement.measurementType,
    value: measurement.value,
    unit: measurement.unit,
    indicator: assessment.indicator,
    ageBasis: assessment.age.basis,
    ageDays,
    interpretation: assessment.interpretation,
    warnings: [...assessment.warnings],
    provenance,
  };
  if (assessment.status === "calculated") {
    return {
      ...common,
      status: "calculated" as const,
      zScore: assessment.zScore.canonical,
      percentile: assessment.percentile.canonical,
    };
  }
  return {
    ...common,
    status: assessment.status,
    zScore: null,
    percentile: null,
  };
}

export function buildGovernedGrowthSummary(input: GovernedGrowthSummaryInput): SummaryBody {
  const unavailable = { status: "unavailable" as const, code: "RULE_UNAVAILABLE" as const, points: [] as [] };
  if (!isResolvedGrowthPackage(input.package) || input.package.identity.artifact.payload.countryCode !== input.child.countryOfCare) return unavailable;
  const weeks = input.child.gestationalAgeWeeks;
  const days = input.child.gestationalAgeDays;
  if ((weeks !== null && (!Number.isInteger(weeks) || weeks < 37 || weeks > 45))
    || (days !== null && (!Number.isInteger(days) || days < 0 || days > 6))) return unavailable;
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new Error("GROWTH_CLOCK_INVALID");
  const points = input.measurements
    .filter((measurement) => Date.parse(measurement.occurredAt) <= input.now.getTime())
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
    .flatMap((measurement) => {
      try {
        const point = pointFor(input, measurement);
        return point ? [point] : [];
      } catch {
        return [];
      }
    });
  const observations = input.measurements.filter((measurement) => Date.parse(measurement.occurredAt) <= input.now.getTime()).flatMap((measurement) => {
    try {
      const age = AgeEngine.calculateChronologicalAge({ birthDate: input.child.dateOfBirth, birthDatePrecision: "date", referenceInstant: measurement.occurredAt, timeZone: input.child.timeZone });
      return [{ measurementId: measurement.id, ageMonths: age.ageDays / GROWTH_AGE_MONTH_DAYS, ageBasis: "chronological" as const }];
    } catch { return []; }
  }).slice(0, 48);
  let currentAgeCompletedMonths: number | null = null;
  try {
    currentAgeCompletedMonths = AgeEngine.calculateChronologicalAge({ birthDate: input.child.dateOfBirth, birthDatePrecision: "date", referenceInstant: input.now.toISOString(), timeZone: input.child.timeZone }).completedMonths;
  } catch { /* An unavailable age is never replaced by a guessed value. */ }
  return { status: "ready", code: null, points, chart: { currentAgeCompletedMonths, observations, copy: { ...input.package.identity.artifact.payload.copy } } };
}
