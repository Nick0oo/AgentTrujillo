import { describe, expect, it, vi } from "vitest";

import { buildDecisionSha256, buildSafetyInputFingerprint, redactSafetyEvidence } from "../../src/safety/safety-evaluation-repository";
import { createSafetyEvaluationRepository } from "../../src/persistence/supabase/safety-evaluation-repository";

const decision = { decision: "urgent", responseMode: "emergency_recommendation", ruleCodes: ["synthetic_rule"], copyKey: "emergency_department_es_co_v1" } as const;
const scope = { careSpaceId: "space", childId: "child", ownerUserId: "owner", agentSessionId: null, requestId: "req-1" };

describe("redacted idempotent safety persistence", () => {
  it("uses a keyed fingerprint and never returns plaintext input", () => {
    const fingerprint = buildSafetyInputFingerprint({ hmacKey: "k".repeat(32), normalizedInput: { text: "secret clinical text", locale: "es-CO" } });
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain("secret");
    expect(buildDecisionSha256({ decision, matchedRuleCodes: ["synthetic_rule"], algorithmKey: "safety", algorithmVersion: "1.0.0", copyDigestSha256: null })).toMatch(/^[0-9a-f]{64}$/);
    expect(redactSafetyEvidence({ evidence: [{ ruleCode: "synthetic_rule", priority: 1, predicateResult: "true", ruleSpans: [{ sourceStart: 0, sourceEnd: 1, normalizedStart: 0, normalizedEnd: 1 }], scopeFingerprint: "scope", packageId: "p", packageVersion: "1.0.0", algorithmKey: "a", algorithmVersion: "1.0.0" }], warnings: ["SAFE"], operationCount: 2 })).not.toHaveProperty("spans");
  });

  it("maps one RPC result and never writes raw evidence", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ evaluation_id: "eval-1", created: true }], error: null });
    const repository = createSafetyEvaluationRepository({ rpc } as never);
    const result = await repository.recordOnce(scope, { rulePackId: "pack", decision, matchedRuleCodes: ["synthetic_rule"], approvedCopyKey: decision.copyKey, inputFingerprint: "a".repeat(64), decisionSha256: "b".repeat(64), algorithmKey: "safety", algorithmVersion: "1.0.0", copyDigestSha256: null, evaluationVersion: "safety-eval-v1", latencyMs: 3 });
    expect(result).toEqual({ evaluationId: "eval-1", created: true });
    const params = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(params).not.toHaveProperty("rawText");
    expect(params).not.toHaveProperty("normalizedText");
  });
});
