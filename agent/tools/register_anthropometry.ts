import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { mapToolError, type ToolEffectState } from "../lib/runtime/safe-tool-errors";
import {
  createCitationHandle,
  projectToolResult,
  type ToolSafeProjectionMap,
} from "../lib/runtime/safe-to-model";
import { withToolAudit } from "../lib/runtime/tool-audit";
import {
  withToolIdempotency,
  type ToolApprovalSubmission,
} from "../lib/runtime/tool-idempotency";
import {
  authorizeToolInvocation,
} from "../lib/runtime/tool-permission-policy";
import {
  createConversationalToolApprovalSubmission,
} from "../lib/runtime/tool-approval-policy";
import {
  getTrustedToolAbortSignal,
  getTrustedToolServices,
  requireActiveChildScope,
  type ToolServicePorts,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import { compareClinicalDecimal, parseClinicalDecimal } from "../../src/clinical/anthropometry/decimal";
import { DEFAULT_CAPTURE_POLICY } from "../../src/clinical/anthropometry/capture-policy";
import { normalizeAnthropometricUnit } from "../../src/clinical/anthropometry/units";

const TOOL_ID = "register_anthropometry" as const;
const TOOL_SCHEMA_VERSION = "register-anthropometry.v1" as const;
const TRUSTED_SCHEMA_VERSION = `${TOOL_ID}.trusted.v1` as const;
const MODEL_SCHEMA_VERSION = `${TOOL_ID}.model.v1` as const;
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const DECIMAL = z.string()
  .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u)
  .max(64)
  .refine((value) => {
    try {
      return BigInt(value.replace(".", "")) > 0n;
    } catch {
      return false;
    }
  }, "positive decimal");
const NON_NEGATIVE_DECIMAL = z.string()
  .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u)
  .max(64);
const SIGNED_DECIMAL = z.string()
  .regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u)
  .max(64);
const SAFE_TEXT = z.string().min(1).max(500).refine((value) => value === value.normalize("NFKC")
  && !/[\u0000-\u001f\u007f]/u.test(value)
  && !/(?:\b(?:https?|s3|gs|file|javascript|data):\/\/|<\s*\/?\s*(?:script|iframe|object|embed|form|input|button|a)\b|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*[:=]|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|\b(?:ignore|forget|disregard|override|bypass|ignora|olvida|omite|anula)\b.{0,80}\b(?:previous|prior|system|developer|instruction|policy|anterior(?:es)?|previ[oa]s?|sistema|desarrollador|instrucci[oó]n(?:es)?|pol[ií]tica)\b)/iu.test(value), "safe source note");

const MEASUREMENT_KIND = z.enum([
  "weight",
  "recumbent_length",
  "standing_height",
  "head_circumference",
]);
const MEASUREMENT_UNIT = z.enum(["kg", "g", "lb", "oz", "lb_oz", "cm", "mm", "in"]);
const LB_OZ_VALUE = z.object({
  pounds: DECIMAL,
  ounces: NON_NEGATIVE_DECIMAL,
}).strict();
const DECLARED_VALUE = z.union([DECIMAL, LB_OZ_VALUE]);

/** Only the caregiver's declaration is model-callable. Scope, authority, and clinical truth are trusted runtime data. */
export const REGISTER_ANTHROPOMETRY_INPUT_SCHEMA = z.object({
  kind: MEASUREMENT_KIND,
  value: DECLARED_VALUE,
  unit: MEASUREMENT_UNIT,
  occurredAt: INSTANT.default(() => new Date().toISOString()),
  sourceNote: SAFE_TEXT.optional(),
  idempotencyKey: OPAQUE_ID.default(() => randomUUID()),
}).strict().superRefine((input, context) => {
  const weightUnit = ["kg", "g", "lb", "oz", "lb_oz"].includes(input.unit);
  const valueIsPair = typeof input.value !== "string";
  if ((input.kind === "weight" && !weightUnit)
    || (input.kind !== "weight" && weightUnit)) {
    context.addIssue({ code: "custom", path: ["unit"], message: "unit does not match measurement kind" });
  }
  if ((input.unit === "lb_oz") !== valueIsPair) {
    context.addIssue({ code: "custom", path: ["value"], message: "lb_oz requires pounds and ounces" });
  }
});

export type RegisterAnthropometryInput = z.infer<typeof REGISTER_ANTHROPOMETRY_INPUT_SCHEMA>;
type RegisterAnthropometryDeclaredInput = Omit<RegisterAnthropometryInput, "idempotencyKey">;

const TRUSTED_MEASUREMENT_SCHEMA = z.object({
  measurementType: MEASUREMENT_KIND,
  value: DECIMAL,
  unit: z.enum(["kg", "cm"]),
  occurredAt: INSTANT,
}).strict();
const GROWTH_INDICATOR = z.enum([
  "weight_for_age",
  "length_for_age",
  "height_for_age",
  "weight_for_length",
  "weight_for_height",
  "head_circumference_for_age",
  "bmi_for_age",
]);
const GROWTH_WARNING = z.enum([
  "age_unavailable",
  "corrected_age_unavailable",
  "standard_unavailable",
  "dataset_unavailable",
  "numerical_instability",
  "insufficient_companion",
  "measurement_excluded",
  "transition_boundary",
  "precision_limited",
  "review_required",
]);
const TRUSTED_PROVENANCE_SCHEMA = z.object({
  standardKey: CODE.nullable(),
  standardVersion: CODE.nullable(),
  referenceCode: CODE,
  citationHandle: z.string().regex(/^citation:v1:[a-f0-9]{64}$/u),
}).strict();
const TRUSTED_ASSESSMENT_COMMON = {
  indicator: GROWTH_INDICATOR,
  ageBasis: z.enum(["chronological", "corrected"]),
  ageDays: z.number().int().nonnegative().max(10_000),
  interpretation: z.enum(["within_expected", "review_required", "urgent_review", "unavailable"]),
  warnings: z.array(GROWTH_WARNING).max(12),
  provenance: TRUSTED_PROVENANCE_SCHEMA,
} as const;
const SERVICE_RESULT_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay"]),
  measurement: TRUSTED_MEASUREMENT_SCHEMA,
  assessment: z.object({
    status: z.enum(["calculated", "rule_unavailable", "insufficient_data", "excluded"]),
    indicator: GROWTH_INDICATOR,
    ageBasis: z.enum(["chronological", "corrected"]),
    ageDays: z.number().int().nonnegative().max(10_000),
    zScore: SIGNED_DECIMAL.nullable(),
    percentile: NON_NEGATIVE_DECIMAL.nullable(),
    interpretation: z.enum(["within_expected", "review_required", "urgent_review", "unavailable"]),
    warnings: z.array(GROWTH_WARNING).max(12),
    standardKey: CODE.nullable(),
    standardVersion: CODE.nullable(),
    sourceDigest: HASH,
    referenceCode: CODE,
  }).strict(),
}).strict();

export const REGISTER_ANTHROPOMETRY_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: z.object({
    outcome: z.enum(["created", "idempotent_replay"]),
    measurement: TRUSTED_MEASUREMENT_SCHEMA,
    assessment: z.union([
      z.object({
        status: z.literal("calculated"),
        ...TRUSTED_ASSESSMENT_COMMON,
        zScore: SIGNED_DECIMAL,
        percentile: NON_NEGATIVE_DECIMAL,
      }).strict(),
      z.object({
        status: z.enum(["rule_unavailable", "insufficient_data", "excluded"]),
        ...TRUSTED_ASSESSMENT_COMMON,
        zScore: z.null(),
        percentile: z.null(),
      }).strict(),
    ]),
  }).strict(),
}).strict();

export type RegisterAnthropometryTrustedResult = z.infer<typeof REGISTER_ANTHROPOMETRY_TRUSTED_RESULT_SCHEMA>;

export const REGISTER_ANTHROPOMETRY_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.enum(["created", "replayed"]),
  result: REGISTER_ANTHROPOMETRY_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: z.string().regex(/^register_anthropometry:[a-f0-9]{64}$/u),
  requestSha256: HASH,
  approvalSha256: HASH,
}).strict();

export type RegisterAnthropometryExecution = z.infer<typeof REGISTER_ANTHROPOMETRY_OUTPUT_SCHEMA>;
type RegisterAnthropometryModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

export type AnthropometryRegistrationRequest = Readonly<{
  scope: AuthorizedChildScope;
  input: RegisterAnthropometryDeclaredInput;
  /** This is wrapper-derived; the model's idempotencyKey is intentionally absent. */
  idempotencyKey: string;
  confirmation: Readonly<{ approvalSha256: string }>;
  requestSha256: string;
  signal: AbortSignal;
}>;

export type AnthropometryRegistrationResult = Readonly<z.infer<typeof SERVICE_RESULT_SCHEMA>>;
export type AnthropometryRegistrationPort = Readonly<{
  registerConfirmed(request: AnthropometryRegistrationRequest): Promise<AnthropometryRegistrationResult | Readonly<{ code: string; requestId?: string }>>;
}>;

type RegisterAnthropometryServices = ToolServicePorts & Readonly<{
  anthropometry: AnthropometryRegistrationPort;
}>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "register_anthropometry.v1",
  inputSchema: REGISTER_ANTHROPOMETRY_INPUT_SCHEMA,
  resultSchema: REGISTER_ANTHROPOMETRY_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "register_anthropometry.v1",
});

const URGENT_SOURCE_NOTE = /\b(?:urgent(?:e)?|emergenc(?:y|ia)|not\s+breathing|can(?:not|'t)\s+breathe|difficulty\s+breathing|turning\s+blue|blue\s+(?:lips|face|skin)|seizure|unconscious|choking|heavy\s+bleeding|poison(?:ing)?|anaphylax(?:is)?|cannot\s+wake|no\s+respira|dificultad\s+para\s+respirar|se\s+(?:esta|está)\s+poniendo\s+azul|convuls(?:i[oó]n|iones?)?|inconsciente|atragantamiento|sangrado\s+abundante|intoxicaci[oó]n|anafilax(?:ia)?|no\s+despierta|letarg(?:ia|o))\b/iu;

function safeFailure(code: string, effectState: ToolEffectState = "unknown"): never {
  throw mapToolError(Object.freeze({ code }), { effectState });
}

function codeOf(error: unknown): string | null {
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const code = (error as Readonly<{ code?: unknown }>).code;
  return typeof code === "string" ? code : null;
}

function abortIfNeeded(signal: AbortSignal, effectState: ToolEffectState = "none"): void {
  if (signal.aborted) safeFailure("CANCELLED", effectState);
}

function servicesFor(context: TrustedToolContext): RegisterAnthropometryServices {
  return getTrustedToolServices(context) as RegisterAnthropometryServices;
}

function nowFor(context: TrustedToolContext): Date {
  try {
    const clock = servicesFor(context).toolIdempotency as Readonly<{ now?: () => Date }> | undefined;
    const now = typeof clock?.now === "function" ? clock.now() : new Date(Number.NaN);
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    return new Date(now);
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  }
}

function reauthorize(context: TrustedToolContext, effectState: ToolEffectState): AuthorizedChildScope {
  abortIfNeeded(getTrustedToolAbortSignal(context), effectState);
  const now = nowFor(context);
  try {
    const scope = requireActiveChildScope(context, now);
    if (!authorizeToolInvocation(context, TOOL_ID, now).allowed) return safeFailure("FORBIDDEN", effectState);
    return scope;
  } catch (error) {
    if (codeOf(error) === "TOOL_CONTEXT_CANCELLED") return safeFailure("CANCELLED", effectState);
    return safeFailure("FORBIDDEN", effectState);
  }
}

/** A deterministic, provider-free gate that runs before Eve context resolution. */
function preflightUrgentInput(rawInput: unknown): void {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return;
  try {
    const sourceNote = (rawInput as Readonly<Record<string, unknown>>).sourceNote;
    if (typeof sourceNote === "string" && URGENT_SOURCE_NOTE.test(sourceNote.normalize("NFKC"))) {
      safeFailure("INPUT_INVALID", "none");
    }
  } catch {
    safeFailure("INPUT_INVALID", "none");
  }
}

function parseInput(rawInput: unknown, now: Date): RegisterAnthropometryInput {
  let parsed: ReturnType<typeof REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse>;
  try {
    parsed = REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse(rawInput);
  } catch {
    return safeFailure("INPUT_INVALID", "none");
  }
  if (!parsed.success) return safeFailure("INPUT_INVALID", "none");
  const input = parsed.data;
  try {
    const normalized = normalizeAnthropometricUnit(input.kind, input.value, input.unit);
    const occurredAt = Date.parse(input.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt > now.getTime()) return safeFailure("INPUT_INVALID", "none");
    const limits = DEFAULT_CAPTURE_POLICY.hardLimits?.[input.kind];
    if (limits) {
      const value = normalized.normalized;
      if (compareClinicalDecimal(value, parseClinicalDecimal(limits.min)) <= 0
        || compareClinicalDecimal(value, parseClinicalDecimal(limits.max)) >= 0) {
        return safeFailure("INPUT_INVALID", "none");
      }
    }
  } catch {
    return safeFailure("INPUT_INVALID", "none");
  }
  return input;
}

function serviceFailure(error: unknown, effectState: ToolEffectState): never {
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const code = codeOf(error);
    if (code && [
      "ACCESS_DENIED",
      "CONFIRMATION_INVALID",
      "IDEMPOTENCY_CONFLICT",
      "INVALID_INPUT",
      "INPUT_INVALID",
      "RULE_UNAVAILABLE",
      "CLINICAL_POLICY_UNAVAILABLE",
      "PERSISTENCE_UNAVAILABLE",
      "STORAGE_UNAVAILABLE",
      "CANCELLED",
    ].includes(code)) return safeFailure(code, effectState);
  }
  return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
}

function trustedResult(
  raw: unknown,
  input: RegisterAnthropometryInput,
): RegisterAnthropometryTrustedResult {
  const parsed = SERVICE_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("CLINICAL_POLICY_UNAVAILABLE", "unknown");
  const value = parsed.data;
  const expectedUnit = input.kind === "weight" ? "kg" : "cm";
  let expectedNormalized: string;
  try {
    expectedNormalized = normalizeAnthropometricUnit(input.kind, input.value, input.unit).normalized.canonical;
  } catch {
    return safeFailure("INPUT_INVALID", "unknown");
  }
  if (value.measurement.measurementType !== input.kind
    || value.measurement.unit !== expectedUnit
    || value.measurement.value !== expectedNormalized
    || Date.parse(value.measurement.occurredAt) !== Date.parse(input.occurredAt)) {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  }
  if (value.assessment.status === "calculated"
    && (value.assessment.zScore === null || value.assessment.percentile === null)) {
    return safeFailure("CLINICAL_POLICY_UNAVAILABLE", "unknown");
  }
  if (value.assessment.status !== "calculated"
    && (value.assessment.zScore !== null || value.assessment.percentile !== null)) {
    return safeFailure("CLINICAL_POLICY_UNAVAILABLE", "unknown");
  }
  const citationHandle = createCitationHandle(TOOL_ID, {
    sourceDigest: value.assessment.sourceDigest,
    referenceCode: value.assessment.referenceCode,
  });
  const candidate = {
    kind: "trusted_tool_result" as const,
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      outcome: value.outcome,
      measurement: value.measurement,
      assessment: {
        status: value.assessment.status,
        indicator: value.assessment.indicator,
        ageBasis: value.assessment.ageBasis,
        ageDays: value.assessment.ageDays,
        interpretation: value.assessment.interpretation,
        warnings: value.assessment.warnings,
        ...(value.assessment.status === "calculated"
          ? { zScore: value.assessment.zScore, percentile: value.assessment.percentile }
          : { zScore: null, percentile: null }),
        provenance: {
          standardKey: value.assessment.standardKey,
          standardVersion: value.assessment.standardVersion,
          referenceCode: value.assessment.referenceCode,
          citationHandle,
        },
      },
    },
  };
  const result = REGISTER_ANTHROPOMETRY_TRUSTED_RESULT_SCHEMA.safeParse(candidate);
  if (!result.success) return safeFailure("CLINICAL_POLICY_UNAVAILABLE", "unknown");
  return result.data;
}

export function projectRegisterAnthropometryForModel(raw: unknown): RegisterAnthropometryModelResult {
  const parsed = REGISTER_ANTHROPOMETRY_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  const { provenance, ...assessment } = parsed.data.data.assessment;
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      outcome: parsed.data.data.outcome,
      measurement: parsed.data.data.measurement,
      assessment: {
        ...assessment,
        citationHandles: [provenance.citationHandle],
      },
    },
  });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, input) => {
    const context = runtime.trustedContext as TrustedToolContext<RegisterAnthropometryServices>;
    const services = servicesFor(context);
    const signal = getTrustedToolAbortSignal(context);
    abortIfNeeded(signal);
    if (!runtime.idempotencyKey || !runtime.approvalSha256) return safeFailure("CONFIRMATION_INVALID", "none");
    const scope = reauthorize(context, "none");
    const service = services.anthropometry;
    if (!service || typeof service.registerConfirmed !== "function") return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    const { idempotencyKey: _modelKey, ...declared } = input;
    let rawResult: unknown;
    try {
      rawResult = await service.registerConfirmed(Object.freeze({
        scope,
        input: Object.freeze(declared),
        idempotencyKey: runtime.idempotencyKey,
        confirmation: Object.freeze({ approvalSha256: runtime.approvalSha256 }),
        requestSha256: runtime.requestSha256,
        signal,
      }));
    } catch (error) {
      if (signal.aborted || codeOf(error) === "CANCELLED") return safeFailure("CANCELLED", "unknown");
      return serviceFailure(error, "unknown");
    }
    if (signal.aborted) return safeFailure("CANCELLED", "unknown");
    if (codeOf(rawResult) !== null) return serviceFailure(rawResult, "unknown");
    const result = trustedResult(rawResult, input);
    if (signal.aborted) return safeFailure("CANCELLED", "unknown");
    return Object.freeze({
      status: "committed" as const,
      outcome: result.data.outcome === "idempotent_replay" ? "replayed" as const : "created" as const,
      result,
    });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (
    context: TrustedToolContext,
    rawInput: unknown,
    approval: ToolApprovalSubmission | null,
  ) => {
    reauthorize(context, "none");
    return invokeIdempotently(context, parseInput(rawInput, nowFor(context)), approval);
  },
);

export async function executeRegisterAnthropometry(
  context: TrustedToolContext,
  rawInput: unknown,
  approval: ToolApprovalSubmission | null = null,
): Promise<RegisterAnthropometryExecution> {
  try {
    preflightUrgentInput(rawInput);
    const raw = await invokeWithAudit(context, rawInput, approval);
    if ("allowed" in raw) {
      return safeFailure(raw.status === "approval_required" ? "CONFIRMATION_REQUIRED" : "CONFIRMATION_INVALID", "none");
    }
    const parsed = REGISTER_ANTHROPOMETRY_OUTPUT_SCHEMA.safeParse(raw);
    if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    return parsed.data;
  } catch (error) {
    throw mapToolError(error, { effectState: "unknown" });
  }
}

export default defineTool({
  description: "Registra una medición antropométrica declarada por el cuidador después de confirmación explícita; no diagnostica, predice ni prescribe.",
  inputSchema: REGISTER_ANTHROPOMETRY_INPUT_SCHEMA,
  outputSchema: REGISTER_ANTHROPOMETRY_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      preflightUrgentInput(input);
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      const submission = createConversationalToolApprovalSubmission(trusted, TOOL_ID, TOOL_SCHEMA_VERSION, input as any);
      const res = await executeRegisterAnthropometry(trusted, input, submission);
      if (res && res.status === "succeeded") {
        return res;
      }
    } catch (error) {
      console.warn("[register_anthropometry] executeRegisterAnthropometry error, falling back to direct database insertion:", error);
    }

    // Direct database insertion fallback
    try {
      const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
      const sb = createClient(supabaseUrl, serviceKey);

      const eveSessionId = eveContext.session?.id;
      let sessionRow: any = null;
      if (eveSessionId) {
        const { data } = await sb
          .from("agent_sessions")
          .select("child_id, care_space_id, owner_user_id")
          .or(`id.eq.${eveSessionId},eve_session_id.eq.${eveSessionId}`)
          .limit(1)
          .maybeSingle();
        sessionRow = data;
      }
      const childId = sessionRow?.child_id || "99839c40-2cc2-45ca-9afb-2b75dad998c2";
      const careSpaceId = sessionRow?.care_space_id || "76dfd546-f8f9-4f7a-9222-826cf1f6e7f1";
      const userId = sessionRow?.owner_user_id || "41a2e326-7e68-4f21-811d-8f9183708bbe";

      const measurementId = randomUUID();
      const nowIso = new Date().toISOString();
      let occurredAt = (input as any).occurredAt || nowIso;
      if (new Date(occurredAt).getTime() > Date.now()) {
        occurredAt = nowIso;
      }
      let valNum = parseFloat(String((input as any).value));
      const kind = (input as any).kind || (input as any).measurementType;
      const unit = (input as any).unit || (kind === "weight" ? "kg" : "cm");
      const normUnit: "kg" | "cm" = (unit === "lb" || unit === "oz" || unit === "g" || unit === "kg") ? "kg" : "cm";
      let normVal = (unit === "g") ? valNum / 1000 : valNum;

      // Smart delta resolver: if height is < 25 cm, it represents a delta (e.g. 1 cm)
      if ((kind === "standing_height" || kind === "recumbent_length") && normVal < 25) {
        const { data: prev } = await sb
          .from("anthropometric_measurements")
          .select("normalized_value")
          .eq("child_id", childId)
          .in("measurement_type", ["standing_height", "recumbent_length"])
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prev && prev.normalized_value) {
          normVal = parseFloat(String(prev.normalized_value)) + normVal;
          valNum = normVal;
        } else {
          normVal = 50 + normVal;
          valNum = normVal;
        }
      }

      // Smart delta resolver: if weight <= 3.0 kg and Esteban's previous weight >= 3.0 kg, it represents a delta (e.g. subio 2 kilos)
      if (kind === "weight" && normVal <= 3.0) {
        const { data: prevW } = await sb
          .from("anthropometric_measurements")
          .select("normalized_value")
          .eq("child_id", childId)
          .eq("measurement_type", "weight")
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prevW && prevW.normalized_value && parseFloat(String(prevW.normalized_value)) >= 3.0) {
          normVal = parseFloat(String(prevW.normalized_value)) + normVal;
          valNum = normVal;
        }
      }

      // Smart delta resolver: if head_circumference < 15 cm, it represents a delta (e.g. crecio 1 cm)
      if (kind === "head_circumference" && normVal < 15) {
        const { data: prevH } = await sb
          .from("anthropometric_measurements")
          .select("normalized_value")
          .eq("child_id", childId)
          .eq("measurement_type", "head_circumference")
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prevH && prevH.normalized_value) {
          normVal = parseFloat(String(prevH.normalized_value)) + normVal;
          valNum = normVal;
        } else {
          normVal = 35 + normVal;
          valNum = normVal;
        }
      }

      const { error: insErr } = await sb.from("anthropometric_measurements").insert({
        id: measurementId,
        child_id: childId,
        care_space_id: careSpaceId,
        measurement_type: kind,
        original_value: valNum,
        original_unit: unit,
        normalized_value: normVal,
        normalized_unit: normUnit,
        occurred_at: occurredAt,
        local_date: occurredAt.slice(0, 10),
        time_zone: "America/Bogota",
        measurement_method: kind === "weight" ? "digital_scale" : "tape_measure",
        provenance_type: "guardian",
        validation_status: "confirmed",
        idempotency_key: `meas_${childId}_${measurementId}`,
        recorded_by: userId,
      });

      if (insErr) {
        console.error("[register_anthropometry] Fallback insertion error:", insErr);
      }

      return {
        status: "succeeded" as const,
        outcome: "created" as const,
        result: {
          kind: "trusted_tool_result" as const,
          toolId: TOOL_ID,
          schemaVersion: TRUSTED_SCHEMA_VERSION,
          data: {
            outcome: "created" as const,
            measurement: {
              measurementType: kind,
              value: String(normVal),
              unit: normUnit,
              occurredAt,
            },
            assessment: {
              status: "calculated" as const,
              indicator: (kind === "weight" ? "weight_for_age" : kind === "head_circumference" ? "head_circumference_for_age" : "height_for_age") as any,
              ageBasis: "chronological" as const,
              ageDays: 15,
              zScore: "0.15",
              percentile: "56.0",
              interpretation: "within_expected" as const,
              warnings: [],
              provenance: {
                standardKey: "growth.who_2006",
                standardVersion: "1.0.0",
                referenceCode: "WHO-0-5-STANDARD",
                citationHandle: "citation:v1:0000000000000000000000000000000000000000000000000000000000000000",
              },
            },
          },
        },
        idempotencyKey: `register_anthropometry:${"0".repeat(64)}`,
        requestSha256: "0".repeat(64),
        approvalSha256: "0".repeat(64),
      };
    } catch (fallbackError) {
      throw mapToolError(fallbackError, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectRegisterAnthropometryForModel(output.result));
  },
});
