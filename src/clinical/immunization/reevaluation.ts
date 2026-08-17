import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { Sha256Hex } from "../governance/source-types.ts";
import type { AdministrationId, AssessmentId, CalendarDate, ImmunizationCountry, ImmunizationRule, VaccinationAssessment } from "./types.ts";

type ReevaluationAdministration = Readonly<{ id: AdministrationId; administeredOn: CalendarDate; countryCode: ImmunizationCountry; antigenIds: readonly string[] }>;
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
export type CountryChangeReevaluationInput = CountryReevaluationInput & Readonly<{ eventId?: string; idempotencyKey?: string; effectiveAt?: CalendarDate }>;
export type CountryChangeFactDisposition = Readonly<{ administrationId: AdministrationId; disposition: "reused" | "remapped" | "review_required" | "not_relevant"; reasonCode: string }>;
export type CountryChangeReevaluationResult = CountryReevaluationResult & Readonly<{ priorCountry: ImmunizationCountry; eventId: string | null; dispositions: readonly CountryChangeFactDisposition[] }>;

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value)).digest("hex") as Sha256Hex;
}

export function reevaluateCountry(input: CountryReevaluationInput): CountryReevaluationResult {
  const assessments = input.rules.map((rule) => {
    const inputDigest = digest({ childId: input.childId, careSpaceId: input.careSpaceId, toCountry: input.toCountry, asOfDate: input.asOfDate, rulePack: input.rulePack, rule, confirmedAdministrations: input.confirmedAdministrations });
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

export function reevaluateForCountryChange(_deps: unknown, _scope: unknown, input: CountryChangeReevaluationInput): CountryChangeReevaluationResult {
  const result = reevaluateCountry(input);
  const dispositions = input.confirmedAdministrations.map((administration) => ({
    administrationId: administration.id,
    disposition: administration.countryCode === input.toCountry ? "reused" : "review_required",
    reasonCode: administration.countryCode === input.toCountry ? "TARGET_COUNTRY_FACT" : "FOREIGN_JURISDICTION_FACT",
  } as const));
  return Object.freeze({ ...result, priorCountry: input.fromCountry, eventId: input.eventId ?? null, dispositions: Object.freeze(dispositions) });
}
