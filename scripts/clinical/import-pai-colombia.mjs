import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { canonicalize } from "json-canonicalize";

const [, , inputPath, outputPath, manifestPath] = process.argv;
if (!inputPath || !outputPath || !manifestPath) throw new Error("USAGE: import-pai-colombia.mjs input.json output.json manifest.json");

const input = JSON.parse(await readFile(inputPath, "utf8"));
if (input.countryCode !== "CO" || input.domain !== "immunization") throw new Error("PAI_COUNTRY_OR_DOMAIN_MISMATCH");
if (!Array.isArray(input.sourceReferences) || input.sourceReferences.length === 0) throw new Error("PAI_SOURCE_REFERENCES_REQUIRED");
if (!Array.isArray(input.rules) || !Array.isArray(input.dependencies)) throw new Error("PAI_REVIEWED_MAPPING_REQUIRED");
if (input.sourceReferences.some((source) => !String(source.uri).includes("minsalud.gov.co") && !String(source.uri).includes("vacunacion.minsalud.gov.co"))) throw new Error("PAI_NON_OFFICIAL_SOURCE");
if (input.sourceReferences.some((source) => !/^[a-f0-9]{64}$/.test(String(source.digest)))) throw new Error("PAI_IMMUTABLE_DIGEST_REQUIRED");

const payload = {
  schemaVersion: "pai-colombia-reviewed-import-v1",
  domain: "immunization",
  countryCode: "CO",
  package: input.package,
  sourceReferences: [...input.sourceReferences].sort((left, right) => String(left.id).localeCompare(String(right.id))),
  rules: [...input.rules].sort((left, right) => String(left.code).localeCompare(String(right.code))),
  dependencies: [...input.dependencies].sort((left, right) => `${left.ruleId}|${left.dependsOnRuleId}`.localeCompare(`${right.ruleId}|${right.dependsOnRuleId}`)),
  review: input.review ?? { state: "pending_external_clinical_approval" },
};
const bytes = Buffer.from(canonicalize(payload));
const digest = createHash("sha256").update(bytes).digest("hex");
await writeFile(outputPath, bytes);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await writeFile(manifestPath, canonicalize({ ...manifest, lastImport: { countryCode: "CO", payloadSha256: digest, sourceCount: payload.sourceReferences.length, ruleCount: payload.rules.length, dependencyCount: payload.dependencies.length, activation: "blocked_pending_external_clinical_approval" } }));
console.log(JSON.stringify({ countryCode: "CO", payloadSha256: digest, sourceCount: payload.sourceReferences.length, ruleCount: payload.rules.length, dependencyCount: payload.dependencies.length, activation: "blocked_pending_external_clinical_approval" }));
