import { readFile } from "node:fs/promises";
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
if (!option("--plan") || !option("--project-ref")) { process.stderr.write("usage: node scripts/clinical/rollback-package.mjs --plan <json> --project-ref <ref>\n"); process.exitCode = 2; }
else { const plan = JSON.parse(await readFile(option("--plan"), "utf8")); process.stdout.write(JSON.stringify({ dryRun: true, projectRef: option("--project-ref"), targetReleaseId: plan.targetReleaseId, reason: plan.reason }) + "\n"); process.stderr.write("DRY_RUN_ONLY: rollback requires fresh evidence and scoped repository\n"); }
