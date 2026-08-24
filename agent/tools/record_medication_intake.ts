import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { mapToolError, type ToolEffectState } from "../lib/runtime/safe-tool-errors";
import {
  projectToolResult,
  type ToolSafeProjectionMap,
} from "../lib/runtime/safe-to-model";
import { withToolAudit } from "../lib/runtime/tool-audit";
import {
  withToolIdempotency,
  type ToolApprovalSubmission,
} from "../lib/runtime/tool-idempotency";
import {
  getTrustedToolAbortSignal,
  getTrustedToolServices,
  requireActiveChildScope,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import { authorizeToolInvocation } from "../lib/runtime/tool-permission-policy";
import type {
  MedicationIntakeCommand,
  MedicationOperationInput,
} from "../../src/application/medication/ports";
import type { MedicationIntakeRecord } from "../../src/clinical/medication/types";

const TOOL_ID = "record_medication_intake" as const;
const TOOL_SCHEMA_VERSION = "record-medication-intake.v1" as const;
const TRUSTED_SCHEMA_VERSION = `${TOOL_ID}.trusted.v1` as const;
const MODEL_SCHEMA_VERSION = `${TOOL_ID}.model.v1` as const;

const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const INSTANT = z.string().datetime({ offset: true });
const POSITIVE_DECIMAL = z.string()
  .regex(/^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/u)
  .max(64);
const MEDICATION_UNIT = z.enum([
  "mg", "mcg", "g", "mL", "L", "tablet", "capsule", "drop", "puff", "application",
]);
const STATE = z.enum(["taken", "skipped", "unknown"]);

/** Model input contains only caregiver-declared facts and opaque domain references. */
// M07's verified typed port does not carry or persist free-text notes. Keep
// narrative/urgent text at the pre-LLM red-flag boundary instead of accepting
// a fact that this tool would silently drop.
export const RECORD_MEDICATION_INTAKE_INPUT_SCHEMA = z.object({
  planReference: OPAQUE_ID,
  occurrenceReference: OPAQUE_ID.optional(),
  scheduledFor: INSTANT.optional(),
  state: STATE,
  takenAt: INSTANT.optional(),
  quantity: POSITIVE_DECIMAL.optional(),
  unit: MEDICATION_UNIT.optional(),
  idempotencyKey: OPAQUE_ID,
}).strict().superRefine((value, context) => {
  if (value.state === "taken" && value.takenAt === undefined) {
    context.addIssue({ code: "custom", path: ["takenAt"], message: "taken_at_required" });
  }
  if (value.state !== "taken" && value.takenAt !== undefined) {
    context.addIssue({ code: "custom", path: ["takenAt"], message: "taken_at_forbidden" });
  }
  if ((value.quantity === undefined) !== (value.unit === undefined)) {
    context.addIssue({ code: "custom", path: ["quantity"], message: "quantity_unit_pair_required" });
  }
});

export type RecordMedicationIntakeInput = z.infer<typeof RECORD_MEDICATION_INTAKE_INPUT_SCHEMA>;

const SERVICE_RESULT_SCHEMA = z.object({
  id: OPAQUE_ID,
  planId: OPAQUE_ID,
  occurrenceId: OPAQUE_ID.nullable(),
  scheduledFor: INSTANT.nullable(),
  takenAt: INSTANT.nullable(),
  state: STATE,
  quantity: POSITIVE_DECIMAL.nullable(),
  unit: MEDICATION_UNIT.nullable(),
  recordedBy: z.string().uuid(),
  supersedesId: OPAQUE_ID.nullable(),
}).strict();

const TRUSTED_DATA_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay"]),
  state: STATE,
  scheduledFor: INSTANT.nullable(),
  takenAt: INSTANT.nullable(),
}).strict();

export const RECORD_MEDICATION_INTAKE_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: TRUSTED_DATA_SCHEMA,
}).strict();

export type RecordMedicationIntakeTrustedResult = Readonly<
  z.infer<typeof RECORD_MEDICATION_INTAKE_TRUSTED_RESULT_SCHEMA>
>;

export const RECORD_MEDICATION_INTAKE_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.enum(["created", "replayed"]),
  result: RECORD_MEDICATION_INTAKE_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: OPAQUE_ID,
  requestSha256: HASH,
  approvalSha256: HASH,
}).strict();

export type RecordMedicationIntakeExecution = Readonly<
  z.infer<typeof RECORD_MEDICATION_INTAKE_OUTPUT_SCHEMA>
>;

type RecordMedicationIntakeModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

export type MedicationIntakeRecordReceipt = Readonly<{
  outcome: "created" | "replayed" | "idempotent_replay";
  value: MedicationIntakeRecord;
}>;

type RuntimeMedicationOperation = MedicationOperationInput & Readonly<{
  approvalSha256: string;
  requestSha256: string;
}>;

/** Typed request-scoped port. The outcome method is additive and optional for old adapters. */
export type MedicationIntakeRecordPort = Readonly<{
  record(
    scope: AuthorizedChildScope,
    command: MedicationIntakeCommand,
    operation: MedicationOperationInput,
  ): Promise<MedicationIntakeRecord>;
  recordWithOutcome(
    scope: AuthorizedChildScope,
    command: MedicationIntakeCommand,
    operation: MedicationOperationInput,
  ): Promise<MedicationIntakeRecordReceipt>;
}>;

type RecordMedicationIntakeServices = Readonly<Record<string, object> & {
  medicationIntakes: MedicationIntakeRecordPort;
}>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "record_medication_intake.v1",
  inputSchema: RECORD_MEDICATION_INTAKE_INPUT_SCHEMA,
  resultSchema: RECORD_MEDICATION_INTAKE_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "record_medication_intake.v1",
});

function safeFailure(code: string, effectState: ToolEffectState = "unknown"): never {
  throw mapToolError(Object.freeze({ code }), { effectState });
}

function codeOf(error: unknown): string | null {
  try {
    if (!error || typeof error !== "object" || Array.isArray(error)) return null;
    const coded = error as Readonly<{ code?: unknown }>;
    if (typeof coded.code === "string" && /^[A-Z][A-Z0-9_]{1,95}$/u.test(coded.code)) return coded.code;
    if (error instanceof Error) {
      const first = error.message.match(/^[A-Z][A-Z0-9_]{1,95}/u)?.[0];
      return first ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function abortIfNeeded(signal: AbortSignal, effectState: ToolEffectState = "none"): void {
  if (signal.aborted) safeFailure("CANCELLED", effectState);
}

function servicesFor(context: TrustedToolContext): RecordMedicationIntakeServices {
  try {
    const services = getTrustedToolServices(context) as Partial<RecordMedicationIntakeServices>;
    const port = services.medicationIntakes;
    if (!port || typeof port !== "object"
      || typeof port.record !== "function"
      || typeof port.recordWithOutcome !== "function") {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    }
    return services as RecordMedicationIntakeServices;
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  }
}

function nowFor(context: TrustedToolContext): Date {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, object>>;
    const clock = services.toolIdempotency as Readonly<{ now?: unknown }> | undefined;
    const now = typeof clock?.now === "function" ? clock.now() : new Date(Number.NaN);
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    return new Date(now);
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  }
}

function reauthorize(context: TrustedToolContext, effectState: ToolEffectState): AuthorizedChildScope {
  const signal = getTrustedToolAbortSignal(context);
  abortIfNeeded(signal, effectState);
  const now = nowFor(context);
  try {
    const scope = requireActiveChildScope(context, now);
    if (!authorizeToolInvocation(context, TOOL_ID, now).allowed) return safeFailure("FORBIDDEN", effectState);
    return scope;
  } catch {
    return safeFailure("FORBIDDEN", effectState);
  }
}

function parseInput(rawInput: unknown, now: Date): RecordMedicationIntakeInput {
  let parsed: ReturnType<typeof RECORD_MEDICATION_INTAKE_INPUT_SCHEMA.safeParse>;
  try {
    parsed = RECORD_MEDICATION_INTAKE_INPUT_SCHEMA.safeParse(rawInput);
  } catch {
    return safeFailure("INPUT_INVALID", "none");
  }
  if (!parsed.success) return safeFailure("INPUT_INVALID", "none");
  const input = parsed.data;
  const scheduledAt = input.scheduledFor === undefined ? null : Date.parse(input.scheduledFor);
  const takenAt = input.takenAt === undefined ? null : Date.parse(input.takenAt);
  if ((scheduledAt !== null && !Number.isFinite(scheduledAt))
    || (takenAt !== null && !Number.isFinite(takenAt))
    || (scheduledAt !== null && scheduledAt > now.getTime())
    || (takenAt !== null && takenAt > now.getTime())) {
    return safeFailure("INPUT_INVALID", "none");
  }
  return input;
}

function sameInstant(left: string | null, right: string | undefined): boolean {
  if (left === null || right === undefined) return left === null && right === undefined;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && leftMs === rightMs;
}

function scheduledMatches(value: string | null, input: RecordMedicationIntakeInput): boolean {
  if (input.scheduledFor !== undefined) return sameInstant(value, input.scheduledFor);
  return input.occurrenceReference !== undefined ? value !== null : value === null;
}

function mapDomainFailure(error: unknown, effectState: ToolEffectState): never {
  const code = codeOf(error);
  if (code === "CANCELLED" || code === "ABORTED") return safeFailure("CANCELLED", effectState);
  if (code === "MEDICATION_IDEMPOTENCY_CONFLICT" || code === "IDEMPOTENCY_CONFLICT") {
    return safeFailure("IDEMPOTENCY_CONFLICT", effectState);
  }
  if (code === "MEDICATION_SCOPE_DENIED" || code === "ACCESS_DENIED" || code === "NOT_AUTHORIZED") {
    return safeFailure("FORBIDDEN", effectState);
  }
  if (code === "MEDICATION_FUTURE_INTAKE_DENIED"
    || code === "MEDICATION_INTAKE_TIME_INVALID"
    || code === "MEDICATION_TAKEN_AT_REQUIRED"
    || code === "MEDICATION_TAKEN_AT_FORBIDDEN"
    || code === "INVALID_INPUT"
    || code === "INPUT_INVALID") {
    return safeFailure("INPUT_INVALID", effectState);
  }
  if (code === "MEDICATION_PLAN_NOT_FOUND"
    || code === "MEDICATION_PLAN_ENDED"
    || code === "MEDICATION_PLAN_NOT_ACTIVE"
    || code === "MEDICATION_OCCURRENCE_SUPERSEDED"
    || code === "MEDICATION_OCCURRENCE_NOT_FOUND"
    || code === "MEDICATION_INTAKE_NOT_FOUND"
    || code === "NOT_FOUND") {
    return safeFailure("NOT_FOUND", effectState);
  }
  return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
}

function commandForInput(input: RecordMedicationIntakeInput): MedicationIntakeCommand {
  return Object.freeze({
    planId: input.planReference,
    ...(input.occurrenceReference ? { occurrenceId: input.occurrenceReference } : {}),
    ...(input.scheduledFor ? { scheduledFor: new Date(input.scheduledFor).toISOString() } : {}),
    state: input.state,
    ...(input.takenAt ? { takenAt: new Date(input.takenAt).toISOString() } : {}),
    ...(input.quantity ? { quantity: input.quantity } : {}),
    ...(input.unit ? { unit: input.unit } : {}),
  });
}

function trustedResult(
  raw: unknown,
  input: RecordMedicationIntakeInput,
  scope: AuthorizedChildScope,
  outcome: "created" | "idempotent_replay",
): RecordMedicationIntakeTrustedResult {
  const parsed = SERVICE_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  const value = parsed.data;
  if (value.planId !== input.planReference
    || (input.occurrenceReference === undefined ? value.occurrenceId !== null : value.occurrenceId !== input.occurrenceReference)
    || !scheduledMatches(value.scheduledFor, input)
    || !sameInstant(value.takenAt, input.takenAt)
    || value.state !== input.state
    || value.quantity !== (input.quantity ?? null)
    || value.unit !== (input.unit ?? null)
    || value.recordedBy !== scope.actorUserId
    || value.supersedesId !== null) {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  }
  const result = RECORD_MEDICATION_INTAKE_TRUSTED_RESULT_SCHEMA.safeParse({
    kind: "trusted_tool_result",
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      outcome,
      state: value.state,
      scheduledFor: value.scheduledFor === null ? null : new Date(value.scheduledFor).toISOString(),
      takenAt: value.takenAt === null ? null : new Date(value.takenAt).toISOString(),
    },
  });
  if (!result.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  return Object.freeze(result.data) as RecordMedicationIntakeTrustedResult;
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, input) => {
    const context = runtime.trustedContext as TrustedToolContext<RecordMedicationIntakeServices>;
    const services = servicesFor(context);
    const signal = getTrustedToolAbortSignal(context);
    abortIfNeeded(signal);
    if (!runtime.idempotencyKey || !runtime.approvalSha256) return safeFailure("CONFIRMATION_INVALID", "none");

    // Reauthorize after approval and immediately before the request-scoped domain call.
    const scope = reauthorize(context, "none");
    const command = commandForInput(input);
    const operation: RuntimeMedicationOperation = Object.freeze({
      idempotencyKey: runtime.idempotencyKey,
      digest: runtime.requestSha256,
      approvalSha256: runtime.approvalSha256,
      requestSha256: runtime.requestSha256,
    });
    let rawReceipt: MedicationIntakeRecordReceipt;
    try {
      rawReceipt = await services.medicationIntakes.recordWithOutcome(scope, command, operation);
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "unknown");
      return mapDomainFailure(error, "unknown");
    }
    abortIfNeeded(signal, "unknown");
    // The domain port may return an idempotent replay. Reauthorize once more
    // before exposing that receipt so revocation cannot turn into a success.
    const postWriteScope = reauthorize(context, "unknown");
    const outcome = rawReceipt.outcome === "replayed" || rawReceipt.outcome === "idempotent_replay"
      ? "idempotent_replay" as const
      : rawReceipt.outcome === "created"
        ? "created" as const
        : safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    const result = trustedResult(rawReceipt.value, input, postWriteScope, outcome);
    return Object.freeze({
      status: "committed" as const,
      outcome: outcome === "idempotent_replay" ? "replayed" as const : "created" as const,
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

export function projectRecordMedicationIntakeForModel(raw: unknown): RecordMedicationIntakeModelResult {
  const parsed = RECORD_MEDICATION_INTAKE_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      outcome: parsed.data.data.outcome,
      state: parsed.data.data.state,
      scheduledFor: parsed.data.data.scheduledFor,
      takenAt: parsed.data.data.takenAt,
    },
  });
}

export async function executeRecordMedicationIntake(
  context: TrustedToolContext,
  rawInput: unknown,
  approval: ToolApprovalSubmission | null = null,
): Promise<RecordMedicationIntakeExecution> {
  try {
    const raw = await invokeWithAudit(context, rawInput, approval);
    if ("allowed" in raw) {
      return safeFailure(raw.status === "approval_required" ? "CONFIRMATION_REQUIRED" : "CONFIRMATION_INVALID", "none");
    }
    const parsed = RECORD_MEDICATION_INTAKE_OUTPUT_SCHEMA.safeParse({
      status: "succeeded",
      outcome: raw.outcome,
      result: raw.result,
      idempotencyKey: raw.idempotencyKey,
      requestSha256: raw.requestSha256,
      approvalSha256: raw.approvalSha256,
    });
    if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    return Object.freeze(parsed.data) as RecordMedicationIntakeExecution;
  } catch (error) {
    throw mapToolError(error, { effectState: "unknown" });
  }
}

export default defineTool({
  description: "Registra un hecho retrospectivo de ingesta de medicamento declarado por el tutor; no infiere adherencia, no aconseja tomar, omitir, duplicar o compensar y no modifica el plan.",
  inputSchema: RECORD_MEDICATION_INTAKE_INPUT_SCHEMA,
  outputSchema: RECORD_MEDICATION_INTAKE_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeRecordMedicationIntake(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectRecordMedicationIntakeForModel(output.result));
  },
});
