import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type ImmunizationFixtureCase = Readonly<{ id: string; kind?: string; expectedStatus?: string; expectedOutcome?: string; critical?: boolean }>;
export type ImmunizationFixture = Readonly<{ schemaVersion: string; country: "CO" | "US"; package: Readonly<{ id: string; version: string; sourceDigest: string; approvalState: "blocked" | "approved" }>; source: Readonly<{ locator: string; approvalDigest: string | null; reviewerState: string }>; cases: readonly ImmunizationFixtureCase[] }>;
export type ImmunizationEvalResult = Readonly<{ country: "CO" | "US"; passed: number; blocked: number; failed: number; criticalDiscrepancies: number; crossCountryMixes: number; digest: string }>;

function readFixture(name: "co-pai-cases.json" | "us-acip-cases.json"): ImmunizationFixture {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/immunization/${name}`, import.meta.url)), "utf8")) as ImmunizationFixture;
}

function evaluateFixture(fixture: ImmunizationFixture): ImmunizationEvalResult {
  const invalidCountry = fixture.cases.some((entry) => entry.id.startsWith("CO-") && fixture.country !== "CO" || entry.id.startsWith("US-") && fixture.country !== "US");
  const blocked = fixture.package.approvalState !== "approved" || fixture.source.approvalDigest === null ? fixture.cases.length : 0;
  const failed = invalidCountry ? fixture.cases.length : 0;
  const criticalDiscrepancies = fixture.cases.filter((entry) => entry.critical === true && entry.expectedStatus !== "review_required").length;
  return { country: fixture.country, passed: failed === 0 ? fixture.cases.length - blocked : 0, blocked, failed, criticalDiscrepancies, crossCountryMixes: invalidCountry ? 1 : 0, digest: `${fixture.package.sourceDigest}:${fixture.package.version}:${fixture.cases.map((entry) => entry.id).join(",")}` };
}

export function runImmunizationEval(): readonly ImmunizationEvalResult[] {
  return [evaluateFixture(readFixture("co-pai-cases.json")), evaluateFixture(readFixture("us-acip-cases.json"))];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(`${JSON.stringify(runImmunizationEval(), null, 2)}\n`);
}
