import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashAlgorithmManifest } from "../../src/clinical/governance/algorithm-registry.ts";

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const files = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--file" && args[index + 1]) files.push(args[index + 1]);
}
if (!option("--key") || !option("--version") || !option("--runtime") || !option("--dependency-policy") || files.length === 0) {
  process.stderr.write("usage: node scripts/clinical/hash-algorithm.mjs --key <key> --version <semver> --runtime <runtime> --dependency-policy <id> --file <role=path>...\n");
  process.exitCode = 2;
} else {
  const entries = [];
  for (const entry of files) {
    const separator = entry.indexOf("=");
    if (separator <= 0) { process.stderr.write("INVALID_FILE\n"); process.exitCode = 2; break; }
    const role = entry.slice(0, separator);
    const path = entry.slice(separator + 1);
    const bytes = await readFile(path);
    entries.push({ role, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  if (process.exitCode !== 2) {
    const digest = hashAlgorithmManifest({
      algorithmKey: option("--key"), version: option("--version"), runtime: option("--runtime"),
      dependencyPolicy: option("--dependency-policy"), artifactSchemaVersions: [option("--schema", "1")], files: entries,
    });
    process.stdout.write(`${digest}\n`);
  }
}
