import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { canonicalize } from "json-canonicalize";

const [, , inputPath, outputPath, manifestPath] = process.argv;
if (!inputPath || !outputPath || !manifestPath) throw new Error("USAGE: import-who-growth.mjs input.json output.json manifest.json");
const input = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error("WHO_SOURCE_ROWS_REQUIRED");
const rows = [...input.rows].sort((left, right) => `${left.indicator}|${left.sex}`.localeCompare(`${right.indicator}|${right.sex}`) || Number(left.coordinateValue) - Number(right.coordinateValue));
const payload = { datasetKey: "WHO_2006", version: "1.0.0", rows };
const bytes = Buffer.from(canonicalize(payload));
const normalizedDigest = createHash("sha256").update(bytes).digest("hex");
await writeFile(outputPath, bytes);
await writeFile(manifestPath, `${canonicalize({ ...JSON.parse(await readFile(manifestPath, "utf8")), rowCount: rows.length, normalizedDigest })}`);
console.log(JSON.stringify({ rowCount: rows.length, normalizedDigest }));
