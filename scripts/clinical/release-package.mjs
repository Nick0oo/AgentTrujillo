import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const planFile = option("--plan");
if (!planFile || !option("--project-ref")) {
  process.stderr.write("usage: node scripts/clinical/release-package.mjs --plan <json> --project-ref <ref> [--apply]\n");
  process.exitCode = 2;
} else {
  const plan = JSON.parse(await readFile(planFile, "utf8"));
  const previewSha256 = createHash("sha256").update(canonicalize(plan)).digest("hex");
  process.stdout.write(JSON.stringify({ dryRun: !args.includes("--apply"), projectRef: option("--project-ref"), previewSha256, requestId: plan.requestId }) + "\n");
  if (args.includes("--apply")) { process.stderr.write("APPLY_REQUIRES_SCOPED_RELEASE_REPOSITORY\n"); process.exitCode = 2; }
}
