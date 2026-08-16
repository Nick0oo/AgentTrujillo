import { deepFreeze, type ApprovedEmergencyCopyKey } from "./message-types";
import { redFlagPackV1Schema } from "./red-flag-pack-schema";
import { RED_FLAG_PACK_LIMITS, type CompiledRedFlagPack, type RedFlagPackV1, type RedFlagRule, type EvidencePredicate } from "./red-flag-pack-types";

export type VerifiedResolvedEmergencyPackage = Readonly<{
  pack: RedFlagPackV1;
  verification: "governed" | "synthetic_test_only";
}>;

export class RedFlagPackError extends Error {
  readonly code: "INVALID_PACK" | "PACK_TOO_COMPLEX" | "PACK_NOT_VERIFIED" | "PACK_UNAVAILABLE";

  constructor(code: RedFlagPackError["code"]) {
    super(code);
    this.name = "RedFlagPackError";
    this.code = code;
  }
}

function countPredicates(predicate: EvidencePredicate, depth = 1): { count: number; depth: number } {
  if (depth > RED_FLAG_PACK_LIMITS.maxTreeDepth) throw new RedFlagPackError("PACK_TOO_COMPLEX");
  if (predicate.kind === "all" || predicate.kind === "any") {
    return predicate.predicates.reduce((total, child) => {
      const next = countPredicates(child, depth + 1);
      return { count: total.count + next.count, depth: Math.max(total.depth, next.depth) };
    }, { count: 0, depth });
  }
  return { count: 1, depth };
}

function normalizePattern(pattern: string): string {
  return pattern.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function compileRedFlagPack(input: VerifiedResolvedEmergencyPackage): CompiledRedFlagPack {
  if (input.verification !== "governed" && input.verification !== "synthetic_test_only") throw new RedFlagPackError("PACK_NOT_VERIFIED");
  const parsed = redFlagPackV1Schema.safeParse(input.pack);
  if (!parsed.success) throw new RedFlagPackError("INVALID_PACK");
  const pack = parsed.data;
  const conceptMap = new Map<string, { id: string; patterns: readonly string[] }>();
  for (const concept of pack.concepts) conceptMap.set(concept.id, deepFreeze({ id: concept.id, patterns: deepFreeze(concept.patterns.map(normalizePattern)) }));
  const references = new Set(conceptMap.keys());
  const visit = (predicate: EvidencePredicate): void => {
    if (predicate.kind === "concept" && !references.has(predicate.conceptId)) throw new RedFlagPackError("INVALID_PACK");
    if (predicate.kind === "all" || predicate.kind === "any") predicate.predicates.forEach(visit);
  };
  const rules: RedFlagRule[] = [];
  for (const rule of pack.rules as unknown as readonly RedFlagRule[]) {
    const complexity = countPredicates(rule.predicate);
    if (complexity.count > RED_FLAG_PACK_LIMITS.maxPredicatesPerRule) throw new RedFlagPackError("PACK_TOO_COMPLEX");
    visit(rule.predicate);
    rules.push(rule);
  }
  rules.sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code));
  return deepFreeze({
    packageId: pack.packageId,
    jurisdiction: pack.jurisdiction,
    locale: pack.locale,
    version: pack.version,
    algorithm: deepFreeze({ ...pack.algorithm }),
    activation: input.verification === "synthetic_test_only" || pack.approval.status === "synthetic_test_only" ? "synthetic_test_only" : "approved",
    copyKeys: deepFreeze([...new Set(pack.copyKeys)] as ApprovedEmergencyCopyKey[]),
    concepts: conceptMap,
    rules: deepFreeze(rules),
  });
}
