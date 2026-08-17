import type { SupabaseClient } from "@supabase/supabase-js";

import { createAccessDenied } from "../../../agent/lib/access/access-denied.ts";
import { hasPermission, type AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Database } from "./database.types.ts";
import type { ImmunizationRepository, RecordConfirmedAdministrationInput, VaccinationAssessmentWrite } from "../../clinical/immunization/repository.ts";

type Client = SupabaseClient<Database>;

function requestId(value?: string): string {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : "immunization";
}

function failure(code: "CLOUD_PERSISTENCE_ERROR" | "IDEMPOTENCY_CONFLICT" | "CONFIRMATION_INVALID", request: string) {
  return Object.freeze({ ok: false as const, code, requestId: request });
}

function rpcArgs(scope: AuthorizedChildScope, input: RecordConfirmedAdministrationInput) {
  const candidate = input.candidate;
  return {
    p_care_space_id: scope.careSpaceId,
    p_child_id: scope.childId,
    p_country_code: candidate.scope.countryCode,
    p_administered_on: candidate.administeredOn,
    p_vaccine_product_id: candidate.product?.id ?? null,
    p_antigen_ids: [...candidate.antigenIds],
    p_dose_label: candidate.doseLabel,
    p_lot_number: null,
    p_administration_site: null,
    p_provider_name: null,
    p_provenance_type: candidate.provenanceType,
    p_source_digest: candidate.sourceDigest,
    p_confirmation_sha256: candidate.confirmationDigest,
    p_idempotency_key: input.idempotencyKey,
    p_input_fingerprint: input.inputFingerprint,
    p_supersedes_administration_id: input.supersedesAdministrationId ?? null,
    p_supersession_reason: input.supersessionReason ?? null,
  };
}

function assessmentRpcArgs(scope: AuthorizedChildScope, input: VaccinationAssessmentWrite) {
  const assessment = input.assessment;
  return {
    p_care_space_id: scope.careSpaceId,
    p_child_id: scope.childId,
    p_schedule_id: input.scheduleId,
    p_rule_id: assessment.ruleId,
    p_country_code: assessment.scope.countryCode,
    p_as_of_date: assessment.scope.asOfDate,
    p_status: assessment.status,
    p_due_from: assessment.dueFrom,
    p_due_until: assessment.dueUntil,
    p_evidence_administration_ids: [...assessment.evidenceAdministrationIds],
    p_explanation_code: assessment.reasonCode,
    p_rule_pack_id: assessment.rulePackId,
    p_rule_pack_version: assessment.rulePackVersion,
    p_algorithm_id: assessment.algorithmId,
    p_source_digest: assessment.sourceDigest,
    p_input_digest: assessment.inputDigest,
    p_decision_digest: assessment.decisionDigest,
    p_input_fingerprint: input.inputFingerprint,
  };
}

export function createImmunizationRepository(client: Client): ImmunizationRepository {
  const recordConfirmed = async (scope: AuthorizedChildScope, input: RecordConfirmedAdministrationInput, signal?: AbortSignal) => {
      const request = requestId(input.requestId);
      if (!hasPermission(scope, "record") || signal?.aborted) return createAccessDenied(request);
      if (scope.countryOfCare !== input.candidate.scope.countryCode) return failure("CONFIRMATION_INVALID", request);
      try {
        const { data, error } = await client.rpc("record_confirmed_vaccine_administration" as never, rpcArgs(scope, input) as never);
        if (error) return failure(error.code === "23505" ? "IDEMPOTENCY_CONFLICT" : "CLOUD_PERSISTENCE_ERROR", request);
        const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
        if (!row || typeof row.administration_id !== "string" || (row.outcome !== "created" && row.outcome !== "idempotent_replay")) return failure("CLOUD_PERSISTENCE_ERROR", request);
        return { outcome: row.outcome, administrationId: row.administration_id } as const;
      } catch {
        return failure("CLOUD_PERSISTENCE_ERROR", request);
      }
    };
  const saveAssessment = async (scope: AuthorizedChildScope, input: VaccinationAssessmentWrite, signal?: AbortSignal) => {
    const request = requestId(input.requestId);
    if (!hasPermission(scope, "record") || signal?.aborted) return createAccessDenied(request);
    if (scope.countryOfCare !== input.assessment.scope.countryCode) return failure("CONFIRMATION_INVALID", request);
    try {
      const { data, error } = await client.rpc("persist_vaccination_assessment" as never, assessmentRpcArgs(scope, input) as never);
      if (error) return failure(error.code === "23505" ? "IDEMPOTENCY_CONFLICT" : "CLOUD_PERSISTENCE_ERROR", request);
      const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
      if (!row || typeof row.assessment_id !== "string" || (row.outcome !== "created" && row.outcome !== "idempotent_replay")) return failure("CLOUD_PERSISTENCE_ERROR", request);
      return { outcome: row.outcome, assessmentId: row.assessment_id } as const;
    } catch {
      return failure("CLOUD_PERSISTENCE_ERROR", request);
    }
  };
  return Object.freeze({ recordConfirmed, recordConfirmedAdministration: recordConfirmed, supersedeAdministration: recordConfirmed, saveAssessment });
}
