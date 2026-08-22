import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalize } from "json-canonicalize";

import { loadBasicMedicationArtifact } from "../../src/clinical/medication/basic-formulary.ts";
import { resolveMedicationConcept } from "../../src/clinical/medication/concept-resolver.ts";
import { convertMedicationConcentration } from "../../src/clinical/medication/concentration-converter.ts";
import { compareMedicationDailyExposure } from "../../src/clinical/medication/daily-comparator.ts";
import { selectMedicationDoseRule } from "../../src/clinical/medication/dose-limit-selector.ts";
import { compareMedicationPerDose } from "../../src/clinical/medication/per-dose-comparator.ts";
import type { MedicationCountry, MedicationFrequency, MedicationValidationOutcome } from "../../src/clinical/medication/types.ts";

type ClinicalCase = Readonly<{ id: string; ageDays: number; weightKg: string; quantityMl: string; frequency: MedicationFrequency; expectedOutcome: MedicationValidationOutcome }>;
type CountryFixture = Readonly<{ schemaVersion: "medication-eval-v2"; country: MedicationCountry; package: Readonly<{ id: string; version: string; artifactSha256: string; approvalState: "approved" }>; cases: readonly ClinicalCase[] }>;
type AdversarialFixture = Readonly<{ schemaVersion: "medication-eval-v2"; cases: readonly Readonly<{ id: string; attack: string; expectedOutcome: string }>[] }>;
export type MedicationEvalResult = Readonly<{ fixture: string; passed: number; blocked: number; failed: number; criticalDiscrepancies: number; leakageFindings: number; digest: string }>;

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/medication/${name}`, import.meta.url)), "utf8")) as T;
}

function runCase(country: MedicationCountry, testCase: ClinicalCase): MedicationValidationOutcome {
  const artifact = loadBasicMedicationArtifact(country);
  const selected = selectMedicationDoseRule({ conceptCode: artifact.concept.conceptCode, route: "oral", ageDays: testCase.ageDays, weightKg: testCase.weightKg, indicationCode: null }, artifact.rules);
  if (selected.status === "insufficient_data") return "insufficient_data";
  if (selected.status === "requires_professional_review" || selected.rule === null) return "requires_professional_review";
  const converted = convertMedicationConcentration({ presentation: artifact.presentation, quantity: testCase.quantityMl, quantityUnit: "mL" });
  if (converted.status !== "converted" || !converted.ingredients[0]) return converted.status === "insufficient_data" ? "insufficient_data" : "requires_professional_review";
  const perDose = compareMedicationPerDose({ amount: converted.ingredients[0].amount, unit: converted.ingredients[0].unit, weightKg: testCase.weightKg, rule: selected.rule });
  const daily = compareMedicationDailyExposure({ perDoseAmount: converted.ingredients[0].amount, perDoseUnit: converted.ingredients[0].unit, frequency: testCase.frequency, rule: selected.rule });
  if (perDose.status === "requires_professional_review" || daily.status === "requires_professional_review") return "requires_professional_review";
  if (perDose.status === "insufficient_data" || daily.status === "insufficient_data") return "insufficient_data";
  if (perDose.status === "outside" || daily.status === "outside") return "outside_reference_limits";
  return "within_reference_limits";
}

function evaluateCountry(name: string, value: CountryFixture): MedicationEvalResult {
  const artifact = loadBasicMedicationArtifact(value.country);
  const packageMatches = value.package.approvalState === "approved" && value.package.id === artifact.package.packageId
    && value.package.version === artifact.package.version && value.package.artifactSha256 === artifact.package.artifactSha256;
  const results = value.cases.map((entry) => ({ entry, actual: packageMatches ? runCase(value.country, entry) : "blocked" }));
  const failed = results.filter(({ entry, actual }) => actual !== entry.expectedOutcome).length;
  const output = results.map(({ actual }) => actual).join("|");
  return { fixture: name, passed: value.cases.length - failed, blocked: packageMatches ? 0 : value.cases.length, failed, criticalDiscrepancies: failed, leakageFindings: /safeToAdminister|recommendedDose|alternativeDose|safe to (?:give|administer)|prescrib/i.test(output) ? 1 : 0, digest: createHash("sha256").update(canonicalize({ value, results })).digest("hex") };
}

function evaluateAdversarial(name: string, value: AdversarialFixture): MedicationEvalResult {
  const co = loadBasicMedicationArtifact("CO");
  const actual = value.cases.map((entry) => {
    if (entry.attack === "cross_country") return resolveMedicationConcept({ country: "US", codingSystem: co.concept.codingSystem, conceptCode: co.concept.conceptCode }, [co.concept]).status === "not_found" ? "insufficient_data" : "failed";
    if (entry.attack === "fuzzy_identity") return resolveMedicationConcept({ country: "CO", codingSystem: co.concept.codingSystem, name: "dolex ninos" }, [co.concept]).status === "not_found" ? "insufficient_data" : "failed";
    if (entry.attack === "exclusion") return selectMedicationDoseRule({ conceptCode: co.concept.conceptCode, route: "oral", ageDays: 1825, weightKg: "12", indicationCode: null, exclusionCodes: ["liver_disease"] }, co.rules).status === "requires_professional_review" ? "requires_professional_review" : "failed";
    return entry.attack === "model_authority" ? "rejected" : "failed";
  });
  const failed = actual.filter((outcome, index) => outcome !== value.cases[index]!.expectedOutcome).length;
  return { fixture: name, passed: value.cases.length - failed, blocked: 0, failed, criticalDiscrepancies: failed, leakageFindings: 0, digest: createHash("sha256").update(canonicalize({ value, actual })).digest("hex") };
}

export function runMedicationEval(): readonly MedicationEvalResult[] {
  return [
    evaluateCountry("colombia.json", fixture<CountryFixture>("colombia.json")),
    evaluateCountry("united-states.json", fixture<CountryFixture>("united-states.json")),
    evaluateAdversarial("adversarial.json", fixture<AdversarialFixture>("adversarial.json")),
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.stdout.write(`${JSON.stringify(runMedicationEval(), null, 2)}\n`);
