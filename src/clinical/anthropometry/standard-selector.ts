import { createSha256Hex } from "./value-objects.ts";
import { loadCdcDataset } from "./cdc-dataset.ts";
import type { CorrectedAgeResult } from "./corrected-age.ts";
import { loadWhoDataset } from "./who-dataset.ts";
import type { GrowthAgeBasis, GrowthIndicator, GrowthSex, GrowthStandardIdentity, GrowthWarning, MeasurementType } from "./types.ts";

export const US_WHO_TO_CDC_TRANSITION_DAYS = 730;
export const GROWTH_AGE_MONTH_DAYS = 30.4375;

export type GrowthStandardSelectorInput = Readonly<{
  countryCode: string;
  sex: GrowthSex;
  measurementType: MeasurementType;
  indicator?: GrowthIndicator;
  chronologicalAgeDays: number;
  correctedAge: CorrectedAgeResult | null;
  ageBasis?: GrowthAgeBasis;
}>;

export type GrowthStandardSelection = Readonly<{
  status: "selected" | "unavailable";
  standard: GrowthStandardIdentity | null;
  datasetKey: "WHO_2006" | "CDC_2000" | "CDC_2022_EXTENDED_BMI" | null;
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
  return Object.freeze({ status: "unavailable", standard: null, datasetKey: null, indicator, sex, ageBasis, ageDays, ageMonths, coordinateKind, warnings: [...new Set(warnings)] });
}

export function selectGrowthStandard(input: GrowthStandardSelectorInput): GrowthStandardSelection {
  const indicator = indicatorFor(input);
  const coordinateKind = coordinateKindFor(indicator);
  const requestedBasis = input.ageBasis ?? "chronological";
  const warnings: GrowthWarning[] = [];
  if (!Number.isInteger(input.chronologicalAgeDays) || input.chronologicalAgeDays < 0) return unavailable(indicator, input.sex, requestedBasis, null, null, coordinateKind, ["age_unavailable"]);

  let ageBasis: GrowthAgeBasis = "chronological";
  let ageDays = input.chronologicalAgeDays;
  if (requestedBasis === "corrected") {
    if (input.correctedAge?.status !== "calculated" || input.correctedAge.correctedAgeDays === null) return unavailable(indicator, input.sex, "corrected", null, null, coordinateKind, ["corrected_age_unavailable"]);
    ageBasis = "corrected";
    ageDays = input.correctedAge.correctedAgeDays;
  }
  const ageMonths = ageDays / GROWTH_AGE_MONTH_DAYS;

  let datasetKey: GrowthStandardSelection["datasetKey"] = null;
  if (input.countryCode === "CO") datasetKey = "WHO_2006";
  else if (input.countryCode === "US") {
    datasetKey = ageDays < US_WHO_TO_CDC_TRANSITION_DAYS ? "WHO_2006" : indicator === "bmi_for_age" && ageMonths >= 120 ? "CDC_2022_EXTENDED_BMI" : "CDC_2000";
    if (ageDays === US_WHO_TO_CDC_TRANSITION_DAYS) warnings.push("transition_boundary");
  } else {
    return unavailable(indicator, input.sex, ageBasis, ageDays, ageMonths, coordinateKind, ["standard_unavailable"]);
  }

  const manifest = datasetKey === "WHO_2006" ? loadWhoDataset().manifest : datasetKey === "CDC_2000" ? loadCdcDataset().manifest : loadCdcDataset().extendedBmi.manifest;
  if (coordinateKind === "age_months") {
    const rows = datasetKey === "WHO_2006" ? loadWhoDataset().rows.filter((row) => row.indicator === indicator && row.sex === input.sex) : datasetKey === "CDC_2000" ? loadCdcDataset().rows.filter((row) => row.indicator === indicator && row.sex === input.sex) : loadCdcDataset().extendedBmi.rows.filter((row) => row.indicator === indicator && row.sex === input.sex);
    const coordinates = rows.map((row) => Number(row.coordinateValue)).filter(Number.isFinite);
    if (coordinates.length === 0 || ageMonths < Math.min(...coordinates) || ageMonths > Math.max(...coordinates)) return unavailable(indicator, input.sex, ageBasis, ageDays, ageMonths, coordinateKind, ["standard_unavailable", ...warnings]);
  }
  return Object.freeze({ status: "selected", standard: identity(datasetKey, manifest), datasetKey, indicator, sex: input.sex, ageBasis, ageDays, ageMonths, coordinateKind, warnings: [...new Set(warnings)] });
}
