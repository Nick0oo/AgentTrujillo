import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";
import type { ApprovalAttestation } from "../../clinical/governance/approval-types.ts";
import type { ApprovalRepository } from "../../clinical/governance/approval-repository.ts";

export function createClinicalApprovalRepository(client: SupabaseClient<Database>): ApprovalRepository {
  return Object.freeze({
    async recordAttestation(attestation: ApprovalAttestation) {
      const { data, error } = await client.from("clinical_approvals").insert({
        rule_pack_id: attestation.rulePackId,
        artifact_sha256: attestation.artifactSha256,
        approver_name: "verified-clinical-approver",
        approver_user_id: attestation.approverSubject,
        decision: attestation.decision,
        notes: null,
        decided_at: attestation.decidedAt,
        attestation_version: attestation.attestationVersion,
        algorithm_id: attestation.algorithmId,
        algorithm_implementation_sha256: attestation.algorithmImplementationSha256,
        source_set_sha256: attestation.sourceSetSha256,
        manifest_sha256: attestation.manifestSha256,
        approver_subject: attestation.approverSubject,
        approver_role: attestation.approverRole,
        withdrawal_of: attestation.withdrawalOf,
        request_id: attestation.requestId,
      }).select().single();
      if (error || !data) throw new Error("APPROVAL_RECORD_FAILED");
      return attestation;
    },
  });
}
