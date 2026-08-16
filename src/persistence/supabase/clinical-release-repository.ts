import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import type { ClinicalReleaseRepository } from "../../clinical/governance/release-repository.ts";
import type { ClinicalReleasePlan, ClinicalReleaseResult } from "../../clinical/governance/release-types.ts";

export function createClinicalReleaseRepository(client: SupabaseClient<Database>): ClinicalReleaseRepository {
  return Object.freeze({
    async activate(plan: ClinicalReleasePlan, previewSha256: string) {
      const { data, error } = await (client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: ClinicalReleaseResult | null; error: unknown | null }> }).rpc("activate_clinical_package", {
        p_rule_pack_id: plan.rulePackId, p_artifact_sha256: plan.artifactSha256, p_algorithm_id: plan.algorithmId,
        p_approval_id: plan.approvalId, p_domain: plan.domain, p_country_code: plan.countryCode, p_locale: plan.locale,
        p_activation_at: plan.activationAt, p_previous_release_id: plan.previousReleaseId, p_evidence_sha256: plan.evidenceSha256,
        p_requester_subject: plan.requesterSubject, p_request_id: plan.requestId, p_action: plan.action, p_preview_sha256: previewSha256,
      });
      if (error || !data) throw new Error("RELEASE_ACTIVATION_FAILED");
      return data;
    },
  });
}
