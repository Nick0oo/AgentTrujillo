import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  getTrustedToolAbortSignal,
  getTrustedToolActor,
  getTrustedToolEntitlements,
  getTrustedToolServices,
  getTrustedToolSession,
  getTrustedToolTrace,
  requireActiveChildScope,
  type TrustedToolContext,
} from "./trusted-tool-context";
import {
  TOOL_APPROVAL_REQUIREMENTS,
  type ToolEffect,
} from "./tool-approval-policy";
import { ToolIdempotencyError } from "./tool-idempotency";
import { isSafeToolError, type SafeToolError } from "./safe-tool-errors";
import {
  REGISTERED_TOOL_IDS,
  TOOL_PERMISSION_POLICY,
  authorizeToolInvocation,
  type RegisteredToolId,
} from "./tool-permission-policy";

const EVENT_VERSION = "tool-audit-event.v1" as const;
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u);
const SCHEMA_VERSION = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const VERSIONED_OPERATION = z.string().min(1).max(128).regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.v[1-9][0-9]*$/u);
const INSTANT = z.string().datetime({ offset: true });
const SAFE_ERROR_CODE = z.string().min(1).max(96).regex(/^[A-Z][A-Z0-9_]*$/u);

export type ToolAuditOutcome =
  | "allowed"
  | "denied"
  | "approval"
  | "replay"
  | "success"
  | "failure"
  | "cancellation";

export type ToolAuditEvent = Readonly<{
  schemaVersion: typeof EVENT_VERSION;
  eventId: string;
  outcome: ToolAuditOutcome;
  correlationId: string;
  requestId: string;
  toolCallId: string;
  toolId: RegisteredToolId;
  toolSchemaVersion: string;
  effect: ToolEffect;
  operation: string;
  actorSha256: string;
  careSpaceSha256: string;
  childSha256: string;
  sessionSha256: string;
  authorizationSha256: string;
  policySha256: string;
  approvalSha256: string | null;
  inputSha256: string | null;
  resultSha256: string | null;
  commandSha256: string | null;
  safeErrorCode: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}>;

export interface RedactedToolAuditSink {
  now(): Date;
  emit(event: ToolAuditEvent): Promise<unknown>;
}

export type ToolAuditDefinition = Readonly<{
  toolId: RegisteredToolId;
  schemaVersion: string;
  effect: ToolEffect;
  operation: string;
}>;

export type ToolAuditErrorCode =
  | "TOOL_AUDIT_DEFINITION_INVALID"
  | "TOOL_AUDIT_UNAVAILABLE"
  | "TOOL_AUDIT_DENIED"
  | "TOOL_AUDIT_CANCELLED"
  | "TOOL_AUDIT_HANDLER_RESULT_INVALID"
  | "TOOL_AUDIT_HANDLER_FAILED";

export class ToolAuditError extends Error {
  constructor(readonly code: ToolAuditErrorCode) {
    super(code);
    this.name = "ToolAuditError";
  }
}

const eventSchema = z.object({
  schemaVersion: z.literal(EVENT_VERSION),
  eventId: DIGEST,
  outcome: z.enum(["allowed", "denied", "approval", "replay", "success", "failure", "cancellation"]),
  correlationId: OPAQUE_ID,
  requestId: OPAQUE_ID,
  toolCallId: OPAQUE_ID,
  toolId: z.enum(REGISTERED_TOOL_IDS),
  toolSchemaVersion: SCHEMA_VERSION,
  effect: z.enum(["read_only", "draft", "mutating"]),
  operation: z.string().min(1).max(128),
  actorSha256: DIGEST,
  careSpaceSha256: DIGEST,
  childSha256: DIGEST,
  sessionSha256: DIGEST,
  authorizationSha256: DIGEST,
  policySha256: DIGEST,
  approvalSha256: DIGEST.nullable(),
  inputSha256: DIGEST.nullable(),
  resultSha256: DIGEST.nullable(),
  commandSha256: DIGEST.nullable(),
  safeErrorCode: SAFE_ERROR_CODE.nullable(),
  startedAt: INSTANT,
  completedAt: INSTANT,
  durationMs: z.number().int().nonnegative().max(86_400_000),
}).strict();

const receiptSchema = z.object({
  outcome: z.enum(["recorded", "duplicate"]),
  eventId: DIGEST,
  correlationId: OPAQUE_ID,
}).strict();

const approvalPreviewSchema = z.object({ approvalDigest: DIGEST }).passthrough();
const handlerResultSchema = z.union([
  z.object({
    status: z.literal("succeeded"),
    outcome: z.enum(["no_effect", "created", "replayed"]),
    result: z.unknown(),
    idempotencyKey: z.string().min(1).max(200).nullable(),
    requestSha256: DIGEST,
    approvalSha256: DIGEST.nullable(),
  }).strict().superRefine((value, context) => {
    const noEffect = value.outcome === "no_effect";
    if (noEffect !== (value.idempotencyKey === null && value.approvalSha256 === null)) {
      context.addIssue({ code: "custom", message: "effect_binding" });
    }
  }),
  z.object({
    allowed: z.literal(false),
    status: z.literal("denied"),
    policyVersion: z.literal("tool-approval.v1"),
    code: z.literal("TOOL_APPROVAL_DENIED"),
  }).strict(),
  z.object({
    allowed: z.literal(false),
    status: z.literal("approval_required"),
    policyVersion: z.literal("tool-approval.v1"),
    toolId: z.enum(REGISTERED_TOOL_IDS),
    effect: z.enum(["draft", "mutating"]),
    preview: approvalPreviewSchema,
  }).strict(),
]);

type ParsedHandlerResult = z.infer<typeof handlerResultSchema>;

type AuditMetadata = Readonly<{
  correlationId: string;
  requestId: string;
  toolCallId: string;
  actorSha256: string;
  careSpaceSha256: string;
  childSha256: string;
  sessionSha256: string;
  authorizationSha256: string;
  policySha256: string;
}>;

function fail(code: ToolAuditErrorCode): never {
  throw new ToolAuditError(code);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function validateDefinition(raw: ToolAuditDefinition): ToolAuditDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)
    || Object.keys(raw).sort().join("|") !== "effect|operation|schemaVersion|toolId"
    || !REGISTERED_TOOL_IDS.includes(raw.toolId)
    || !SCHEMA_VERSION.safeParse(raw.schemaVersion).success) fail("TOOL_AUDIT_DEFINITION_INVALID");
  const expected = TOOL_APPROVAL_REQUIREMENTS[raw.toolId];
  if (raw.effect !== expected.effect
    || (raw.effect === "read_only" && raw.operation !== "no_effect")
    || (raw.effect !== "read_only" && !VERSIONED_OPERATION.safeParse(raw.operation).success)) {
    fail("TOOL_AUDIT_DEFINITION_INVALID");
  }
  return Object.freeze({ ...raw });
}

function sinkFor(context: TrustedToolContext): RedactedToolAuditSink | null {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const raw = services.toolAudit;
    if (!raw || typeof raw !== "object") return null;
    const sink = raw as Partial<RedactedToolAuditSink>;
    return typeof sink.now === "function" && typeof sink.emit === "function"
      ? sink as RedactedToolAuditSink
      : null;
  } catch {
    return null;
  }
}

function readNow(sink: RedactedToolAuditSink): Date | null {
  try {
    const value = sink.now();
    return value instanceof Date && Number.isFinite(value.getTime()) ? new Date(value) : null;
  } catch {
    return null;
  }
}

function metadataFor(
  context: TrustedToolContext,
  definition: ToolAuditDefinition,
  now: Date,
): Readonly<{ metadata: AuditMetadata; active: boolean; cancelled: boolean }> | null {
  try {
    const actor = getTrustedToolActor(context);
    const session = getTrustedToolSession(context);
    const entitlements = getTrustedToolEntitlements(context);
    const trace = getTrustedToolTrace(context);
    const cancelled = getTrustedToolAbortSignal(context).aborted;
    let scope: ReturnType<typeof requireActiveChildScope> | null = null;
    try {
      scope = requireActiveChildScope(context, now);
    } catch {
      scope = null;
    }
    const sessionSha256 = hash({
      domain: "tool-audit-session.v1",
      productSessionId: session.productSessionId,
      eveSessionId: session.eveSessionId,
    });
    const unavailableScope = (kind: "care_space" | "child") => hash({
      domain: `tool-audit-${kind}.v1`,
      state: "unavailable",
      sessionSha256,
    });
    const metadata = Object.freeze({
      correlationId: trace.traceId,
      requestId: trace.requestId,
      toolCallId: trace.toolCallId,
      actorSha256: hash({ domain: "tool-audit-actor.v1", actorUserId: actor.userId }),
      careSpaceSha256: scope
        ? hash({ domain: "tool-audit-care-space.v1", careSpaceId: scope.careSpaceId })
        : unavailableScope("care_space"),
      childSha256: scope
        ? hash({ domain: "tool-audit-child.v1", childId: scope.childId })
        : unavailableScope("child"),
      sessionSha256,
      authorizationSha256: hash({
        domain: "tool-audit-authorization.v1",
        authorizationVersion: session.authorizationVersion,
      }),
      policySha256: hash({
        domain: "tool-audit-policy.v1",
        permissionPolicyVersion: "tool-permission.v1",
        approvalPolicyVersion: "tool-approval.v1",
        toolId: definition.toolId,
        schemaVersion: definition.schemaVersion,
        permission: TOOL_PERMISSION_POLICY[definition.toolId],
        approval: TOOL_APPROVAL_REQUIREMENTS[definition.toolId],
        entitlementRevision: entitlements.revision,
      }),
    });
    const active = scope !== null && authorizeToolInvocation(context, definition.toolId, now).allowed;
    return Object.freeze({ metadata, active, cancelled });
  } catch {
    return null;
  }
}

function classify(result: ParsedHandlerResult, sessionSha256: string): Readonly<{
  outcome: ToolAuditOutcome;
  approvalSha256: string | null;
  inputSha256: string | null;
  resultSha256: string | null;
  commandSha256: string | null;
}> {
  if ("allowed" in result) {
    return result.status === "approval_required"
      ? Object.freeze({
        outcome: "approval" as const,
        approvalSha256: result.preview.approvalDigest,
        inputSha256: null,
        resultSha256: null,
        commandSha256: null,
      })
      : Object.freeze({
        outcome: "denied" as const,
        approvalSha256: null,
        inputSha256: null,
        resultSha256: null,
        commandSha256: null,
      });
  }
  return Object.freeze({
    outcome: result.outcome === "no_effect" ? "allowed" as const
      : result.outcome === "replayed" ? "replay" as const : "success" as const,
    approvalSha256: result.approvalSha256,
    inputSha256: result.requestSha256,
    resultSha256: hash({ domain: "tool-audit-result.v1", sessionSha256, result: result.result }),
    commandSha256: result.idempotencyKey === null
      ? null
      : hash({ domain: "tool-audit-command.v1", idempotencyKey: result.idempotencyKey }),
  });
}

function safeThrown(error: unknown): Readonly<{
  outcome: "failure" | "cancellation";
  safeErrorCode: string;
  returnedError: ToolAuditError | ToolIdempotencyError | SafeToolError;
}> {
  if (isSafeToolError(error)) {
    return Object.freeze({
      outcome: error.code === "CANCELLED" ? "cancellation" : "failure",
      safeErrorCode: error.code,
      returnedError: error,
    });
  }
  if (error instanceof ToolIdempotencyError && error.code === "TOOL_IDEMPOTENCY_CANCELLED") {
    return Object.freeze({ outcome: "cancellation", safeErrorCode: error.code, returnedError: error });
  }
  if (error instanceof ToolIdempotencyError) {
    return Object.freeze({ outcome: "failure", safeErrorCode: error.code, returnedError: error });
  }
  return Object.freeze({
    outcome: "failure",
    safeErrorCode: "TOOL_AUDIT_UNKNOWN_FAILURE",
    returnedError: new ToolAuditError("TOOL_AUDIT_HANDLER_FAILED"),
  });
}

function makeEvent(
  definition: ToolAuditDefinition,
  metadata: AuditMetadata,
  state: Readonly<{
    outcome: ToolAuditOutcome;
    approvalSha256: string | null;
    inputSha256: string | null;
    resultSha256: string | null;
    commandSha256: string | null;
    safeErrorCode: string | null;
  }>,
  startedAt: Date,
  completedAt: Date,
): ToolAuditEvent | null {
  const durationMs = completedAt.getTime() - startedAt.getTime();
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) return null;
  const eventId = hash({
    version: EVENT_VERSION,
    definition,
    metadata,
    outcome: state.outcome,
    approvalSha256: state.approvalSha256,
    inputSha256: state.inputSha256,
    resultSha256: state.resultSha256,
    commandSha256: state.commandSha256,
    safeErrorCode: state.safeErrorCode,
  });
  const parsed = eventSchema.safeParse({
    schemaVersion: EVENT_VERSION,
    eventId,
    outcome: state.outcome,
    ...metadata,
    toolId: definition.toolId,
    toolSchemaVersion: definition.schemaVersion,
    effect: definition.effect,
    operation: definition.operation,
    approvalSha256: state.approvalSha256,
    inputSha256: state.inputSha256,
    resultSha256: state.resultSha256,
    commandSha256: state.commandSha256,
    safeErrorCode: state.safeErrorCode,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
  });
  return parsed.success ? Object.freeze(parsed.data) as ToolAuditEvent : null;
}

async function emitEvent(sink: RedactedToolAuditSink, event: ToolAuditEvent): Promise<boolean> {
  try {
    const receipt = receiptSchema.safeParse(await sink.emit(event));
    return receipt.success
      && receipt.data.eventId === event.eventId
      && receipt.data.correlationId === event.correlationId;
  } catch {
    return false;
  }
}

export function withToolAudit<TArgs extends readonly unknown[], TResult>(
  rawDefinition: ToolAuditDefinition,
  handler: (context: TrustedToolContext, ...args: TArgs) => Promise<TResult>,
): (context: TrustedToolContext, ...args: TArgs) => Promise<TResult> {
  const definition = validateDefinition(rawDefinition);
  if (typeof handler !== "function") fail("TOOL_AUDIT_DEFINITION_INVALID");

  return async (context, ...args) => {
    const sink = sinkFor(context);
    const startedAt = sink ? readNow(sink) : null;
    if (!sink || !startedAt) fail("TOOL_AUDIT_UNAVAILABLE");
    const contextState = metadataFor(context, definition, startedAt);
    if (!contextState) fail("TOOL_AUDIT_UNAVAILABLE");

    let result: TResult | undefined;
    let returnedError: ToolAuditError | ToolIdempotencyError | SafeToolError | null = null;
    let state: Readonly<{
      outcome: ToolAuditOutcome;
      approvalSha256: string | null;
      inputSha256: string | null;
      resultSha256: string | null;
      commandSha256: string | null;
      safeErrorCode: string | null;
    }>;

    if (!contextState.active) {
      const cancelled = contextState.cancelled;
      returnedError = new ToolAuditError(cancelled ? "TOOL_AUDIT_CANCELLED" : "TOOL_AUDIT_DENIED");
      state = Object.freeze({
        outcome: cancelled ? "cancellation" : "denied",
        approvalSha256: null,
        inputSha256: null,
        resultSha256: null,
        commandSha256: null,
        safeErrorCode: returnedError.code,
      });
    } else {
      try {
        result = await handler(context, ...args);
        const parsed = handlerResultSchema.safeParse(result);
        if (!parsed.success) {
          returnedError = new ToolAuditError("TOOL_AUDIT_HANDLER_RESULT_INVALID");
          state = Object.freeze({
            outcome: "failure",
            approvalSha256: null,
            inputSha256: null,
            resultSha256: null,
            commandSha256: null,
            safeErrorCode: returnedError.code,
          });
        } else {
          try {
            state = Object.freeze({
              ...classify(parsed.data, contextState.metadata.sessionSha256),
              safeErrorCode: null,
            });
          } catch {
            returnedError = new ToolAuditError("TOOL_AUDIT_HANDLER_RESULT_INVALID");
            state = Object.freeze({
              outcome: "failure",
              approvalSha256: null,
              inputSha256: null,
              resultSha256: null,
              commandSha256: null,
              safeErrorCode: returnedError.code,
            });
          }
        }
      } catch (error) {
        const thrown = safeThrown(error);
        returnedError = thrown.returnedError;
        state = Object.freeze({
          outcome: thrown.outcome,
          approvalSha256: null,
          inputSha256: null,
          resultSha256: null,
          commandSha256: null,
          safeErrorCode: thrown.safeErrorCode,
        });
      }
    }

    const completedAt = readNow(sink);
    const event = completedAt
      ? makeEvent(definition, contextState.metadata, state, startedAt, completedAt)
      : null;
    if (!event || !(await emitEvent(sink, event))) fail("TOOL_AUDIT_UNAVAILABLE");
    if (returnedError) throw returnedError;
    return result as TResult;
  };
}
