import { createSha256Hex } from "./value-objects.ts";
import { loadCdcDataset } from "./cdc-dataset.ts";
import type { CorrectedAgeResult } from "./corrected-age.ts";
import { loadWhoDataset } from "./who-dataset.ts";
import type { GrowthAgeBasis, GrowthIndicator, GrowthSex, GrowthStandardIdentity, GrowthWarning, MeasurementType } from "./types.ts";

export const US_WHO_TO_CDC_TRANSITION_MONTHS = 24;
export const GROWTH_AGE_MONTH_DAYS = 30.4375;

const CDC_2000_SOURCE_BY_INDICATOR: Readonly<Partial<Record<GrowthIndicator, string>>> = Object.freeze({
  weight_for_age: "cdc-wtage.csv",
  height_for_age: "cdc-statage.csv",
  bmi_for_age: "cdc-bmiagerev.csv",
  weight_for_height: "cdc-wtstat.csv",
});

export type GrowthStandardSelectorInput = Readonly<{
  countryCode: string;
  sex: GrowthSex;
  measurementType: MeasurementType;
  indicator?: GrowthIndicator;
  chronologicalAgeDays: number;
  chronologicalCompletedMonths?: number;
  correctedAge: CorrectedAgeResult | null;
  correctedCompletedMonths?: number;
  ageBasis?: GrowthAgeBasis;
}>;

export type GrowthStandardSelection = Readonly<{
  status: "selected" | "unavailable";
  standard: GrowthStandardIdentity | null;
  datasetKey: "WHO_2006" | "CDC_2000" | "CDC_2022_EXTENDED_BMI" | null;
  datasetSourceFile: string | null;
  indicator: GrowthIndicator;
  sex: GrowthSex;
  ageBasis: GrowthAgeBasis;
  ageDays: number | null;
  ageMonths: number | null;
  coordinateKind: "age_months" | "length_cm" | "height_cm";
  warnings: readonly GrowthWarning[];
}>;

function indicatorFor(input: GrowthStandardSelectorInput): GrowthIndicator {
  if (input.indicator) return input.indicator;
  if (input.measurementType === "weight") return "weight_for_age";
  if (input.measurementType === "recumbent_length") return "length_for_age";
  if (input.measurementType === "standing_height") return "height_for_age";
  return "head_circumference_for_age";
}

function coordinateKindFor(indicator: GrowthIndicator): GrowthStandardSelection["coordinateKind"] {
  if (indicator === "weight_for_length") return "length_cm";
  if (indicator === "weight_for_height") return "height_cm";
  return "age_months";
}

function identity(datasetKey: GrowthStandardSelection["datasetKey"], manifest: { version: string; normalizedDigest: string }): GrowthStandardIdentity {
  if (!datasetKey) throw new Error("STANDARD_IDENTITY_DATASET_REQUIRED");
  return Object.freeze({
    key: `growth.${datasetKey.toLowerCase()}`,
    datasetKey,
    version: manifest.version,
    sourceDigest: createSha256Hex(manifest.normalizedDigest),
  });
}

function unavailable(indicator: GrowthIndicator, sex: GrowthSex, ageBasis: GrowthAgeBasis, ageDays: number | null, ageMonths: number | null, coordinateKind: GrowthStandardSelection["coordinateKind"], warnings: GrowthWarning[]): GrowthStandardSelection {
  return Object.freeze({ status: "unavailable", standard: null, datasetKey: null, datasetSourceFile: null, indicator, sex, ageBasis, ageDays, ageMonths, coordinateKind, warnings: [...new Set(warnings)] });
}

export function selectGrowthStandard(input: GrowthStandardSelectorInput): GrowthStandardSelection {
  const indicator = indicatorFor(input);
  const coordinateKind = coordinateKindFor(indicator);
  const requestedBasis = input.ageBasis ?? "chronological";
  const warnings: GrowthWarning[] = [];
  if (!Number.isInteger(input.chronologicalAgeDays) || input.chronologicalAgeDays < 0) return unavailable(indicator, input.sex, requestedBasis, null, null, coordinateKind, ["age_unavailable"]);

  let ageBasis: GrowthAgeBasis = "chronological";
  let ageDays = input.chronologicalAgeDays;
  let completedMonths = input.chronologicalCompletedMonths;
  if (requestedBasis === "corrected") {
    if (input.correctedAge?.status !== "calculated" || input.correctedAge.correctedAgeDays === null) return unavailable(indicator, input.sex, "corrected", null, null, coordinateKind, ["corrected_age_unavailable"]);
    ageBasis = "corrected";
    ageDays = input.correctedAge.correctedAgeDays;
    completedMonths = input.correctedCompletedMonths;
  }
  const ageMonths = ageDays / GROWTH_AGE_MONTH_DAYS;

  let datasetKey: GrowthStandardSelection["datasetKey"] = null;
  let datasetSourceFile: string | null = null;
  if (input.countryCode === "CO") datasetKey = "WHO_2006";
  else if (input.countryCode === "US") {
    if (completedMonths === undefined || !Number.isInteger(completedMonths) || completedMonths < 0) return unavailable(indicator, input.sex, ageBasis, ageDays, ageMonths, coordinateKind, ["age_unavailable"]);
    if (completedMonths < US_WHO_TO_CDC_TRANSITION_MONTHS) datasetKey = "WHO_2006";
    else {
      datasetSourceFile = CDC_2000_SOURCE_BY_INDICATOR[indicator] ?? null;
      if (!datasetSourceFile) return unavailable(indicator, input.sex, ageBasis, ageDays, ageMonths, coordinateKind, ["standard_unavailable"]);
      datasetKey = "CDC_2000";
    }
    if (completedMonths === US_WHO_TO_CDC_TRANSITION_MONTHS) warnings.push("transition_boundary");
  } else {
    return unavailable(indicator, input.sex, ageBasis, ageDays, ageMonths, coordinateKind, ["standard_unavailable"]);
  }

  const manifest = datasetKey === "WHO_2006" ? loadWhoDataset().manifest : loadCdcDataset().manifest;
  if (coordinateKind === "age_months") {
    const rows = datasetKey === "WHO_2006"
      ? loadWhoDataset().rows.filter((row) => row.indicator === indicator && row.sex === input.sex)
      : loadCdcDataset().rows.filter((row) => row.indicator === indicator && row.sex === input.sex && row.sourceFile === datasetSourceFile);
    const coordinates = rows.map((row) => Number(row.coordinateValue)).filter(Number.isFinite);
    if (coordinates.length === 0 || ageMonths < Math.min(...coordinates) || ageMonths > Math.max(...coordinates)) return unavailable(indicator, input.sex, ageBasis, ageDays, ageMonths, coordinateKind, ["standard_unavailable", ...warnings]);
  }
  return Object.freeze({ status: "selected", standard: identity(datasetKey, manifest), datasetKey, datasetSourceFile, indicator, sex: input.sex, ageBasis, ageDays, ageMonths, coordinateKind, warnings: [...new Set(warnings)] });
}

export function promoteToExtendedBmi(selection: GrowthStandardSelection): GrowthStandardSelection {
  if (selection.status !== "selected" || selection.datasetKey !== "CDC_2000" || selection.indicator !== "bmi_for_age") throw new Error("EXTENDED_BMI_SELECTION_INVALID");
  const manifest = loadCdcDataset().extendedBmi.manifest;
  return Object.freeze({
    ...selection,
    standard: identity("CDC_2022_EXTENDED_BMI", manifest),
    datasetKey: "CDC_2022_EXTENDED_BMI",
    datasetSourceFile: "cdc-bmi-age-2022.csv",
  });
}
