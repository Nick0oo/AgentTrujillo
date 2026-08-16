import type { ApprovedEmergencyCopyKey, AssertionState, SafetyLocale } from "./message-types";

export const RED_FLAG_PACK_LIMITS = Object.freeze({
  maxRules: 256,
  maxTreeDepth: 8,
  maxPredicatesPerRule: 32,
  maxConceptPatterns: 5_000,
});

export type PackJurisdiction = "CO" | "US";
export type PredicateOperator = "eq" | "gt" | "gte" | "lt" | "lte";
export type AmbiguityPolicy = "clarify" | "abstain" | "urgent";

export type AlgorithmReference = Readonly<{
  key: string;
  version: string;
  implementationSha256: string;
}>;

export type PackSourceReference = Readonly<{
  id: string;
  digestSha256: string;
}>;

export type PopulationPredicate = Readonly<{
  country: PackJurisdiction;
  minAgeDays?: number;
  maxAgeDays?: number;
}>;

export type EvidencePredicate =
  | Readonly<{ kind: "concept"; conceptId: string; assertion: readonly AssertionState[] }>
  | Readonly<{ kind: "measurement"; measurement: "temperature"; operator: PredicateOperator; milliCelsius: number }>
  | Readonly<{ kind: "age"; basis: "chronological" | "corrected"; operator: PredicateOperator; days: number }>
  | Readonly<{ kind: "all"; predicates: readonly EvidencePredicate[] }>
  | Readonly<{ kind: "any"; predicates: readonly EvidencePredicate[] }>;

export type RedFlagRule = Readonly<{
  code: string;
  priority: number;
  population: PopulationPredicate;
  predicate: EvidencePredicate;
  ambiguityPolicy: AmbiguityPolicy;
  decision: "urgent";
  copyKey: ApprovedEmergencyCopyKey;
  sourceIds: readonly string[];
}>;

export type RedFlagPackV1 = Readonly<{
  schemaVersion: "emergency-pack-v1";
  packageId: string;
  jurisdiction: PackJurisdiction;
  locale: SafetyLocale;
  version: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  algorithm: AlgorithmReference;
  sources: readonly PackSourceReference[];
  copyKeys: readonly ApprovedEmergencyCopyKey[];
  approval: Readonly<{
    status: "approved" | "synthetic_test_only";
    artifactSha256: string;
    approvalId: string;
  }>;
  concepts: readonly Readonly<{ id: string; patterns: readonly string[] }>[];
  rules: readonly RedFlagRule[];
}>;

export type CompiledConcept = Readonly<{
  id: string;
  patterns: readonly string[];
}>;

export type CompiledRedFlagPack = Readonly<{
  packageId: string;
  jurisdiction: PackJurisdiction;
  locale: SafetyLocale;
  version: string;
  algorithm: AlgorithmReference;
  activation: "approved" | "synthetic_test_only";
  copyKeys: readonly ApprovedEmergencyCopyKey[];
  concepts: ReadonlyMap<string, CompiledConcept>;
  rules: readonly RedFlagRule[];
}>;
