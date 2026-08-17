export type ChronologicalAgeInput = Readonly<{
  birthDate: string;
  birthDatePrecision: "date" | "instant";
  birthInstant?: string;
  referenceInstant: string;
  timeZone: string;
}>;

export type ChronologicalAge = Readonly<{
  ageDays: number;
  completedWeeks: number;
  completedMonths: number;
  completedYears: number;
  birthLocalDate: string;
  referenceLocalDate: string;
  referenceInstant: string;
  timeZone: string;
  datasetAgeDays: number;
  algorithmVersion: string;
}>;

export const CHRONOLOGICAL_AGE_ALGORITHM_VERSION = "chronological-age.v1";
