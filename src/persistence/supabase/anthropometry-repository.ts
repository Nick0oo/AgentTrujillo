import type { SupabaseClient } from "@supabase/supabase-js";

import { createAccessDenied } from "../../../agent/lib/access/access-denied.ts";
import { hasPermission, type AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Database } from "./database.types.ts";
import type {
  AnthropometryRepository,
  RecordConfirmedInput,
  RepositoryAccessResult,
  PersistedMeasurementCandidate,
  RecordConfirmedResult,
} from "../../clinical/anthropometry/repository.ts";
import type { ConfirmedMeasurement, MeasurementType, NormalizedMeasurementValue } from "../../clinical/anthropometry/types.ts";
import { parseClinicalDecimal } from "../../clinical/anthropometry/decimal.ts";

type Client = SupabaseClient<Database>;
type Row = Record<string, unknown>;

function requestId(value?: string): string {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : "anthropometry";
}

function denied(value?: string) {
  return createAccessDenied(requestId(value));
}

function writable(scope: AuthorizedChildScope, value?: string) {
  return hasPermission(scope, "record") ? null : denied(value);
}

function readable(scope: AuthorizedChildScope, value?: string) {
  return hasPermission(scope, "read") ? null : denied(value);
}

function signalAborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function exact(value: unknown, fallback = "0") {
  return parseClinicalDecimal(String(value ?? fallback));
}

function normalizedFrom(row: Row): NormalizedMeasurementValue {
  const originalUnit = String(row.original_unit ?? "kg") as NormalizedMeasurementValue["originalUnit"];
  const normalizedUnit = String(row.normalized_unit ?? "kg") as "kg" | "cm";
  return Object.freeze({
    original: exact(row.original_value_lexeme ?? row.original_value),
    originalUnit,
    normalized: exact(row.normalized_value_lexeme ?? row.normalized_value),
    normalizedUnit,
    conversionVersion: String(row.conversion_version ?? "legacy").slice(0, 200),
    roundingMode: (row.rounding_mode === "half_even" ? "half_even" : "none") as "none" | "half_even",
  });
}

function measurementFrom(row: Row): ConfirmedMeasurement | null {
  const id = typeof row.id === "string" ? row.id : null;
  const careSpaceId = typeof row.care_space_id === "string" ? row.care_space_id : null;
  const childId = typeof row.child_id === "string" ? row.child_id : null;
  const recordedBy = typeof row.recorded_by === "string" ? row.recorded_by : null;
  const inputFingerprint = typeof row.input_fingerprint === "string" ? row.input_fingerprint : null;
  if (!id || !careSpaceId || !childId || !recordedBy || !inputFingerprint || row.validation_status !== "confirmed") return null;
  const validationStatus = "confirmed" as const;
  return Object.freeze({
    id: id as ConfirmedMeasurement["id"],
    scopeFingerprint: String(row.scope_fingerprint ?? "") as ConfirmedMeasurement["scopeFingerprint"],
    careSpaceId,
    childId,
    measurementType: String(row.measurement_type) as MeasurementType,
    value: normalizedFrom(row),
    occurredAt: String(row.occurred_at),
    localDate: String(row.local_date),
    timeZone: String(row.time_zone),
    measurementMethod: String(row.measurement_method ?? "unknown") as ConfirmedMeasurement["measurementMethod"],
    provenanceType: String(row.provenance_type ?? "import") as ConfirmedMeasurement["provenanceType"],
    recordedBy,
    validationStatus,
    inputFingerprint,
  });
}

function assessmentPayload(input: RecordConfirmedInput) {
  return input.assessments.map(({ rulePackId, algorithmId, result }) => ({
    rule_pack_id: rulePackId,
    algorithm_id: algorithmId,
    standard_key: result.standard?.key ?? "unavailable",
    standard_version: result.standard?.version ?? null,
    dataset_digest: result.provenance.datasetDigest,
    indicator: result.indicator,
    chronological_age_days: result.age.chronologicalAgeDays,
    corrected_age_days: result.age.correctedAgeDays,
    correction_applied: result.age.basis === "corrected",
    z_score_lexeme: result.zScore?.canonical ?? null,
    percentile_lexeme: result.percentile?.canonical ?? null,
    result_status: result.status,
    warnings: [...result.warnings],
    assessed_at: result.age.referenceInstant,
    input_digest: result.provenance.inputDigest,
    decision_digest: result.provenance.decisionDigest,
    algorithm_version: result.provenance.algorithmId,
    age_basis: result.age.basis,
    interpretation: result.interpretation,
    transition_reason: result.warnings.includes("transition_boundary") ? "standard_transition" : null,
  }));
}

function rpcResult(data: unknown, value?: string): RepositoryAccessResult<RecordConfirmedResult> {
  const row = Array.isArray(data) ? data[0] as Row | undefined : undefined;
  if (!row || typeof row.measurement_id !== "string" || (row.outcome !== "created" && row.outcome !== "idempotent_replay")) return denied(value);
  const assessmentIds = Array.isArray(row.assessment_ids) ? row.assessment_ids.filter((id): id is string => typeof id === "string") : [];
  return Object.freeze({ outcome: row.outcome, measurementId: row.measurement_id, assessmentIds });
}

export function createAnthropometryRepository(client: Client): AnthropometryRepository {
  return Object.freeze({
    async recordConfirmed(scope, input, request, signal) {
      const writableDenial = writable(scope, request);
      if (writableDenial || signalAborted(signal)) return writableDenial ?? denied(request);
      try {
        const result = await client.rpc("record_confirmed_anthropometry" as never, {
          p_care_space_id: scope.careSpaceId,
          p_child_id: scope.childId,
          p_idempotency_key: input.idempotencyKey,
          p_input_fingerprint: input.inputFingerprint,
          p_confirmation_sha256: input.confirmation.confirmationSha256,
          p_confirmation_expires_at: input.confirmation.expiresAt,
          p_measurement_type: input.command.measurementType,
          p_original_value_lexeme: input.normalized.original.canonical,
          p_original_unit: input.normalized.originalUnit,
          p_normalized_value_lexeme: input.normalized.normalized.canonical,
          p_normalized_unit: input.normalized.normalizedUnit,
          p_occurred_at: input.command.occurredAt,
          p_local_date: input.command.localDate,
          p_time_zone: input.command.timeZone,
          p_measurement_method: input.command.measurementMethod ?? "unknown",
          p_device: input.command.device ?? null,
          p_provenance_type: input.command.provenanceType ?? "guardian",
          p_conversion_version: input.normalized.conversionVersion,
          p_rounding_mode: input.normalized.roundingMode,
          p_hmac_key_id: input.hmacKeyId ?? null,
          p_capture_policy_id: input.capturePolicyId ?? null,
          p_capture_policy_version: input.capturePolicyVersion ?? null,
          p_assessments: assessmentPayload(input),
          p_supersedes_measurement_id: input.supersedesMeasurementId ?? null,
          p_supersession_reason: input.supersessionReason ?? null,
        } as never);
        if (!result.error) return rpcResult(result.data, request);
        if (result.error.message.includes("idempotency_conflict")) return { code: "IDEMPOTENCY_CONFLICT", requestId: requestId(request) };
        if (result.error.message.includes("confirmation_invalid")) return { code: "CONFIRMATION_INVALID", requestId: requestId(request) };
        return denied(request);
      } catch {
        return denied(request);
      }
    },
    async findByIdempotency(scope, idempotencyKey, request, signal) {
      const readDenial = readable(scope, request);
      if (readDenial || signalAborted(signal)) return readDenial ?? denied(request);
      try {
        const result = await client.from("anthropometric_measurements").select("id, input_fingerprint")
          .eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId)
          .eq("recorded_by", scope.actorUserId).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (result.error) return denied(request);
        const row = result.data as unknown as Row | null;
        return row?.id && row.input_fingerprint ? { measurementId: String(row.id), inputFingerprint: String(row.input_fingerprint) } : null;
      } catch {
        return denied(request);
      }
    },
    async findLikelyDuplicates(scope, candidate: PersistedMeasurementCandidate, request, signal) {
      const readDenial = readable(scope, request);
      if (readDenial || signalAborted(signal)) return readDenial ?? denied(request);
      try {
        const result = await client.from("anthropometric_measurements").select("id, input_fingerprint")
          .eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId)
          .eq("measurement_type", candidate.measurementType).eq("local_date", candidate.localDate)
          .eq("validation_status", "confirmed");
        if (result.error || !Array.isArray(result.data)) return denied(request);
        return Object.freeze((result.data as unknown as Row[]).flatMap((row) => row.id && row.input_fingerprint ? [{ id: String(row.id), inputFingerprint: String(row.input_fingerprint) }] : []));
      } catch {
        return denied(request);
      }
    },
    async getConfirmed(scope, measurementId, request, signal) {
      const readDenial = readable(scope, request);
      if (readDenial || signalAborted(signal)) return readDenial ?? denied(request);
      try {
        const result = await client.from("anthropometric_measurements").select("*").eq("id", measurementId)
          .eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId)
          .eq("validation_status", "confirmed").maybeSingle();
        if (result.error) return denied(request);
        return result.data ? measurementFrom(result.data as unknown as Row) : null;
      } catch {
        return denied(request);
      }
    },
    async listCompanions(scope, input, request, signal) {
      const readDenial = readable(scope, request);
      if (readDenial || signalAborted(signal)) return readDenial ?? denied(request);
      const windowMs = Math.min(30, Math.max(0, input.windowDays ?? 7)) * 86400000;
      const at = new Date(input.occurredAt).getTime();
      if (!Number.isFinite(at)) return denied(request);
      try {
        const result = await client.from("anthropometric_measurements").select("*")
          .eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId)
          .eq("measurement_type", input.measurementType).eq("validation_status", "confirmed")
          .gte("occurred_at", new Date(at - windowMs).toISOString()).lte("occurred_at", new Date(at + windowMs).toISOString())
          .order("occurred_at", { ascending: false }).limit(20);
        if (result.error || !Array.isArray(result.data)) return denied(request);
        return Object.freeze((result.data as unknown as Row[]).map(measurementFrom).filter((row): row is ConfirmedMeasurement => row !== null));
      } catch {
        return denied(request);
      }
    },
    async supersede(scope, previousMeasurementId, input, request, signal) {
      return this.recordConfirmed(scope, { ...input, supersedesMeasurementId: previousMeasurementId, supersessionReason: input.supersessionReason ?? "corrected_measurement" }, request, signal);
    },
  });
}
