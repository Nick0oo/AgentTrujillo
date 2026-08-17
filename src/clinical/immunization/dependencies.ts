import type { AdministrationId, DependencyGraph, EvidenceAssignment, ImmunizationRule, ImmunizationRuleId, RuleDependency, RuleSatisfaction } from "./types.ts";

export type DependencyGraphValidation = Readonly<{ ok: true; topologicalOrder: readonly ImmunizationRuleId[] }> | Readonly<{ ok: false; issues: readonly string[] }>;
export type RuleEvidence = Readonly<{ ruleId: ImmunizationRuleId; administrationId: AdministrationId }>;
export type { DependencyGraph, EvidenceAssignment, RuleSatisfaction };

export function validateDependencyGraph(rules: readonly ImmunizationRule[], dependencies: readonly RuleDependency[]): DependencyGraphValidation {
  const known = new Set(rules.map((rule) => rule.id));
  const issues: string[] = [];
  const adjacency = new Map<ImmunizationRuleId, ImmunizationRuleId[]>();
  for (const rule of rules) adjacency.set(rule.id, []);
  for (const dependency of dependencies) {
    if (!known.has(dependency.ruleId) || !known.has(dependency.dependsOnRuleId)) issues.push("DEPENDENCY_RULE_MISSING");
    else adjacency.get(dependency.ruleId)!.push(dependency.dependsOnRuleId);
  }
  const visiting = new Set<ImmunizationRuleId>();
  const visited = new Set<ImmunizationRuleId>();
  const order: ImmunizationRuleId[] = [];
  const visit = (id: ImmunizationRuleId) => {
    if (visiting.has(id)) { issues.push("DEPENDENCY_CYCLE"); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of adjacency.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const rule of rules) visit(rule.id);
  if (issues.length > 0) return { ok: false, issues: [...new Set(issues)] };
  return { ok: true, topologicalOrder: order };
}

export function resolveSeriesDependencies(rules: readonly ImmunizationRule[], dependencies: readonly RuleDependency[], validEvidence: readonly RuleEvidence[], _asOfDate: string): readonly RuleSatisfaction[];
export function resolveSeriesDependencies(rules: readonly ImmunizationRule[], validEvidence: readonly RuleEvidence[], context: Readonly<{ dependencies?: readonly RuleDependency[]; asOfDate?: string }>): readonly RuleSatisfaction[];
export function resolveSeriesDependencies(rules: readonly ImmunizationRule[], dependenciesOrEvidence: readonly RuleDependency[] | readonly RuleEvidence[], evidenceOrContext: readonly RuleEvidence[] | Readonly<{ dependencies?: readonly RuleDependency[]; asOfDate?: string }>, _asOfDate?: string): readonly RuleSatisfaction[] {
  const dependencyEntries = (dependenciesOrEvidence as readonly RuleDependency[]).filter((entry): entry is RuleDependency => "dependencyType" in entry);
  const dependencies = _asOfDate === undefined ? ((evidenceOrContext as { dependencies?: readonly RuleDependency[] }).dependencies ?? dependencyEntries) : dependencyEntries;
  const validEvidence = _asOfDate === undefined ? dependenciesOrEvidence as readonly RuleEvidence[] : evidenceOrContext as readonly RuleEvidence[];
  const evidenceRules = new Set(validEvidence.map((evidence) => evidence.ruleId));
  return rules.map((rule) => {
    const ownDependencies = dependencies.filter((dependency) => dependency.ruleId === rule.id);
    if (ownDependencies.length === 0) return { ruleId: rule.id, satisfied: true, status: "satisfied", reasonCode: "NO_DEPENDENCY" };
    const alternatives = ownDependencies.filter((dependency) => dependency.dependencyType === "either_or");
    if (alternatives.length > 0) {
      const satisfiedAlternatives = alternatives.filter((dependency) => evidenceRules.has(dependency.dependsOnRuleId));
      if (satisfiedAlternatives.length > 1) return { ruleId: rule.id, satisfied: false, status: "review_required", reasonCode: "EITHER_OR_AMBIGUOUS" };
      if (satisfiedAlternatives.length === 0) return { ruleId: rule.id, satisfied: false, status: "unsatisfied", reasonCode: "EITHER_OR_UNSATISFIED" };
    }
    for (const dependency of ownDependencies.filter((candidate) => candidate.dependencyType !== "either_or")) {
      if (dependency.dependencyType === "excludes" && evidenceRules.has(dependency.dependsOnRuleId)) return { ruleId: rule.id, satisfied: false, status: "excluded", reasonCode: "EXCLUDED_BY_DEPENDENCY" };
      if (dependency.dependencyType !== "excludes" && !evidenceRules.has(dependency.dependsOnRuleId)) return { ruleId: rule.id, satisfied: false, status: "unsatisfied", reasonCode: "DEPENDENCY_UNSATISFIED" };
    }
    return { ruleId: rule.id, satisfied: true, status: "satisfied", reasonCode: "DEPENDENCIES_SATISFIED" };
  });
}
