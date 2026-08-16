import { readFile } from "node:fs/promises";
import { verifyArtifactBytes } from "../../src/clinical/governance/checksum.ts";
import { clinicalArtifactPath, CLINICAL_SOURCES_BUCKET } from "../../src/clinical/governance/artifact-store.ts";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const file = option("--file");
const expected = option("--expected");
const projectRef = option("--project-ref") ?? process.env.SUPABASE_PROJECT_REF ?? "unknown";
const confirm = args.includes("--confirm");
if (!file || !expected || !option("--domain") || !option("--country") || !projectRef) {
  process.stderr.write("usage: node scripts/clinical/upload-artifact.mjs --file <path> --expected <sha256> --domain <domain> --country <CO|US|GLOBAL> --project-ref <ref> [--confirm]\n");
  process.exitCode = 2;
} else {
  const bytes = new Uint8Array(await readFile(file));
  const verified = verifyArtifactBytes(bytes, expected);
  const path = clinicalArtifactPath(option("--domain"), option("--country"), verified.digest);
  process.stdout.write(JSON.stringify({ dryRun: !confirm, projectRef, bucket: CLINICAL_SOURCES_BUCKET, path, artifactSha256: verified.digest }) + "\n");
  if (confirm) {
    process.stderr.write("UPLOAD_NOT_WIRED: invoke the scoped ClinicalArtifactStore from a trusted job\n");
    process.exitCode = 2;
  }
}
