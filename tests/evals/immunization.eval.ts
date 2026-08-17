import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { fileURLToPath } from "node:url";

export type ImmunizationFixtureCase = Readonly<{ id: string; kind?: string; expectedStatus?: string; expectedOutcome?: string; critical?: boolean; provenance: Readonly<{ sourceIds: readonly string[]; approval: Readonly<{ status: "pending_external" | "approved"; manifestSha256: string | null; attestationId: string | null }> }> }>;
export type ImmunizationFixture = Readonly<{ schemaVersion: string; country: "CO" | "US"; package: Readonly<{ id: string; version: string; sourceDigest: string; approvalState: "blocked" | "approved" }>; source: Readonly<{ locator: string; approvalDigest: string | null; reviewerState: string }>; cases: readonly ImmunizationFixtureCase[] }>;
export type ImmunizationEvalResult = Readonly<{ country: "CO" | "US"; passed: number; blocked: number; failed: number; criticalDiscrepancies: number; crossCountryMixes: number; provenanceGaps: number; digest: string }>;

function readFixture(name: "co-pai-cases.json" | "us-acip-cases.json"): ImmunizationFixture {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/immunization/${name}`, import.meta.url)), "utf8")) as ImmunizationFixture;
}

function evaluateFixture(fixture: ImmunizationFixture): ImmunizationEvalResult {
  const invalidCountry = fixture.cases.some((entry) => entry.id.startsWith("CO-") && fixture.country !== "CO" || entry.id.startsWith("US-") && fixture.country !== "US");
  const blocked = fixture.package.approvalState !== "approved" || fixture.source.approvalDigest === null ? fixture.cases.length : 0;
  const provenanceGaps = fixture.cases.filter((entry) => entry.provenance.sourceIds.length === 0 || !entry.provenance.approval.status || (entry.provenance.approval.status === "approved" && (!entry.provenance.approval.manifestSha256 || !entry.provenance.approval.attestationId))).length;
  const failed = invalidCountry || provenanceGaps > 0 ? fixture.cases.length : 0;
  const criticalDiscrepancies = fixture.cases.filter((entry) => entry.critical === true && entry.expectedStatus !== "review_required").length;
  const digest = createHash("sha256").update(canonicalize(fixture)).digest("hex");
  return { country: fixture.country, passed: failed === 0 ? fixture.cases.length - blocked : 0, blocked, failed, criticalDiscrepancies, crossCountryMixes: invalidCountry ? 1 : 0, provenanceGaps, digest };
}

export function runImmunizationEval(): readonly ImmunizationEvalResult[] {
  return [evaluateFixture(readFixture("co-pai-cases.json")), evaluateFixture(readFixture("us-acip-cases.json"))];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(`${JSON.stringify(runImmunizationEval(), null, 2)}\n`);
}
