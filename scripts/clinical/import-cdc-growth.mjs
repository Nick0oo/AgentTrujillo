import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { canonicalize } from "json-canonicalize";

const [, , inputPath, outputPath, manifestPath] = process.argv;
if (!inputPath || !outputPath || !manifestPath) throw new Error("USAGE: import-cdc-growth.mjs input.json output.json manifest.json");
const input = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(input.rows) || !Array.isArray(input.extendedRows)) throw new Error("CDC_SOURCE_ROWS_REQUIRED");
const rows = [...input.rows].sort((left, right) => `${left.indicator}|${left.sex}|${left.coordinateKind}|${left.coordinateValue}`.localeCompare(`${right.indicator}|${right.sex}|${right.coordinateKind}|${right.coordinateValue}`));
const extendedRows = [...input.extendedRows].sort((left, right) => `${left.indicator}|${left.sex}|${left.coordinateValue}`.localeCompare(`${right.indicator}|${right.sex}|${right.coordinateValue}`));
const payload = { datasetKey: "CDC_2000", version: "1.0.0", rows, extendedRows };
const bytes = Buffer.from(canonicalize(payload));
const normalizedDigest = createHash("sha256").update(bytes).digest("hex");
const extendedNormalizedDigest = createHash("sha256").update(canonicalize({ datasetKey: "CDC_2022_EXTENDED_BMI", version: "1.0.0", rows: extendedRows })).digest("hex");
await writeFile(outputPath, bytes);
await writeFile(manifestPath, `${canonicalize({ ...JSON.parse(await readFile(manifestPath, "utf8")), rowCount: rows.length, extendedRowCount: extendedRows.length, normalizedDigest, extendedNormalizedDigest })}`);
console.log(JSON.stringify({ rowCount: rows.length, extendedRowCount: extendedRows.length, normalizedDigest, extendedNormalizedDigest }));
