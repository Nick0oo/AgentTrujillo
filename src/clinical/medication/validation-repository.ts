import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { hasPermission } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MedicationSourceEvidence, MedicationValidationOutcome } from "./types.ts";

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
  sourceEvidence: readonly MedicationSourceEvidence[];
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
      const unavailableOutcome = input.outcome === "insufficient_data" || input.outcome === "requires_professional_review";
      const unavailablePackage = unavailableOutcome && input.packageVersion === "unavailable" && input.artifactSha256 === null;
      const governedPackage = input.packageVersion !== "unavailable" && /^[a-f0-9]{64}$/.test(input.artifactSha256 ?? "");
      if ((!unavailablePackage && !governedPackage)
        || input.explanationCodes.length === 0
        || input.algorithmVersion.length === 0
        || input.vocabularyVersion.length === 0) {
        throw new Error("MEDICATION_GOVERNED_VALIDATION_UNAVAILABLE");
      }
      const sourceKinds = new Set(["identity", "label", "formulary", "algorithm"]);
      const sourcesValid = input.sourceEvidence.length > 0 && input.sourceEvidence.every((source) => {
        const keys = Object.keys(source).sort();
        return keys.join("|") === "artifactSha256|sourceId|sourceKind|sourceUri|sourceVersion"
          && source.sourceId.length > 0
          && source.sourceVersion.length > 0
          && sourceKinds.has(source.sourceKind)
          && /^https:\/\//.test(source.sourceUri)
          && /^[a-f0-9]{64}$/.test(source.artifactSha256);
      });
      if (!sourcesValid) throw new Error("MEDICATION_SOURCE_EVIDENCE_INVALID");
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
