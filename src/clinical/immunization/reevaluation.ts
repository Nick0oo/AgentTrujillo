import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { Sha256Hex } from "../governance/source-types.ts";
import type { AdministrationId, AssessmentId, CalendarDate, ImmunizationCountry, ImmunizationRule, VaccinationAssessment } from "./types.ts";
import type { ImmunizationRepositoryResult } from "./repository.ts";
import { compareCalendarDates } from "./calendar.ts";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";

export type ReevaluationAdministration = Readonly<{ id: AdministrationId; administeredOn: CalendarDate; countryCode: ImmunizationCountry; antigenIds: readonly string[] }>;
export type CountryReevaluationInput = Readonly<{
  childId: string;
  careSpaceId: string;
  fromCountry: ImmunizationCountry;
  toCountry: ImmunizationCountry;
  asOfDate: CalendarDate;
  rulePack: Readonly<{ packageId: string; version: string; countryCode: ImmunizationCountry; activation: "active" | "blocked" | "retired"; sourceDigest: Sha256Hex }>;
  rules: readonly ImmunizationRule[];
  confirmedAdministrations: readonly ReevaluationAdministration[];
  algorithmId: string;
  assessedAt: string;
}>;
export type CountryReevaluationResult = Readonly<{ countryCode: ImmunizationCountry; assessments: readonly VaccinationAssessment[] }>;
export type CountryChangeFactDisposition = Readonly<{ administrationId: AdministrationId; disposition: "reused" | "remapped" | "review_required" | "not_relevant"; reasonCode: string }>;
export type CountryChangeReevaluationResult = CountryReevaluationResult & Readonly<{ priorCountry: ImmunizationCountry; eventId: string | null; dispositions: readonly CountryChangeFactDisposition[] }>;
export type CountryChangeReevaluationInput = Readonly<{
  eventId: string;
  effectiveAt: CalendarDate;
  expectedPriorCountry: ImmunizationCountry;
  newCountry: ImmunizationCountry;
  targetCutoff: CalendarDate;
  idempotencyKey: string;
  priorAssessmentRunId: string | null;
}>;
export type CountryChangeScope = AuthorizedChildScope;
export type CountryChangeTargetPackage = Readonly<CountryReevaluationInput["rulePack"] & {
  rules: readonly ImmunizationRule[];
  scheduleId: string;
  databaseRulePackId: string;
  databaseAlgorithmId: string;
}>;
export type CountryChangeRunWrite = Readonly<{
  eventId: string;
  runId: string;
  reevaluatesRunId: string | null;
  scheduleId: string;
  databaseRulePackId: string;
  databaseAlgorithmId: string;
  countryCode: ImmunizationCountry;
  inputFingerprint: Sha256Hex;
  assessments: readonly VaccinationAssessment[];
}>;
export type CountryChangeDependencies = Readonly<{
  loadConfirmedAdministrations: (scope: CountryChangeScope) => Promise<readonly ReevaluationAdministration[]>;
  resolveTargetPackage: (country: ImmunizationCountry, cutoff: CalendarDate) => Promise<CountryChangeTargetPackage | null>;
  saveCountryChangeRun: (scope: CountryChangeScope, input: CountryChangeRunWrite) => Promise<ImmunizationRepositoryResult<Readonly<{ outcome: "created" | "idempotent_replay"; runId: string; assessmentIds: readonly string[] }>>>;
}>;
export type CountryChangeServiceResult = Readonly<{
  outcome: "created" | "idempotent_replay";
  priorAssessmentRunId: string | null;
  newAssessmentRunId: string;
  assessmentIds: readonly string[];
  dispositions: readonly CountryChangeFactDisposition[];
  assessments: readonly VaccinationAssessment[];
  eventId: string;
}> | Readonly<{ outcome: "rejected"; reasonCode: string }>;

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value)).digest("hex") as Sha256Hex;
}

export function reevaluateCountry(input: CountryReevaluationInput): CountryReevaluationResult {
  const assessments = input.rules.map((rule) => {
    const inputDigest = digest({
      childId: input.childId,
      careSpaceId: input.careSpaceId,
      toCountry: input.toCountry,
      asOfDate: input.asOfDate,
      rulePack: {
        packageId: input.rulePack.packageId,
        version: input.rulePack.version,
        countryCode: input.rulePack.countryCode,
        activation: input.rulePack.activation,
        sourceDigest: input.rulePack.sourceDigest,
      },
      rule,
      confirmedAdministrations: input.confirmedAdministrations,
    });
    const foreignMatching = input.confirmedAdministrations.some((administration) => administration.countryCode !== input.toCountry && administration.antigenIds.includes(rule.antigenId));
    const matching = input.confirmedAdministrations.some((administration) => administration.countryCode === input.toCountry && administration.antigenIds.includes(rule.antigenId));
    const reviewReason = input.rulePack.countryCode !== input.toCountry ? "RULE_PACK_COUNTRY_MISMATCH" : input.rulePack.activation !== "active" ? "RULE_PACK_NOT_ACTIVE" : rule.countryCode !== input.toCountry ? "RULE_COUNTRY_MISMATCH" : foreignMatching ? "FOREIGN_JURISDICTION_FACT" : null;
    const status = reviewReason ? "review_required" : matching ? "applied" : "due";
    const reasonCode = reviewReason ?? (matching ? "DOSE_APPLIED" : "DOSE_DUE");
    const decisionDigest = digest({ inputDigest, status, reasonCode, countryCode: input.toCountry });
    return Object.freeze({
      id: `assessment-${decisionDigest.slice(0, 32)}` as AssessmentId,
      scope: { careSpaceId: input.careSpaceId, childId: input.childId, countryCode: input.toCountry, asOfDate: input.asOfDate },
      ruleId: rule.id,
      status,
      reasonCode,
      dueFrom: null,
      dueUntil: null,
      evidenceAdministrationIds: matching && !reviewReason ? input.confirmedAdministrations.filter((administration) => administration.countryCode === input.toCountry && administration.antigenIds.includes(rule.antigenId)).map((administration) => administration.id) : [],
      rulePackId: input.rulePack.packageId,
      rulePackVersion: input.rulePack.version,
      algorithmId: input.algorithmId,
      sourceDigest: input.rulePack.sourceDigest,
      inputDigest,
      decisionDigest,
      assessedAt: input.assessedAt,
    });
  });
  return Object.freeze({ countryCode: input.toCountry, assessments: Object.freeze(assessments) });
}

function stableUuid(value: unknown): string {
  const hash = digest(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function dispositionsFor(input: CountryReevaluationInput): readonly CountryChangeFactDisposition[] {
  return input.confirmedAdministrations.map((administration) => ({
    administrationId: administration.id,
    disposition: administration.countryCode === input.toCountry ? "reused" : "review_required",
    reasonCode: administration.countryCode === input.toCountry ? "TARGET_COUNTRY_FACT" : "FOREIGN_JURISDICTION_FACT",
  } as const));
}

export async function reevaluateForCountryChange(deps: CountryChangeDependencies, scope: CountryChangeScope, input: CountryChangeReevaluationInput): Promise<CountryChangeServiceResult> {
  if (scope.countryOfCare !== input.expectedPriorCountry) return { outcome: "rejected", reasonCode: "STALE_PRIOR_COUNTRY_CONTEXT" };
  if (input.expectedPriorCountry === input.newCountry) return { outcome: "rejected", reasonCode: "COUNTRY_CHANGE_NOOP" };
  if (input.newCountry !== "CO" && input.newCountry !== "US") return { outcome: "rejected", reasonCode: "COUNTRY_UNSUPPORTED" };
  if (compareCalendarDates(input.effectiveAt, input.targetCutoff) > 0) return { outcome: "rejected", reasonCode: "EVENT_AFTER_TARGET_CUTOFF" };
  if (!input.idempotencyKey.trim()) return { outcome: "rejected", reasonCode: "IDEMPOTENCY_KEY_REQUIRED" };
  const targetPackage = await deps.resolveTargetPackage(input.newCountry, input.targetCutoff);
  if (!targetPackage) return { outcome: "rejected", reasonCode: "TARGET_PACKAGE_UNAVAILABLE" };
  if (targetPackage.activation !== "active" || targetPackage.countryCode !== input.newCountry) return { outcome: "rejected", reasonCode: "TARGET_PACKAGE_NOT_ACTIVE" };
  const facts = await deps.loadConfirmedAdministrations(scope);
  const pureInput: CountryReevaluationInput = {
    childId: scope.childId,
    careSpaceId: scope.careSpaceId,
    fromCountry: input.expectedPriorCountry,
    toCountry: input.newCountry,
    asOfDate: input.targetCutoff,
    rulePack: targetPackage,
    rules: targetPackage.rules,
    confirmedAdministrations: facts,
    algorithmId: targetPackage.databaseAlgorithmId,
    assessedAt: new Date(`${input.targetCutoff}T00:00:00.000Z`).toISOString(),
  };
  const result = reevaluateCountry(pureInput);
  const inputFingerprint = digest({
    eventId: input.eventId,
    effectiveAt: input.effectiveAt,
    expectedPriorCountry: input.expectedPriorCountry,
    newCountry: input.newCountry,
    targetCutoff: input.targetCutoff,
    idempotencyKey: input.idempotencyKey,
    priorAssessmentRunId: input.priorAssessmentRunId,
    targetPackage: {
      packageId: targetPackage.packageId,
      version: targetPackage.version,
      countryCode: targetPackage.countryCode,
      activation: targetPackage.activation,
      sourceDigest: targetPackage.sourceDigest,
      scheduleId: targetPackage.scheduleId,
      databaseRulePackId: targetPackage.databaseRulePackId,
      databaseAlgorithmId: targetPackage.databaseAlgorithmId,
      rules: targetPackage.rules,
    },
    facts: facts.map((fact) => ({ id: fact.id, administeredOn: fact.administeredOn, countryCode: fact.countryCode, antigenIds: [...fact.antigenIds] })),
  });
  const newAssessmentRunId = stableUuid({ inputFingerprint, country: input.newCountry });
  const persisted = await deps.saveCountryChangeRun(scope, { eventId: input.eventId, runId: newAssessmentRunId, reevaluatesRunId: input.priorAssessmentRunId, scheduleId: targetPackage.scheduleId, databaseRulePackId: targetPackage.databaseRulePackId, databaseAlgorithmId: targetPackage.databaseAlgorithmId, countryCode: input.newCountry, inputFingerprint, assessments: result.assessments });
  if (!("outcome" in persisted) || (persisted.outcome !== "created" && persisted.outcome !== "idempotent_replay")) return { outcome: "rejected", reasonCode: "COUNTRY_REEVALUATION_PERSISTENCE_FAILED" };
  return Object.freeze({ outcome: persisted.outcome, priorAssessmentRunId: input.priorAssessmentRunId, newAssessmentRunId, assessmentIds: persisted.assessmentIds, dispositions: dispositionsFor(pureInput), assessments: result.assessments, eventId: input.eventId });
}
