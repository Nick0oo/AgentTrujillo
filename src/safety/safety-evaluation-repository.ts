import { createHmac, createHash } from "node:crypto";

import type { SafetyDecision } from "./message-types";
import type { SafetyDecisionEvidence } from "./red-flag-evidence";

export type SafetyEvaluationScope = Readonly<{
  careSpaceId: string;
  childId: string;
  ownerUserId: string;
  agentSessionId: string | null;
  requestId: string;
}>;

export type SafetyEvaluationRecord = Readonly<{
  rulePackId: string;
  decision: SafetyDecision;
  matchedRuleCodes: readonly string[];
  approvedCopyKey: string | null;
  inputFingerprint: string;
  decisionSha256: string;
  algorithmKey: string;
  algorithmVersion: string;
  copyDigestSha256: string | null;
  evaluationVersion: string;
  latencyMs: number | null;
}>;

export type SafetyEvaluationStored = Readonly<{ evaluationId: string; created: boolean }>;
export type SafetyEvaluationRepository = Readonly<{ recordOnce(scope: SafetyEvaluationScope, record: SafetyEvaluationRecord, signal?: AbortSignal): Promise<SafetyEvaluationStored> }>;

export class SafetyRecordConflict extends Error {
  constructor() { super("SAFETY_EVALUATION_CONFLICT"); this.name = "SafetyRecordConflict"; }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
}

export function buildSafetyInputFingerprint(input: Readonly<{ hmacKey: string; normalizedInput: unknown }>): string {
  if (!input.hmacKey || input.hmacKey.length < 32) throw new Error("SAFETY_HMAC_KEY_UNAVAILABLE");
  return createHmac("sha256", input.hmacKey).update(canonical(input.normalizedInput), "utf8").digest("hex");
}

export function buildDecisionSha256(input: Readonly<{ decision: SafetyDecision; matchedRuleCodes: readonly string[]; algorithmKey: string; algorithmVersion: string; copyDigestSha256: string | null }>): string {
  return createHash("sha256").update(canonical({ decision: input.decision, matchedRuleCodes: [...input.matchedRuleCodes].sort(), algorithmKey: input.algorithmKey, algorithmVersion: input.algorithmVersion, copyDigestSha256: input.copyDigestSha256 }), "utf8").digest("hex");
}

export function redactSafetyEvidence(evidence: SafetyDecisionEvidence): Readonly<{ ruleCodes: readonly string[]; warnings: readonly string[]; operationCount: number }> {
  return Object.freeze({ ruleCodes: Object.freeze([...new Set(evidence.evidence.map((item) => item.ruleCode))].filter((code) => /^[a-z0-9_.-]{1,96}$/i.test(code)).sort()), warnings: Object.freeze(evidence.warnings.filter((warning) => /^[A-Z0-9_.-]{1,64}$/.test(warning))), operationCount: Math.max(0, Math.min(100_000, Math.trunc(evidence.operationCount))) });
}
