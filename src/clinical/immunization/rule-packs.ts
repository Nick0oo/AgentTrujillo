import { compareCalendarDates, isCalendarDate } from "./calendar.ts";
import { validateDependencyGraph } from "./dependencies.ts";
import type { ImmunizationCountry, ImmunizationRule, RuleDependency, VaccineCatalog } from "./types.ts";
import { isSha256Hex } from "../anthropometry/value-objects.ts";

export type RulePackSourceReference = Readonly<{ id: string; uri: string; digest: string }>;
export type RulePackApprovalState = "blocked" | "approved";
export type RulePackStatus = "candidate" | "approved" | "retired";

export type RuleInput = Readonly<Omit<ImmunizationRule, "id" | "antigenId" | "sourceReferences"> & {
  id: string;
  antigenCode: string;
  sourceReferenceIds: readonly string[];
}>;

export type RulePackInput = Readonly<{
  packageId: string;
  version: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: RulePackStatus;
  approvalState: RulePackApprovalState;
  sourceReferences: readonly RulePackSourceReference[];
  sourceDigest: string;
  rules: readonly RuleInput[];
  dependencies: readonly RuleDependency[];
}>;

export type CompiledRulePack = Readonly<{
  packageId: string;
  version: string;
  countryCode: ImmunizationCountry;
  effectiveFrom: string;
  effectiveUntil: string | null;
  activation: "active" | "blocked" | "retired";
  sourceReferences: readonly RulePackSourceReference[];
  sourceDigest: string;
  rules: readonly ImmunizationRule[];
  dependencies: readonly RuleDependency[];
}>;

export type PackCompileResult<T extends CompiledRulePack = CompiledRulePack> =
  | Readonly<{ ok: true; pack: T }>
  | Readonly<{ ok: false; issues: readonly string[] }>;

export function compileRulePack<T extends CompiledRulePack>(input: RulePackInput, expectedCountry: ImmunizationCountry, catalog: VaccineCatalog): PackCompileResult<T> {
  const issues: string[] = [];
  if (!input.packageId.trim()) issues.push("PACKAGE_ID_REQUIRED");
  if (!input.version.trim()) issues.push("PACKAGE_VERSION_REQUIRED");
  if (!isCalendarDate(input.effectiveFrom) || (input.effectiveUntil !== null && !isCalendarDate(input.effectiveUntil))) issues.push("INVALID_EFFECTIVE_WINDOW");
  if (isCalendarDate(input.effectiveFrom) && input.effectiveUntil !== null && isCalendarDate(input.effectiveUntil)
    && compareCalendarDates(input.effectiveUntil, input.effectiveFrom) < 0) issues.push("INVALID_EFFECTIVE_WINDOW");
  if (!isSha256Hex(input.sourceDigest)) issues.push("INVALID_SOURCE_DIGEST");
  if (input.sourceReferences.length === 0) issues.push("SOURCE_REFERENCES_REQUIRED");
  const sourceIds = new Set<string>();
  for (const source of input.sourceReferences) {
    if (!source.id.trim() || sourceIds.has(source.id)) issues.push("DUPLICATE_SOURCE_ID");
    sourceIds.add(source.id);
    if (!source.uri.startsWith("https://")) issues.push("SOURCE_URI_NOT_HTTPS");
    if (!isSha256Hex(source.digest)) issues.push("INVALID_SOURCE_REFERENCE_DIGEST");
    const uri = source.uri.toLocaleLowerCase("en-US");
    if (expectedCountry === "CO" && uri.includes("cdc.gov")) issues.push("SOURCE_COUNTRY_MISMATCH");
    if (expectedCountry === "US" && (uri.includes("minsalud.gov.co") || uri.includes("vacunacion.minsalud.gov.co"))) issues.push("SOURCE_COUNTRY_MISMATCH");
  }
  const ruleIds = new Set<string>();
  const ruleCodes = new Set<string>();
  const scopeBySeriesDose = new Map<string, ImmunizationRule["kind"]>();
  const rules: ImmunizationRule[] = [];
  for (const rule of input.rules) {
    if (!rule.id.trim() || !rule.code.trim() || !rule.seriesCode.trim() || !rule.doseCode.trim()) issues.push("RULE_IDENTITY_REQUIRED");
    if (!Number.isInteger(rule.doseNumber) || rule.doseNumber < 1) issues.push("RULE_DOSE_NUMBER_INVALID");
    if (rule.countryCode !== expectedCountry) issues.push("RULE_COUNTRY_MISMATCH");
    if (ruleIds.has(rule.id)) issues.push("DUPLICATE_RULE_ID");
    if (ruleCodes.has(rule.code)) issues.push("DUPLICATE_RULE_CODE");
    if (!["routine", "catch_up", "special_population", "campaign", "outbreak", "review_only"].includes(rule.kind)) issues.push("RULE_KIND_INVALID");
    if (rule.sourceReferenceIds.length === 0) issues.push("RULE_SOURCE_REFERENCES_REQUIRED");
    if (rule.eligibilityCriteria === null || typeof rule.eligibilityCriteria !== "object" || Array.isArray(rule.eligibilityCriteria)) issues.push("RULE_ELIGIBILITY_INVALID");
    const seriesDose = `${rule.seriesCode}|${rule.doseCode}`;
    const priorKind = scopeBySeriesDose.get(seriesDose);
    if (priorKind && ((priorKind === "campaign" || priorKind === "outbreak") !== (rule.kind === "campaign" || rule.kind === "outbreak"))) issues.push("CAMPAIGN_ROUTINE_COLLISION");
    scopeBySeriesDose.set(seriesDose, rule.kind);
    ruleIds.add(rule.id);
    ruleCodes.add(rule.code);
    const antigen = catalog.antigens.find((candidate) => candidate.antigenCode === rule.antigenCode && candidate.active);
    if (!antigen) issues.push("RULE_ANTIGEN_NOT_IN_CATALOG");
    for (const sourceReferenceId of rule.sourceReferenceIds) if (!sourceIds.has(sourceReferenceId)) issues.push("RULE_SOURCE_REFERENCE_MISSING");
    if (antigen) {
      const { antigenCode: _antigenCode, sourceReferenceIds: _sourceReferenceIds, ...rest } = rule;
      rules.push({ ...rest, id: rule.id as ImmunizationRule["id"], antigenId: antigen.id, sourceReferences: rule.sourceReferenceIds });
    }
  }
  for (const dependency of input.dependencies) {
    if (dependency.ruleId === dependency.dependsOnRuleId) issues.push("DEPENDENCY_SELF_REFERENCE");
    if (!ruleIds.has(dependency.ruleId) || !ruleIds.has(dependency.dependsOnRuleId)) issues.push("DEPENDENCY_RULE_MISSING");
    if (!["previous_dose", "either_or", "conditional", "excludes"].includes(dependency.dependencyType)) issues.push("DEPENDENCY_TYPE_INVALID");
    if (dependency.minimumInterval && (!Number.isInteger(dependency.minimumInterval.value) || dependency.minimumInterval.value < 0)) issues.push("DEPENDENCY_INTERVAL_INVALID");
  }
  const graph = validateDependencyGraph(rules, input.dependencies);
  if (!graph.ok) issues.push(...graph.issues);
  if (issues.length > 0) return { ok: false, issues: [...new Set(issues)] };
  const activation = input.status === "retired" ? "retired" : input.status === "approved" && input.approvalState === "approved" ? "active" : "blocked";
  return { ok: true, pack: { packageId: input.packageId, version: input.version, countryCode: expectedCountry, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, activation, sourceReferences: input.sourceReferences, sourceDigest: input.sourceDigest, rules, dependencies: input.dependencies } as unknown as T };
}
