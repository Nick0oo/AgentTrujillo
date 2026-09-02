import { createCitationHandle } from "../../../agent/lib/runtime/safe-to-model.ts";
import { AgeEngine } from "../../clinical/anthropometry/chronological-age.ts";
import { assessGrowth } from "../../clinical/anthropometry/growth-assessment.ts";
import type { GrowthSummaryResponse } from "./routes/anthropometry.ts";

type ReadySummary = Extract<GrowthSummaryResponse, { status: "ready" }>;
type ReadySummaryBody = Omit<ReadySummary, "version" | "requestId">;

export type DevOnlyGrowthChild = Readonly<{
  dateOfBirth: string;
  sexForGrowth: "female" | "male";
  countryOfCare: "CO" | "US";
  timeZone: string;
}>;

export type DevOnlyGrowthMeasurement = Readonly<{
  id: string;
  measurementType: "weight" | "recumbent_length" | "standing_height" | "head_circumference";
  value: string;
  unit: "kg" | "cm";
  occurredAt: string;
  measurementMethod: "digital_scale" | "mechanical_scale" | "length_board" | "stadiometer" | "tape_measure" | "unknown";
}>;

export type DevOnlyGrowthSummaryInput = Readonly<{
  child: DevOnlyGrowthChild;
  measurements: readonly DevOnlyGrowthMeasurement[];
  now: Date;
}>;

function pointFor(input: DevOnlyGrowthSummaryInput, measurement: DevOnlyGrowthMeasurement): ReadySummaryBody["points"][number] | null {
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
    policy: undefined,
  });
  if (!assessment.standard) return null;
  const referenceCode = `DEV_ONLY_${assessment.standard.datasetKey}`;
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

export function buildDevOnlyGrowthSummary(input: DevOnlyGrowthSummaryInput): ReadySummaryBody {
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new Error("DEV_ONLY_GROWTH_CLOCK_INVALID");
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
  return { status: "ready", code: null, points };
}
