import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalize } from "json-canonicalize";

import { deepFreeze } from "./value-objects.ts";

export type CdcLmsRow = Readonly<{
  standardKey: "CDC_2000" | "CDC_2022_EXTENDED_BMI";
  indicator: string;
  sex: "female" | "male";
  coordinateKind: "age_months" | "length_cm" | "height_cm";
  coordinateValue: string;
  l: string;
  m: string;
  s: string;
  sigma?: string;
  p95?: string;
  sourceFile: string;
}>;

export type CdcDatasetManifest = Readonly<{
  datasetKey: "CDC_2000" | "CDC_2022_EXTENDED_BMI";
  version: string;
  license: string;
  sourceArtifacts: readonly Readonly<{ uri: string; file: string; sha256: string; format: string }>[];
  rowCount: number;
  extendedRowCount?: number;
  indicators: readonly string[];
  normalizedDigest: string;
  normalizedFile: string;
}>;

type Dataset = Readonly<{
  manifest: CdcDatasetManifest;
  rows: readonly CdcLmsRow[];
  lookup: (input: Readonly<{ indicator: string; sex: CdcLmsRow["sex"]; ageMonths?: string | number; coordinateKind?: CdcLmsRow["coordinateKind"]; coordinateValue?: string | number }>) => CdcLmsRow | null;
}>;

export type CdcGrowthDataset = Dataset & Readonly<{ extendedBmi: Dataset }>;

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function createLookup(rows: readonly CdcLmsRow[]) {
  const map = new Map(rows.map((row) => [`${row.indicator}|${row.sex}|${row.coordinateKind}|${row.coordinateValue}`, row]));
  return (input: Readonly<{ indicator: string; sex: CdcLmsRow["sex"]; ageMonths?: string | number; coordinateKind?: CdcLmsRow["coordinateKind"]; coordinateValue?: string | number }>) => {
    const coordinateKind = input.coordinateKind ?? "age_months";
    const coordinateValue = String(input.coordinateValue ?? input.ageMonths ?? "");
    return map.get(`${input.indicator}|${input.sex}|${coordinateKind}|${coordinateValue}`) ?? null;
  };
}

function makeDataset(manifest: CdcDatasetManifest, rows: readonly CdcLmsRow[]): Dataset {
  const frozenRows = deepFreeze([...rows]);
  return deepFreeze({ manifest, rows: frozenRows, lookup: createLookup(frozenRows) });
}

export function loadCdcDataset(expectedDigest?: string): CdcGrowthDataset {
  const manifestUrl = new URL("./data/cdc/manifest.json", import.meta.url);
  const normalizedUrl = new URL("./data/cdc/normalized-v1.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as CdcDatasetManifest & { extendedNormalizedDigest: string; extendedRowCount: number };
  const bytes = readFileSync(normalizedUrl);
  if (digest(bytes) !== manifest.normalizedDigest || (expectedDigest && manifest.normalizedDigest !== expectedDigest)) throw new Error("CDC_DATASET_DIGEST_MISMATCH");
  const payload = JSON.parse(bytes.toString("utf8")) as { rows: CdcLmsRow[]; extendedRows: CdcLmsRow[] };
  if (payload.rows.length !== manifest.rowCount || payload.extendedRows.length !== manifest.extendedRowCount) throw new Error("CDC_DATASET_ROW_COUNT_MISMATCH");
  const extendedPayload = { datasetKey: "CDC_2022_EXTENDED_BMI", version: manifest.version, rows: payload.extendedRows };
  const extendedDigest = digest(new TextEncoder().encode(canonicalize(extendedPayload)));
  if (extendedDigest !== manifest.extendedNormalizedDigest) throw new Error("CDC_EXTENDED_DATASET_DIGEST_MISMATCH");
  const main = makeDataset(manifest, payload.rows);
  const extendedManifest: CdcDatasetManifest = {
    datasetKey: "CDC_2022_EXTENDED_BMI",
    version: manifest.version,
    license: manifest.license,
    sourceArtifacts: manifest.sourceArtifacts.filter((source) => source.file === "cdc-bmi-age-2022.csv"),
    rowCount: payload.extendedRows.length,
    indicators: ["bmi_for_age"],
    normalizedDigest: manifest.extendedNormalizedDigest,
    normalizedFile: manifest.normalizedFile,
  };
  return deepFreeze({ manifest: main.manifest, rows: main.rows, lookup: main.lookup, extendedBmi: makeDataset(extendedManifest, payload.extendedRows) });
}
