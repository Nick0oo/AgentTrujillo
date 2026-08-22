import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { fileURLToPath } from "node:url";

import { addCalendarInterval } from "../../src/clinical/immunization/calendar.ts";
import { compilePaiColombiaPack } from "../../src/clinical/immunization/colombia-pai.ts";
import { paiColombiaPackSchema } from "../../src/clinical/immunization/packs/pai-colombia-schema.ts";
import { acipUsPackSchema } from "../../src/clinical/immunization/packs/acip-us-schema.ts";
import { classifyDoseStatus } from "../../src/clinical/immunization/status.ts";
import { compileAcipUsPack } from "../../src/clinical/immunization/us-acip.ts";
import type { CompiledRulePack } from "../../src/clinical/immunization/rule-packs.ts";
import type { VaccineCatalog } from "../../src/clinical/immunization/types.ts";

export type ImmunizationFixtureCase = Readonly<{
  id: string;
  kind?: string;
  ruleCode: string;
  dateOfBirth: string;
  asOfDate: string;
  expectedStatus: string;
  critical?: boolean;
  provenance: Readonly<{
    sourceIds: readonly string[];
    approval: Readonly<{ status: "pending_external" | "approved"; manifestSha256: string | null; attestationId: string | null }>;
  }>;
}>;

export type ImmunizationFixture = Readonly<{
  schemaVersion: string;
  country: "CO" | "US";
  package: Readonly<{ id: string; version: string; sourceDigest: string; approvalState: "blocked" | "approved" }>;
  source: Readonly<{ locator: string; approvalDigest: string | null; reviewerState: string }>;
  cases: readonly ImmunizationFixtureCase[];
}>;

export type ImmunizationEvalResult = Readonly<{
  country: "CO" | "US";
  passed: number;
  blocked: number;
  failed: number;
  criticalDiscrepancies: number;
  crossCountryMixes: number;
  provenanceGaps: number;
  digest: string;
}>;

function readFixture(name: "co-pai-cases.json" | "us-acip-cases.json"): ImmunizationFixture {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/immunization/${name}`, import.meta.url)), "utf8")) as ImmunizationFixture;
}

function compileCountryPack(country: "CO" | "US"): CompiledRulePack | null {
  const url = country === "CO"
    ? new URL("../../src/clinical/immunization/data/pai-colombia-basic-2026.json", import.meta.url)
    : new URL("../../src/clinical/immunization/data/acip-us-basic-2025.json", import.meta.url);
  const raw = JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
  const parsed = country === "CO" ? paiColombiaPackSchema.parse(raw) : acipUsPackSchema.parse(raw);
  const antigens = [...new Set(parsed.rules.map((rule) => rule.antigenCode))].map((antigenCode, index) => ({
    id: `${country}-antigen-${index}` as never,
    antigenCode,
    displayName: antigenCode,
    diseaseGroup: antigenCode,
    active: true,
  }));
  const catalog: VaccineCatalog = { version: `${country}-basic`, sourceDigest: "f".repeat(64) as never, antigens, products: [], productAntigens: [] };
  const result = country === "CO"
    ? compilePaiColombiaPack(parsed as never, catalog)
    : compileAcipUsPack(parsed as never, catalog);
  return result.ok && result.pack.activation === "active" ? result.pack : null;
}

function actualStatus(pack: CompiledRulePack, entry: ImmunizationFixtureCase): string | null {
  const rule = pack.rules.find((candidate) => candidate.code === entry.ruleCode);
  if (!rule) return null;
  const dueFrom = rule.targetAge === null ? null : addCalendarInterval(entry.dateOfBirth, rule.targetAge);
  const dueUntil = rule.targetAgeUntil === null ? null : addCalendarInterval(entry.dateOfBirth, rule.targetAgeUntil);
  return classifyDoseStatus({
    asOfDate: entry.asOfDate,
    dueFrom,
    dueUntil,
    reviewRequired: rule.kind !== "routine" || rule.contraindicationReviewRequired,
  }).status;
}

function evaluateFixture(fixture: ImmunizationFixture): ImmunizationEvalResult {
  const invalidCountry = fixture.cases.some((entry) =>
    (entry.id.startsWith("CO-") && fixture.country !== "CO") || (entry.id.startsWith("US-") && fixture.country !== "US"));
  const pack = fixture.package.approvalState === "approved" && fixture.source.approvalDigest !== null
    ? compileCountryPack(fixture.country)
    : null;
  const blocked = pack === null ? fixture.cases.length : 0;
  const provenanceGaps = fixture.cases.filter((entry) =>
    entry.provenance.sourceIds.length === 0
    || entry.provenance.approval.status !== "approved"
    || !entry.provenance.approval.manifestSha256
    || !entry.provenance.approval.attestationId).length;
  const results = pack === null ? [] : fixture.cases.map((entry) => ({ entry, actual: actualStatus(pack, entry) }));
  const failed = invalidCountry ? fixture.cases.length : results.filter(({ entry, actual }) => actual !== entry.expectedStatus).length;
  const criticalDiscrepancies = results.filter(({ entry, actual }) => entry.critical === true && actual !== entry.expectedStatus).length;
  const digest = createHash("sha256").update(canonicalize(fixture)).digest("hex");
  return {
    country: fixture.country,
    passed: pack === null ? 0 : fixture.cases.length - failed,
    blocked,
    failed,
    criticalDiscrepancies,
    crossCountryMixes: invalidCountry ? 1 : 0,
    provenanceGaps,
    digest,
  };
}

export function runImmunizationEval(): readonly ImmunizationEvalResult[] {
  return [evaluateFixture(readFixture("co-pai-cases.json")), evaluateFixture(readFixture("us-acip-cases.json"))];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(`${JSON.stringify(runImmunizationEval(), null, 2)}\n`);
}
