import type { SupabaseClient } from "@supabase/supabase-js";

import type { SafetyEvaluationRepository, SafetyEvaluationScope, SafetyEvaluationRecord } from "../../safety/safety-evaluation-repository";
import type { Database } from "./database.types";

export function createSafetyEvaluationRepository(client: SupabaseClient<Database>): SafetyEvaluationRepository {
  return Object.freeze({
    async recordOnce(scope: SafetyEvaluationScope, record: SafetyEvaluationRecord, signal?: AbortSignal) {
      if (signal?.aborted) throw new Error("SAFETY_RECORD_CANCELLED");
      const decision = record.decision;
      const { data, error } = await client.rpc("record_safety_evaluation" as never, {
        p_care_space_id: scope.careSpaceId,
        p_child_id: scope.childId,
        p_owner_user_id: scope.ownerUserId,
        p_agent_session_id: scope.agentSessionId,
        p_request_id: scope.requestId,
        p_rule_pack_id: record.rulePackId,
        p_decision: decision.decision,
        p_response_mode: decision.responseMode,
        p_matched_rule_codes: [...record.matchedRuleCodes],
        p_approved_copy_key: "copyKey" in decision ? decision.copyKey : record.approvedCopyKey,
        p_input_fingerprint: record.inputFingerprint,
        p_decision_sha256: record.decisionSha256,
        p_algorithm_key: record.algorithmKey,
        p_algorithm_version: record.algorithmVersion,
        p_copy_digest_sha256: record.copyDigestSha256,
        p_evaluation_version: record.evaluationVersion,
        p_latency_ms: record.latencyMs,
      } as never);
      if (error) {
        if (error.message.includes("fingerprint conflict")) throw new Error("SAFETY_EVALUATION_CONFLICT");
        throw new Error("SAFETY_EVALUATION_UNAVAILABLE");
      }
      const row = Array.isArray(data) ? data[0] as { evaluation_id: string; created: boolean } | undefined : undefined;
      if (!row?.evaluation_id) throw new Error("SAFETY_EVALUATION_UNAVAILABLE");
      return Object.freeze({ evaluationId: row.evaluation_id, created: row.created });
    },
  });
}
