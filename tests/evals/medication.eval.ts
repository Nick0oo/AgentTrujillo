import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalize } from "json-canonicalize";

type Case = Readonly<{ id: string; expectedOutcome: string; critical?: boolean }>;
type Fixture = Readonly<{ schemaVersion: string; country?: "CO" | "US"; package?: Readonly<{ approvalState: "blocked" | "approved"; sourceIds: readonly string[] }>; cases: readonly Case[] }>;
export type MedicationEvalResult = Readonly<{ fixture: string; passed: number; blocked: number; failed: number; criticalDiscrepancies: number; leakageFindings: number; digest: string }>;

function fixture(name: "colombia.json" | "united-states.json" | "adversarial.json"): Fixture {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/medication/${name}`, import.meta.url)), "utf8")) as Fixture;
}

function evaluate(name: string, value: Fixture): MedicationEvalResult {
  const missingApproval = value.package?.approvalState !== "approved";
  const blocked = missingApproval && value.package ? value.cases.length : 0;
  const failed = value.cases.some((entry) => !entry.id || !entry.expectedOutcome) ? 1 : 0;
  const criticalDiscrepancies = value.cases.filter((entry) => entry.critical === true && entry.expectedOutcome === "within_reference_limits" && missingApproval).length;
  const renderedOutput = value.cases.map((entry) => entry.expectedOutcome).join("|");
  const leakageFindings = /safeToAdminister|recommendedDose|alternativeDose|prescribed|safe to administer/i.test(renderedOutput) ? 1 : 0;
  return { fixture: name, passed: failed === 0 && leakageFindings === 0 ? value.cases.length - blocked : 0, blocked, failed, criticalDiscrepancies, leakageFindings, digest: createHash("sha256").update(canonicalize(value)).digest("hex") };
}

export function runMedicationEval(): readonly MedicationEvalResult[] {
  return [evaluate("colombia.json", fixture("colombia.json")), evaluate("united-states.json", fixture("united-states.json")), evaluate("adversarial.json", fixture("adversarial.json"))];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.stdout.write(`${JSON.stringify(runMedicationEval(), null, 2)}\n`);
