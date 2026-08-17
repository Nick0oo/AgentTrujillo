import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { hasPermission } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MedicationValidationOutcome } from "./types.ts";

export type DoseValidationIngredientTrace = Readonly<{
  ingredientCode: string;
  declaredAmountLexeme: string | null;
  declaredUnit: string | null;
  convertedAmountLexeme: string | null;
  convertedUnit: string | null;
  arithmeticTrace: Readonly<Record<string, string>>;
}>;

export type DoseValidationWrite = Readonly<{
  requestId: string;
  declaredInput: Readonly<Record<string, unknown>>;
  outcome: MedicationValidationOutcome;
  explanationCodes: readonly string[];
  packageVersion: string;
  algorithmVersion: string;
  vocabularyVersion: string;
  artifactSha256: string | null;
  inputDigest: string;
  decisionDigest: string;
  sourceEvidence: Readonly<Record<string, unknown>>;
  ingredients: readonly DoseValidationIngredientTrace[];
}>;

export type StoredDoseValidation = Readonly<{ validationId: string; outcome: "created" | "idempotent_replay" }>;

export type DoseValidationRepository = Readonly<{
  save(scope: AuthorizedChildScope, input: DoseValidationWrite): Promise<StoredDoseValidation>;
}>;

export function createDoseValidationRepository(client: Readonly<{ rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> }>): DoseValidationRepository {
  return {
    async save(scope, input) {
      if (!hasPermission(scope, "record")) throw new Error("MEDICATION_SCOPE_DENIED");
      const response = await client.rpc("record_dose_validation", {
        p_care_space_id: scope.careSpaceId,
        p_child_id: scope.childId,
        p_request_id: input.requestId,
        p_declared_input: input.declaredInput,
        p_result: input.outcome,
        p_explanation_codes: input.explanationCodes,
        p_package_version: input.packageVersion,
        p_algorithm_version: input.algorithmVersion,
        p_vocabulary_version: input.vocabularyVersion,
        p_artifact_sha256: input.artifactSha256,
        p_input_digest: input.inputDigest,
        p_decision_digest: input.decisionDigest,
        p_source_evidence: input.sourceEvidence,
        p_ingredients: input.ingredients,
      });
      if (response.error) {
        if (response.error.message.includes("idempotency_conflict")) throw new Error("MEDICATION_IDEMPOTENCY_CONFLICT");
        throw new Error("MEDICATION_VALIDATION_WRITE_FAILED");
      }
      const row = Array.isArray(response.data) ? response.data[0] as Record<string, unknown> | undefined : response.data as Record<string, unknown> | null;
      if (!row || typeof row.validation_id !== "string" || (row.outcome !== "created" && row.outcome !== "idempotent_replay")) throw new Error("MEDICATION_VALIDATION_WRITE_FAILED");
      return { validationId: row.validation_id, outcome: row.outcome };
    },
  };
}
