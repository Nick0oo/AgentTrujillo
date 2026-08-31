import { createHash } from "node:crypto";

import type { RuntimeConfig } from "../../../agent/lib/config/env.ts";
import { createRequestSupabaseClient } from "../../../agent/lib/supabase/request-client.ts";
import type { AuthenticatedChannelRequest } from "./auth-middleware.ts";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { createAnthropometryRepository } from "../../persistence/supabase/anthropometry-repository.ts";
import { normalizeAnthropometricUnit } from "../../clinical/anthropometry/units.ts";
import { createExactClinicalDecimal } from "../../clinical/anthropometry/value-objects.ts";
import type { RecordConfirmedInput } from "../../clinical/anthropometry/repository.ts";
import type { ConfirmedMeasurement } from "../../clinical/anthropometry/types.ts";
import type { RepositoryAccessResult } from "../../clinical/anthropometry/repository.ts";
import type { AnthropometryRouteMeasurement, AnthropometryCreateRequest, GrowthPersistence } from "./routes/anthropometry.ts";

type PersistenceResult = Readonly<{ code: string }>;

function isDenied(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok?: unknown }).ok === false);
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) throw new Error("LOCAL_DATE_UNAVAILABLE");
  return `${year}-${month}-${day}`;
}

function rawValue(input: AnthropometryCreateRequest): string {
  return typeof input.measurement.value === "string"
    ? input.measurement.value
    : `${input.measurement.value.pounds} lb ${input.measurement.value.ounces} oz`;
}

function fingerprint(scope: AuthorizedChildScope, input: AnthropometryCreateRequest): string {
  return hash(JSON.stringify({
    version: input.version,
    scope: { actorUserId: scope.actorUserId, careSpaceId: scope.careSpaceId, childId: scope.childId },
    measurement: input.measurement,
  }));
}

function toRouteMeasurement(value: RepositoryAccessResult<ConfirmedMeasurement | null>): AnthropometryRouteMeasurement | null {
  if (!value || isDenied(value) || !("id" in value)) return null;
  return Object.freeze({
    id: value.id,
    measurementType: value.measurementType,
    value: value.value.normalized.canonical,
    unit: value.value.normalizedUnit,
    occurredAt: value.occurredAt,
    localDate: value.localDate,
    timeZone: value.timeZone,
    measurementMethod: value.measurementMethod,
    provenanceType: value.provenanceType,
    sourceNote: value.sourceNote ?? null,
  });
}

function confirmation(now: Date, input: AnthropometryCreateRequest, scope: AuthorizedChildScope): RecordConfirmedInput["confirmation"] {
  return Object.freeze({
    confirmationSha256: hash(JSON.stringify({ scope: scope.childId, measurement: input.measurement, confirmedAt: now.toISOString() })),
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
  });
}

export function createSupabaseAnthropometryPersistence(input: Readonly<{
  config: RuntimeConfig;
  auth: AuthenticatedChannelRequest;
}>): GrowthPersistence {
  const client = createRequestSupabaseClient({ config: input.config, accessToken: input.auth.guardian.bearerToken });
  const repository = createAnthropometryRepository(client);
  const persistence: GrowthPersistence = {
    async create(scope, auth, request, idempotencyKey, now, signal) {
      try {
        const normalized = normalizeAnthropometricUnit(
          request.measurement.measurementType,
          typeof request.measurement.value === "string"
            ? request.measurement.value
            : { pounds: request.measurement.value.pounds, ounces: request.measurement.value.ounces },
          request.measurement.unit,
        );
        const command = Object.freeze({
          measurementType: request.measurement.measurementType,
          value: normalized.original.canonical,
          unit: normalized.originalUnit,
          occurredAt: request.measurement.occurredAt,
          localDate: localDate(request.measurement.occurredAt, scope.timezone),
          timeZone: scope.timezone,
          measurementMethod: request.measurement.measurementMethod ?? "unknown",
          provenanceType: request.measurement.provenanceType ?? "guardian",
        });
        const confirmed = confirmation(now, request, scope);
        const result = await client.rpc("record_confirmed_anthropometry_with_note" as never, {
          p_care_space_id: scope.careSpaceId,
          p_child_id: scope.childId,
          p_idempotency_key: idempotencyKey,
          p_input_fingerprint: fingerprint(scope, request),
          p_confirmation_sha256: confirmed.confirmationSha256,
          p_confirmation_expires_at: confirmed.expiresAt,
          p_measurement_type: command.measurementType,
          p_original_value_lexeme: normalized.original.canonical,
          p_original_unit: normalized.originalUnit,
          p_normalized_value_lexeme: normalized.normalized.canonical,
          p_normalized_unit: normalized.normalizedUnit,
          p_occurred_at: command.occurredAt,
          p_local_date: command.localDate,
          p_time_zone: command.timeZone,
          p_measurement_method: command.measurementMethod ?? "unknown",
          p_device: null,
          p_provenance_type: command.provenanceType ?? "guardian",
          p_conversion_version: normalized.conversionVersion,
          p_rounding_mode: normalized.roundingMode,
          p_hmac_key_id: null,
          p_capture_policy_id: "creciendo-anthropometry-v1",
          p_capture_policy_version: "1",
          p_assessments: [],
          p_supersedes_measurement_id: null,
          p_supersession_reason: null,
          p_source_note: request.measurement.sourceNote ?? null,
        } as never);
        if (result.error) {
          if (result.error.message.includes("idempotency_conflict")) return { code: "IDEMPOTENCY_CONFLICT" } satisfies PersistenceResult;
          if (result.error.message.includes("confirmation_invalid")) return { code: "CONFIRMATION_INVALID" } satisfies PersistenceResult;
          return { code: "PERSISTENCE_UNAVAILABLE" } satisfies PersistenceResult;
        }
        const row = Array.isArray(result.data) ? result.data[0] as { measurement_id?: unknown; outcome?: unknown } | undefined : undefined;
        if (!row || typeof row.measurement_id !== "string" || (row.outcome !== "created" && row.outcome !== "idempotent_replay")) return { code: "PERSISTENCE_UNAVAILABLE" } satisfies PersistenceResult;
        const stored = await repository.getConfirmed(scope, row.measurement_id, auth.requestId, signal);
        const measurement = toRouteMeasurement(stored);
        if (!measurement) return { code: "PERSISTENCE_UNAVAILABLE" } satisfies PersistenceResult;
        return Object.freeze({ outcome: row.outcome, measurement });
      } catch {
        return { code: "INVALID_INPUT" } satisfies PersistenceResult;
      }
    },
    async list(scope, auth, query, signal) {
      if (signal.aborted) return null;
      const result = await client.from("anthropometric_measurements")
        .select("id")
        .eq("care_space_id", scope.careSpaceId)
        .eq("child_id", scope.childId)
        .eq("validation_status", "confirmed")
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (result.error || !Array.isArray(result.data)) return null;
      const measurements: AnthropometryRouteMeasurement[] = [];
      for (const row of result.data as Array<{ id?: unknown }>) {
        if (typeof row.id !== "string") continue;
        const stored = await repository.getConfirmed(scope, row.id, auth.requestId, signal);
        const measurement = toRouteMeasurement(stored);
        if (measurement) measurements.push(measurement);
      }
      return measurements;
    },
    async summary(_scope, _auth, _signal) {
      return { status: "unavailable" as const, code: "RULE_UNAVAILABLE" as const, points: [] as [] };
    },
  };
  return persistence;
}
