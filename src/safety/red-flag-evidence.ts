import type { TextSpan, SafetyDecision } from "./message-types";
import type { SafetyAgeContext } from "./safety-age-context";
import type { SafetyMeasurement } from "./measurement-normalization";
import type { AssertionContextResult } from "./assertion-context";
import type { CompiledRedFlagPack, EvidencePredicate } from "./red-flag-pack-types";
import type { NormalizedMessage, TrustedSafetyContext } from "./message-types";

export type PredicateResult = "true" | "false" | "ambiguous" | "not_applicable";
export type ConceptEvidence = Readonly<{ conceptId: string; result: PredicateResult; spans: readonly TextSpan[] }>;

export type SafetyEvidenceInput = Readonly<{
  message: NormalizedMessage;
  trustedContext: TrustedSafetyContext;
  ageContext?: SafetyAgeContext;
  assertions?: readonly AssertionContextResult[];
  measurements?: readonly SafetyMeasurement[];
  concepts?: readonly ConceptEvidence[];
}>;

export type MatchedSafetyEvidence = Readonly<{
  ruleCode: string;
  priority: number;
  predicateResult: PredicateResult;
  ruleSpans: readonly TextSpan[];
  scopeFingerprint: string;
  packageId: string;
  packageVersion: string;
  algorithmKey: string;
  algorithmVersion: string;
}>;

export type SafetyDecisionEvidence = Readonly<{
  evidence: readonly MatchedSafetyEvidence[];
  warnings: readonly string[];
  operationCount: number;
}>;

export type SafetyEngineResult = SafetyDecision & SafetyDecisionEvidence;

export type PredicateEvaluation = Readonly<{ result: PredicateResult; spans: readonly TextSpan[] }>;

export function emptyDecisionEvidence(): SafetyDecisionEvidence {
  return Object.freeze({ evidence: Object.freeze([]), warnings: Object.freeze([]), operationCount: 0 });
}

export function evaluatePredicate(_predicate: EvidencePredicate, _input: SafetyEvidenceInput, _pack: CompiledRedFlagPack): PredicateEvaluation {
  throw new Error("EVALUATOR_NOT_BOUND");
}
