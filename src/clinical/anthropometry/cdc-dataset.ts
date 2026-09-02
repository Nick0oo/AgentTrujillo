import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  lookup: (input: Readonly<{ indicator: string; sex: CdcLmsRow["sex"]; ageMonths?: string | number; coordinateKind?: CdcLmsRow["coordinateKind"]; coordinateValue?: string | number; sourceFile?: string }>) => CdcLmsRow | null;
}>;

export type CdcGrowthDataset = Dataset & Readonly<{ extendedBmi: Dataset }>;

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function devOnlyReadAsset(relativePath: string): Buffer {
  try {
    return readFileSync(new URL(relativePath, import.meta.url));
  } catch (error) {
    const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    if (!missing || process.env.CRECIMIENTO_GROWTH_MODE !== "DEV_ONLY") throw error;
    return readFileSync(resolve(process.cwd(), "src/clinical/anthropometry", relativePath));
  }
}

function createLookup(rows: readonly CdcLmsRow[]) {
  const logical = new Map<string, CdcLmsRow[]>();
  const exact = new Map<string, CdcLmsRow>();
  for (const row of rows) {
    const key = `${row.indicator}|${row.sex}|${row.coordinateKind}|${row.coordinateValue}`;
    logical.set(key, [...(logical.get(key) ?? []), row]);
    exact.set(`${key}|${row.sourceFile}`, row);
  }
  return (input: Readonly<{ indicator: string; sex: CdcLmsRow["sex"]; ageMonths?: string | number; coordinateKind?: CdcLmsRow["coordinateKind"]; coordinateValue?: string | number; sourceFile?: string }>) => {
    const coordinateKind = input.coordinateKind ?? "age_months";
    const coordinateValue = String(input.coordinateValue ?? input.ageMonths ?? "");
    const key = `${input.indicator}|${input.sex}|${coordinateKind}|${coordinateValue}`;
    if (input.sourceFile) return exact.get(`${key}|${input.sourceFile}`) ?? null;
    const candidates = logical.get(key) ?? [];
    return candidates.length === 1 ? candidates[0] : null;
  };
}

function makeDataset(manifest: CdcDatasetManifest, rows: readonly CdcLmsRow[]): Dataset {
  const exactKeys = new Set<string>();
  for (const row of rows) {
    const key = `${row.indicator}|${row.sex}|${row.coordinateKind}|${row.coordinateValue}|${row.sourceFile}`;
    if (exactKeys.has(key)) throw new Error("CDC_DATASET_DUPLICATE_ROW");
    exactKeys.add(key);
  }
  const frozenRows = deepFreeze([...rows]);
  return deepFreeze({ manifest, rows: frozenRows, lookup: createLookup(frozenRows) });
}

export function loadCdcDataset(expectedDigest?: string): CdcGrowthDataset {
  const manifest = JSON.parse(devOnlyReadAsset("./data/cdc/manifest.json").toString("utf8")) as CdcDatasetManifest & { extendedNormalizedDigest: string; extendedRowCount: number };
  const bytes = devOnlyReadAsset("./data/cdc/normalized-v1.json");
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
