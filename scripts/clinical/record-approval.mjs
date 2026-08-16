import { readFile } from "node:fs/promises";
import { buildApprovalManifest } from "../../src/clinical/governance/approval-policy.ts";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const manifestFile = option("--manifest");
const projectRef = option("--project-ref") ?? process.env.SUPABASE_PROJECT_REF ?? "unknown";
if (!manifestFile || !option("--approver-subject") || !option("--decision")) {
  process.stderr.write("usage: node scripts/clinical/record-approval.mjs --manifest <json> --approver-subject <uuid> --decision <approved|rejected|withdrawn> --project-ref <ref>\n");
  process.exitCode = 2;
} else {
  const input = JSON.parse(await readFile(manifestFile, "utf8"));
  const manifest = buildApprovalManifest(input);
  process.stdout.write(JSON.stringify({ dryRun: true, projectRef, decision: option("--decision"), approverSubject: option("--approver-subject"), manifestSha256: manifest.manifestSha256 }) + "\n");
  process.stderr.write("DRY_RUN_ONLY: no approval was recorded\n");
}
