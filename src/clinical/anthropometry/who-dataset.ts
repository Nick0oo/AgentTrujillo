import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalize } from "json-canonicalize";

import { deepFreeze } from "./value-objects.ts";

export type WhoReferenceRow = Readonly<{
  indicator: "weight_for_age" | "length_for_age" | "height_for_age" | "head_circumference_for_age";
  sex: "female" | "male";
  coordinateKind: "age_months";
  coordinateValue: string;
  l: string;
  m: string;
  s: string;
  sourceFile: string;
}>;

export type WhoDatasetManifest = Readonly<{
  datasetKey: "WHO_2006";
  version: string;
  license: string;
  sourceArtifacts: readonly Readonly<{ uri: string; file: string; sha256: string; format: string }>[];
  rowCount: number;
  ageRangeMonths: readonly [number, number];
  indicators: readonly string[];
  normalizedDigest: string;
  normalizedFile: string;
}>;

export type WhoGrowthDataset = Readonly<{
  manifest: WhoDatasetManifest;
  rows: readonly WhoReferenceRow[];
  lookup: (input: Readonly<{ indicator: WhoReferenceRow["indicator"]; sex: WhoReferenceRow["sex"]; ageMonths: number }>) => WhoReferenceRow | null;
}>;

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readVerifiedAsset(): Readonly<{ manifest: WhoDatasetManifest; rows: readonly WhoReferenceRow[] }> {
  const manifestUrl = new URL("./data/who/manifest.json", import.meta.url);
  const normalizedUrl = new URL("./data/who/normalized-v1.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as WhoDatasetManifest;
  const bytes = readFileSync(normalizedUrl);
  if (digest(bytes) !== manifest.normalizedDigest) throw new Error("WHO_DATASET_DIGEST_MISMATCH");
  const payload = JSON.parse(bytes.toString("utf8")) as { rows: WhoReferenceRow[] };
  if (payload.rows.length !== manifest.rowCount) throw new Error("WHO_DATASET_ROW_COUNT_MISMATCH");
  return { manifest, rows: payload.rows };
}

export function loadWhoDataset(expectedDigest?: string): WhoGrowthDataset {
  const asset = readVerifiedAsset();
  if (expectedDigest && asset.manifest.normalizedDigest !== expectedDigest) throw new Error("WHO_DATASET_DIGEST_MISMATCH");
  const rows = deepFreeze([...asset.rows].sort((left, right) => `${left.indicator}|${left.sex}|${left.coordinateValue}`.localeCompare(`${right.indicator}|${right.sex}|${right.coordinateValue}`)));
  const rowMap = new Map(rows.map((row) => [`${row.indicator}|${row.sex}|${row.coordinateValue}`, row]));
  return deepFreeze({
    manifest: asset.manifest,
    rows,
    lookup: ({ indicator, sex, ageMonths }) => rowMap.get(`${indicator}|${sex}|${ageMonths}`) ?? null,
  });
}

export function canonicalWhoDigest(value: unknown): string {
  return digest(new TextEncoder().encode(canonicalize(value)));
}
