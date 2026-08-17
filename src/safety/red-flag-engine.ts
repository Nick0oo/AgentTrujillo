import { deepFreeze, type ApprovedClarification, type SafetyDecision } from "./message-types";
import { type CompiledRedFlagPack, type EvidencePredicate, type PredicateOperator } from "./red-flag-pack-types";
import { clarificationDecision, indeterminateDecision, urgentDecision } from "./safety-decision";
import type { ConceptEvidence, MatchedSafetyEvidence, PredicateResult, SafetyDecisionEvidence, SafetyEngineResult, SafetyEvidenceInput } from "./red-flag-evidence";
import type { TextSpan } from "./message-types";

export type SafetyEngineLimits = Readonly<{ maxOperations: number; maxRules: number }>;
export const DEFAULT_SAFETY_ENGINE_LIMITS: SafetyEngineLimits = Object.freeze({ maxOperations: 20_000, maxRules: 256 });

export class SafetyEngineError extends Error {
  readonly code: "ENGINE_LIMIT_EXCEEDED" | "ENGINE_INVALID_INPUT";
  constructor(code: SafetyEngineError["code"]) { super(code); this.name = "SafetyEngineError"; this.code = code; }
}

function compare(value: bigint, threshold: bigint, operator: PredicateOperator): boolean {
  if (operator === "eq") return value === threshold;
  if (operator === "gt") return value > threshold;
  if (operator === "gte") return value >= threshold;
  if (operator === "lt") return value < threshold;
  return value <= threshold;
}

function compareNumbers(value: number, threshold: number, operator: PredicateOperator): boolean {
  if (operator === "eq") return value === threshold;
  if (operator === "gt") return value > threshold;
  if (operator === "gte") return value >= threshold;
  if (operator === "lt") return value < threshold;
  return value <= threshold;
}

function conceptResult(predicate: Extract<EvidencePredicate, { kind: "concept" }>, input: SafetyEvidenceInput): { result: PredicateResult; spans: readonly TextSpan[] } {
  const evidence = input.concepts?.find((candidate) => candidate.conceptId === predicate.conceptId);
  if (evidence) return evidence;
  const lexicon = input.message.lexiconMatches.find((match) => match.code === predicate.conceptId);
  return lexicon ? { result: predicate.assertion.includes("present") ? "true" : "ambiguous", spans: [lexicon.span] } : { result: "false", spans: [] };
}

function combine(kind: "all" | "any", values: readonly { result: PredicateResult; spans: readonly TextSpan[] }[]): { result: PredicateResult; spans: readonly TextSpan[] } {
  const spans = values.flatMap((value) => value.spans);
  if (kind === "all") {
    if (values.some((value) => value.result === "false")) return { result: "false", spans };
    if (values.some((value) => value.result === "ambiguous" || value.result === "not_applicable")) return { result: "ambiguous", spans };
    return { result: "true", spans };
  }
  if (values.some((value) => value.result === "true")) return { result: "true", spans };
  if (values.some((value) => value.result === "ambiguous")) return { result: "ambiguous", spans };
  return { result: "false", spans };
}

function evalPredicate(predicate: EvidencePredicate, input: SafetyEvidenceInput, operations: { value: number }, maxOperations: number): { result: PredicateResult; spans: readonly TextSpan[] } {
  operations.value += 1;
  if (operations.value > maxOperations) throw new SafetyEngineError("ENGINE_LIMIT_EXCEEDED");
  if (predicate.kind === "concept") return conceptResult(predicate, input);
  if (predicate.kind === "all" || predicate.kind === "any") return combine(predicate.kind, predicate.predicates.map((child) => evalPredicate(child, input, operations, maxOperations)));
  if (predicate.kind === "measurement") {
    const measurements = input.measurements ?? [];
    if (measurements.some((measurement) => measurement.ambiguity !== "none")) return { result: "ambiguous", spans: measurements.map((measurement) => measurement.span) };
    const match = measurements.find((measurement) => measurement.milliCelsius !== null);
    if (!match?.milliCelsius) return { result: "false", spans: [] };
    const value = match.milliCelsius.numerator;
    const threshold = BigInt(predicate.milliCelsius) * match.milliCelsius.denominator;
    return { result: compare(value, threshold, predicate.operator) ? "true" : "false", spans: [match.span] };
  }
  if (!input.ageContext) return { result: "ambiguous", spans: [] };
  const age = predicate.basis === "chronological" ? input.ageContext.chronologicalAgeDays : input.ageContext.correctedAgeDays;
  return age === null ? { result: "ambiguous", spans: [] } : { result: compareNumbers(age, predicate.days, predicate.operator) ? "true" : "false", spans: [] };
}

function decisionEvidence(evidence: readonly MatchedSafetyEvidence[], warnings: readonly string[], operationCount: number): SafetyDecisionEvidence {
  return deepFreeze({ evidence: [...evidence], warnings: [...warnings], operationCount });
}

export function evaluateRedFlags(input: SafetyEvidenceInput, pack: CompiledRedFlagPack, limits: SafetyEngineLimits = DEFAULT_SAFETY_ENGINE_LIMITS): SafetyEngineResult {
  if (pack.rules.length > limits.maxRules || input.trustedContext.referenceInstant.getTime() !== input.trustedContext.referenceInstant.getTime()) {
    const decision = indeterminateDecision("ENGINE_INVALID_INPUT");
    return deepFreeze({ ...decision, ...decisionEvidence([], ["ENGINE_INVALID_INPUT"], 0) }) as SafetyEngineResult;
  }
  const operations = { value: 0 };
  const matched: MatchedSafetyEvidence[] = [];
  const ambiguous: Array<{ priority: number; code: string; copyKey: CompiledRedFlagPack["rules"][number]["copyKey"] }> = [];
  try {
    for (const rule of pack.rules) {
      if (rule.population.country !== input.trustedContext.countryOfCare) continue;
      const age = input.ageContext?.chronologicalAgeDays;
      if (age !== undefined && (rule.population.minAgeDays !== undefined && age < rule.population.minAgeDays || rule.population.maxAgeDays !== undefined && age > rule.population.maxAgeDays)) continue;
      const evaluated = evalPredicate(rule.predicate, input, operations, limits.maxOperations);
      const evidence = { ruleCode: rule.code, priority: rule.priority, predicateResult: evaluated.result, ruleSpans: evaluated.spans, scopeFingerprint: input.trustedContext.scopeFingerprint, packageId: pack.packageId, packageVersion: pack.version, algorithmKey: pack.algorithm.key, algorithmVersion: pack.algorithm.version };
      if (evaluated.result === "true") matched.push(evidence);
      if (evaluated.result === "ambiguous") ambiguous.push({ priority: rule.priority, code: rule.code, copyKey: rule.copyKey });
    }
  } catch (error) {
    const decision = indeterminateDecision(error instanceof SafetyEngineError ? error.code : "ENGINE_INVALID_INPUT");
    return deepFreeze({ ...decision, ...decisionEvidence(matched, [error instanceof SafetyEngineError ? error.code : "ENGINE_INVALID_INPUT"], operations.value) }) as SafetyEngineResult;
  }
  matched.sort((left, right) => right.priority - left.priority || left.ruleCode.localeCompare(right.ruleCode));
  ambiguous.sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code));
  const warnings: string[] = [];
  let decision: SafetyDecision;
  if (matched.length > 0) decision = urgentDecision(matched.map((item) => item.ruleCode), pack.rules.find((rule) => rule.code === matched[0].ruleCode)!.copyKey);
  else if (ambiguous.length > 0) {
    const candidate = pack.rules.find((rule) => rule.code === ambiguous[0].code)!;
    if (candidate.ambiguityPolicy === "urgent") decision = urgentDecision([candidate.code], candidate.copyKey);
    else if (candidate.ambiguityPolicy === "clarify") decision = clarificationDecision("clarify_subject_or_timing_v1" as ApprovedClarification);
    else decision = indeterminateDecision("AMBIGUOUS_SAFETY_EVIDENCE");
    warnings.push("AMBIGUOUS_SAFETY_EVIDENCE");
  } else decision = { decision: "not_urgent", responseMode: "continue" };
  return deepFreeze({ ...decision, ...decisionEvidence(matched, warnings, operations.value) }) as SafetyEngineResult;
}
