import { createHash } from "node:crypto";

import type { RuntimeConfig } from "../../../agent/lib/config/env.ts";
import { createRequestSupabaseClient } from "../../../agent/lib/supabase/request-client.ts";
import type { AuthenticatedChannelRequest } from "./auth-middleware.ts";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { hasPermission } from "../../../agent/lib/access/authorized-child-scope.ts";
import { createAnthropometryRepository } from "../../persistence/supabase/anthropometry-repository.ts";
import { normalizeAnthropometricUnit } from "../../clinical/anthropometry/units.ts";
import { createExactClinicalDecimal } from "../../clinical/anthropometry/value-objects.ts";
import type { RecordConfirmedInput } from "../../clinical/anthropometry/repository.ts";
import type { ConfirmedMeasurement } from "../../clinical/anthropometry/types.ts";
import type { RepositoryAccessResult } from "../../clinical/anthropometry/repository.ts";
import type { AnthropometryRouteMeasurement, AnthropometryCreateRequest, GrowthPersistence } from "./routes/anthropometry.ts";
import { ANTHROPOMETRY_MEASUREMENT_RESPONSE_SCHEMA } from "./routes/anthropometry.ts";
import {
  buildGovernedGrowthSummary,
  type GovernedGrowthChild,
  type GovernedGrowthMeasurement,
} from "./governed-growth-summary.ts";

import { createGrowthPackageProvider } from "./growth-package-provider.ts";

type PersistenceResult = Readonly<{ code: string; diagnosticCode?: string }>;

// Cast in Postgres so historical numeric values never pass through a JS number.
// The star also tolerates the optional source_note column being absent remotely.
const MEASUREMENT_COLUMNS = "*,legacy_normalized_value:normalized_value::text";

function historicalMeasurement(scope: AuthorizedChildScope, value: unknown): AnthropometryRouteMeasurement | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.care_space_id !== scope.careSpaceId || row.child_id !== scope.childId || row.validation_status !== "confirmed") return null;
  const result = ANTHROPOMETRY_MEASUREMENT_RESPONSE_SCHEMA.safeParse({
    id: row.id,
    measurementType: row.measurement_type,
    value: row.normalized_value_lexeme ?? row.legacy_normalized_value,
    unit: row.normalized_unit,
    occurredAt: row.occurred_at,
    localDate: row.local_date,
    timeZone: row.time_zone,
    measurementMethod: row.measurement_method ?? "unknown",
    provenanceType: row.provenance_type,
    sourceNote: row.source_note ?? null,
  });
  return result.success ? Object.freeze(result.data) : null;
}

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

async function governedSummary(
  client: ReturnType<typeof createRequestSupabaseClient>,
  scope: AuthorizedChildScope,
  signal: AbortSignal,
): Promise<Readonly<Omit<import("./routes/anthropometry.ts").GrowthSummaryResponse, "version" | "requestId">> | null> {
  if (signal.aborted || !hasPermission(scope, "read")) return null;
  const resolvedPackage = await createGrowthPackageProvider(client).resolve({ scope, referenceDate: localDate(new Date().toISOString(), scope.timezone), signal });
  if (signal.aborted || !resolvedPackage) return null;
  const [childResult, measurementsResult] = await Promise.all([
    client.from("children").select("date_of_birth, sex_for_growth, country_of_care, time_zone, gestational_age_weeks, gestational_age_days")
      .eq("id", scope.childId).eq("care_space_id", scope.careSpaceId).eq("status", "active").maybeSingle(),
    client.from("anthropometric_measurements")
      .select(MEASUREMENT_COLUMNS)
      .eq("child_id", scope.childId).eq("care_space_id", scope.careSpaceId).eq("validation_status", "confirmed")
      .order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(48),
  ]);
  if (signal.aborted || !hasPermission(scope, "read") || childResult.error || measurementsResult.error || !childResult.data || !Array.isArray(measurementsResult.data)) return null;
  const child = childResult.data as unknown as Record<string, unknown>;
  if (typeof child.date_of_birth !== "string"
    || (child.sex_for_growth !== "female" && child.sex_for_growth !== "male")
    || (child.country_of_care !== "CO" && child.country_of_care !== "US")
    || typeof child.time_zone !== "string") return null;
  const measurements: GovernedGrowthMeasurement[] = [];
  for (const row of measurementsResult.data) {
    const measurement = historicalMeasurement(scope, row);
    if (!measurement) return null;
    measurements.push({
      id: measurement.id,
      measurementType: measurement.measurementType,
      value: measurement.value,
      unit: measurement.unit,
      occurredAt: measurement.occurredAt,
      measurementMethod: measurement.measurementMethod,
    });
  }
  if (child.country_of_care !== scope.countryOfCare) return null;
  const input: GovernedGrowthChild = {
    gestationalAgeWeeks: typeof child.gestational_age_weeks === "number" ? child.gestational_age_weeks : null,
    gestationalAgeDays: typeof child.gestational_age_days === "number" ? child.gestational_age_days : null,
    dateOfBirth: child.date_of_birth.slice(0, 10),
    sexForGrowth: child.sex_for_growth,
    countryOfCare: child.country_of_care,
    timeZone: child.time_zone,
  };
  try {
    return buildGovernedGrowthSummary({ package: resolvedPackage, child: input, measurements, now: new Date() });
  } catch {
    return null;
  }
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
        const hasSourceNote = request.measurement.sourceNote !== undefined;
        const result = await client.rpc((hasSourceNote ? "record_confirmed_anthropometry_with_note" : "record_confirmed_anthropometry") as never, {
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
          ...(hasSourceNote ? { p_source_note: request.measurement.sourceNote } : {}),
        } as never);
        if (result.error) {
          if (result.error.message.includes("idempotency_conflict")) return { code: "IDEMPOTENCY_CONFLICT" } satisfies PersistenceResult;
          if (result.error.message.includes("confirmation_invalid")) return { code: "CONFIRMATION_INVALID" } satisfies PersistenceResult;
          const diagnosticCode = /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/u.test(result.error.code)
            ? result.error.code : undefined;
          return { code: "PERSISTENCE_UNAVAILABLE", ...(diagnosticCode ? { diagnosticCode } : {}) } satisfies PersistenceResult;
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
      if (signal.aborted || !hasPermission(scope, "read")) return null;
      const result = await client.from("anthropometric_measurements")
        .select(MEASUREMENT_COLUMNS)
        .eq("care_space_id", scope.careSpaceId)
        .eq("child_id", scope.childId)
        .eq("validation_status", "confirmed")
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (signal.aborted || !hasPermission(scope, "read") || result.error || !Array.isArray(result.data)) return null;
      const measurements: AnthropometryRouteMeasurement[] = [];
      for (const row of result.data) {
        const measurement = historicalMeasurement(scope, row);
        if (!measurement) return null;
        measurements.push(measurement);
      }
      return measurements;
    },
    async summary(scope, _auth, signal) {
      const summary = await governedSummary(client, scope, signal);
      if (summary && !signal.aborted) return summary;
      return { status: "unavailable" as const, code: "RULE_UNAVAILABLE" as const, points: [] as [] };
    },
  };
  return persistence;
}
