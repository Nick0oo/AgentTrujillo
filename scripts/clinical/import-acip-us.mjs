import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { canonicalize } from "json-canonicalize";

const [, , inputPath, outputPath, manifestPath] = process.argv;
if (!inputPath || !outputPath || !manifestPath) throw new Error("USAGE: import-acip-us.mjs input.json output.json manifest.json");

const input = JSON.parse(await readFile(inputPath, "utf8"));
if (input.countryCode !== "US" || input.domain !== "immunization") throw new Error("ACIP_COUNTRY_OR_DOMAIN_MISMATCH");
if (!Array.isArray(input.sourceReferences) || input.sourceReferences.length === 0) throw new Error("ACIP_SOURCE_REFERENCES_REQUIRED");
if (!Array.isArray(input.rules) || !Array.isArray(input.dependencies)) throw new Error("ACIP_REVIEWED_MAPPING_REQUIRED");
if (input.sourceReferences.some((source) => !String(source.uri).includes("cdc.gov"))) throw new Error("ACIP_NON_OFFICIAL_SOURCE");
if (input.sourceReferences.some((source) => !/^[a-f0-9]{64}$/.test(String(source.digest)))) throw new Error("ACIP_IMMUTABLE_DIGEST_REQUIRED");
if (!input.officialStatus || !["current", "superseded", "stayed", "unknown"].includes(input.officialStatus.state)) throw new Error("ACIP_OFFICIAL_STATUS_REQUIRED");

const payload = {
  schemaVersion: "acip-us-reviewed-import-v1",
  domain: "immunization",
  countryCode: "US",
  package: input.package,
  officialStatus: input.officialStatus,
  sourceReferences: [...input.sourceReferences].sort((left, right) => String(left.id).localeCompare(String(right.id))),
  rules: [...input.rules].sort((left, right) => String(left.code).localeCompare(String(right.code))),
  dependencies: [...input.dependencies].sort((left, right) => `${left.ruleId}|${left.dependsOnRuleId}`.localeCompare(`${right.ruleId}|${right.dependsOnRuleId}`)),
  review: input.review ?? { state: "pending_external_clinical_approval" },
};
const bytes = Buffer.from(canonicalize(payload));
const digest = createHash("sha256").update(bytes).digest("hex");
await writeFile(outputPath, bytes);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await writeFile(manifestPath, canonicalize({ ...manifest, lastImport: { countryCode: "US", payloadSha256: digest, sourceCount: payload.sourceReferences.length, ruleCount: payload.rules.length, dependencyCount: payload.dependencies.length, activation: "blocked_pending_external_clinical_approval" } }));
console.log(JSON.stringify({ countryCode: "US", payloadSha256: digest, sourceCount: payload.sourceReferences.length, ruleCount: payload.rules.length, dependencyCount: payload.dependencies.length, activation: "blocked_pending_external_clinical_approval" }));
