const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9._-]{0,63}$/u;

export type ToolExecutionScope = Readonly<{
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  productSessionId: string;
}>;

export type ToolExecutionStatus = "requested" | "running" | "succeeded" | "failed" | "blocked";
export type ToolConfirmationStatus = "not_required" | "pending" | "confirmed" | "declined";
export type ToolEffectState = "none" | "committed" | "unknown";

export type ToolExecutionProjectionState = Readonly<{
  scope: ToolExecutionScope;
  executionId: string;
  toolName: string;
  toolVersion: string;
  idempotencyKey: string;
  confirmationStatus: ToolConfirmationStatus;
  executionStatus: ToolExecutionStatus;
  inputDigest: string;
  authorizationDigest: string;
  resultDigest: string | null;
  resourceId: string | null;
  effectState: ToolEffectState;
  lastSequence: number;
}>;

type CommonToolEvent = Readonly<{
  executionId: string;
  toolName: string;
  toolVersion: string;
  idempotencyKey: string;
}>;

export type ToolExecutionProjectionEvent =
  | (CommonToolEvent & Readonly<{ type: "tool.requested"; confirmationStatus: ToolConfirmationStatus; inputDigest: string; authorizationDigest: string }>)
  | (CommonToolEvent & Readonly<{ type: "tool.running"; authorizationDigest: string }>)
  | (CommonToolEvent & Readonly<{ type: "tool.succeeded"; resultDigest: string; resourceId: string | null }>)
  | (CommonToolEvent & Readonly<{ type: "tool.failed"; errorCode: string; effectState: Exclude<ToolEffectState, "committed"> }>)
  | (CommonToolEvent & Readonly<{ type: "tool.blocked"; errorCode: string }>);

export type ToolExecutionProjectionEnvelope = Readonly<{
  scope: ToolExecutionScope;
  sourceEventId: string;
  sourceEventVersion: string;
  sourceSequence: number;
  occurredAt: string;
  event: ToolExecutionProjectionEvent;
}>;

type ProcessedToolSource = Readonly<{
  sourceEventId: string;
  sourceEventVersion: string;
  sourceSequence: number;
  executionStatus: ToolExecutionStatus;
}>;

export type SafeToolChannelEvent = Readonly<{
  resource: "tool_execution";
  scope: ToolExecutionScope;
  sourceEventId: string;
  version: number;
  occurredAt: string;
}>;

export type ToolExecutionProjectionTransaction = Readonly<{
  findExecution(input: Readonly<{ scope: ToolExecutionScope; executionId: string }>): Promise<ToolExecutionProjectionState | null>;
  findProcessedSource(input: Readonly<{ scope: ToolExecutionScope; sourceEventId: string }>): Promise<ProcessedToolSource | null>;
  findToolRegistration(input: Readonly<{ toolName: string; toolVersion: string }>): Promise<Readonly<{ registered: true }> | null>;
  upsertExecution(state: ToolExecutionProjectionState): Promise<ToolExecutionProjectionState>;
  appendSafeChannelEvent(event: SafeToolChannelEvent): Promise<void>;
  recordProcessedSource(event: ProcessedToolSource): Promise<void>;
  quarantine(event: Readonly<{
    scope: ToolExecutionScope;
    sourceEventId: string;
    sourceSequence: number;
    reason: "invalid_event" | "out_of_order" | "scope_mismatch" | "unknown_tool" | "result_reference_mismatch" | "terminal_transition" | "source_conflict";
  }>): Promise<void>;
}>;

export type ToolExecutionProjectionResult =
  | Readonly<{ disposition: "stored"; outcome?: "created" | "replayed"; executionId: string; executionStatus: ToolExecutionStatus; effectState: ToolEffectState }>
  | Readonly<{ disposition: "suppressed"; reason: "untrusted_tool_payload" }>
  | Readonly<{ disposition: "quarantined"; sourceEventId: string; reason: "invalid_event" | "out_of_order" | "scope_mismatch" | "unknown_tool" | "result_reference_mismatch" | "terminal_transition" | "source_conflict" }>
  | Readonly<{ disposition: "rejected"; sourceEventId: string; reason: "invalid_event" | "not_found" | "scope_mismatch" | "unknown_tool" }>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function safeOpaque(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value);
}

function validScope(value: unknown): value is ToolExecutionScope {
  return isRecord(value)
    && exactKeys(value, ["ownerUserId", "careSpaceId", "childId", "productSessionId"])
    && isUuid(value.ownerUserId)
    && isUuid(value.careSpaceId)
    && isUuid(value.childId)
    && isUuid(value.productSessionId);
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function sameScope(left: ToolExecutionScope, right: ToolExecutionScope): boolean {
  return left.ownerUserId === right.ownerUserId
    && left.careSpaceId === right.careSpaceId
    && left.childId === right.childId
    && left.productSessionId === right.productSessionId;
}

function commonEvent(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return exactKeys(value, keys)
    && isUuid(value.executionId)
    && safeOpaque(value.toolName)
    && typeof value.toolVersion === "string" && VERSION.test(value.toolVersion)
    && safeOpaque(value.idempotencyKey);
}

function validEvent(value: unknown): value is ToolExecutionProjectionEvent {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "tool.requested") {
    return commonEvent(value, ["type", "executionId", "toolName", "toolVersion", "idempotencyKey", "confirmationStatus", "inputDigest", "authorizationDigest"])
      && ["not_required", "pending", "confirmed", "declined"].includes(String(value.confirmationStatus))
      && typeof value.inputDigest === "string" && DIGEST.test(value.inputDigest)
      && typeof value.authorizationDigest === "string" && DIGEST.test(value.authorizationDigest);
  }
  if (value.type === "tool.running") {
    return commonEvent(value, ["type", "executionId", "toolName", "toolVersion", "idempotencyKey", "authorizationDigest"])
      && typeof value.authorizationDigest === "string" && DIGEST.test(value.authorizationDigest);
  }
  if (value.type === "tool.succeeded") {
    return commonEvent(value, ["type", "executionId", "toolName", "toolVersion", "idempotencyKey", "resultDigest", "resourceId"])
      && typeof value.resultDigest === "string" && DIGEST.test(value.resultDigest)
      && (value.resourceId === null || safeOpaque(value.resourceId));
  }
  if (value.type === "tool.failed") {
    return commonEvent(value, ["type", "executionId", "toolName", "toolVersion", "idempotencyKey", "errorCode", "effectState"])
      && typeof value.errorCode === "string" && ERROR_CODE.test(value.errorCode)
      && (value.effectState === "none" || value.effectState === "unknown");
  }
  return value.type === "tool.blocked"
    && commonEvent(value, ["type", "executionId", "toolName", "toolVersion", "idempotencyKey", "errorCode"])
    && typeof value.errorCode === "string" && ERROR_CODE.test(value.errorCode);
}

function validEnvelope(value: unknown): value is ToolExecutionProjectionEnvelope {
  return isRecord(value)
    && exactKeys(value, ["scope", "sourceEventId", "sourceEventVersion", "sourceSequence", "occurredAt", "event"])
    && validScope(value.scope)
    && safeOpaque(value.sourceEventId)
    && typeof value.sourceEventVersion === "string" && VERSION.test(value.sourceEventVersion)
    && Number.isSafeInteger(value.sourceSequence) && (value.sourceSequence as number) > 0
    && isInstant(value.occurredAt)
    && validEvent(value.event);
}

function isSensitiveUntrustedEvent(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (/^(action\.|provider\.|step\.)/u.test(value.type)) return true;
  return value.type.startsWith("tool.")
    && !["tool.requested", "tool.running", "tool.succeeded", "tool.failed", "tool.blocked"].includes(value.type);
}

function quarantine(
  tx: ToolExecutionProjectionTransaction,
  input: ToolExecutionProjectionEnvelope,
  reason: "invalid_event" | "out_of_order" | "scope_mismatch" | "unknown_tool" | "result_reference_mismatch" | "terminal_transition" | "source_conflict",
): Promise<ToolExecutionProjectionResult> {
  return tx.quarantine({ scope: input.scope, sourceEventId: input.sourceEventId, sourceSequence: input.sourceSequence, reason })
    .then(() => Object.freeze({ disposition: "quarantined" as const, sourceEventId: input.sourceEventId, reason }));
}

function nextState(current: ToolExecutionProjectionState | null, event: ToolExecutionProjectionEvent, input: ToolExecutionProjectionEnvelope): ToolExecutionProjectionState | null {
  const status: ToolExecutionStatus = event.type === "tool.requested"
    ? "requested"
    : event.type === "tool.running"
      ? "running"
      : event.type === "tool.succeeded"
        ? "succeeded"
        : event.type === "tool.failed"
          ? "failed"
          : "blocked";
  if (current === null) {
    if (event.type !== "tool.requested") return null;
    return Object.freeze({
      scope: input.scope,
      executionId: event.executionId,
      toolName: event.toolName,
      toolVersion: event.toolVersion,
      idempotencyKey: event.idempotencyKey,
      confirmationStatus: event.confirmationStatus,
      executionStatus: status,
      inputDigest: event.inputDigest,
      authorizationDigest: event.authorizationDigest,
      resultDigest: null,
      resourceId: null,
      effectState: "none",
      lastSequence: input.sourceSequence,
    });
  }
  if (current.executionStatus === "succeeded" || current.executionStatus === "failed" || current.executionStatus === "blocked") return null;
  const confirmationStatus = event.type === "tool.requested" ? event.confirmationStatus : current.confirmationStatus;
  const resultDigest = event.type === "tool.succeeded" ? event.resultDigest : null;
  const resourceId = event.type === "tool.succeeded" ? event.resourceId : null;
  const effectState: ToolEffectState = event.type === "tool.succeeded" ? "committed" : event.type === "tool.failed" ? event.effectState : "none";
  return Object.freeze({ ...current, confirmationStatus, executionStatus: status, resultDigest, resourceId, effectState, lastSequence: input.sourceSequence });
}

export async function projectToolExecutionEvent(tx: ToolExecutionProjectionTransaction, input: unknown): Promise<ToolExecutionProjectionResult> {
  if (isSensitiveUntrustedEvent(isRecord(input) ? input.event : undefined)) return Object.freeze({ disposition: "suppressed" as const, reason: "untrusted_tool_payload" as const });
  if (!validEnvelope(input)) return Object.freeze({ disposition: "rejected" as const, sourceEventId: isRecord(input) && typeof input.sourceEventId === "string" ? input.sourceEventId : "invalid", reason: "invalid_event" as const });

  const existingSource = await tx.findProcessedSource({ scope: input.scope, sourceEventId: input.sourceEventId });
  if (existingSource) {
    if (existingSource.sourceEventVersion !== input.sourceEventVersion || existingSource.sourceSequence !== input.sourceSequence) return quarantine(tx, input, "source_conflict");
    return Object.freeze({ disposition: "stored" as const, outcome: "replayed" as const, executionId: input.event.executionId, executionStatus: existingSource.executionStatus, effectState: "none" as const });
  }

  const event = input.event;
  const registration = await tx.findToolRegistration({ toolName: event.toolName, toolVersion: event.toolVersion });
  if (!registration) return Object.freeze({ disposition: "rejected" as const, sourceEventId: input.sourceEventId, reason: "unknown_tool" as const });
  const current = await tx.findExecution({ scope: input.scope, executionId: event.executionId });
  if (current && !sameScope(current.scope, input.scope)) return Object.freeze({ disposition: "rejected" as const, sourceEventId: input.sourceEventId, reason: "scope_mismatch" as const });
  if (current && current.lastSequence >= input.sourceSequence) return quarantine(tx, input, "out_of_order");
  if (current && (current.toolName !== event.toolName || current.toolVersion !== event.toolVersion || current.idempotencyKey !== event.idempotencyKey)) return quarantine(tx, input, "result_reference_mismatch");
  if (current && event.type === "tool.succeeded" && current.executionStatus !== "running") return quarantine(tx, input, "result_reference_mismatch");
  const updated = nextState(current, event, input);
  if (!updated) return quarantine(tx, input, current?.executionStatus === "succeeded" || current?.executionStatus === "failed" || current?.executionStatus === "blocked" ? "terminal_transition" : "result_reference_mismatch");
  const stored = await tx.upsertExecution(updated);
  await tx.appendSafeChannelEvent({ resource: "tool_execution", scope: input.scope, sourceEventId: input.sourceEventId, version: input.sourceSequence, occurredAt: input.occurredAt });
  await tx.recordProcessedSource({ sourceEventId: input.sourceEventId, sourceEventVersion: input.sourceEventVersion, sourceSequence: input.sourceSequence, executionStatus: stored.executionStatus });
  return Object.freeze({ disposition: "stored" as const, outcome: "created" as const, executionId: stored.executionId, executionStatus: stored.executionStatus, effectState: stored.effectState });
}
