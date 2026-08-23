import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import type { AuthorizedChildScope } from "../access/authorized-child-scope";
import {
  getTrustedToolAbortSignal,
  getTrustedToolActor,
  getTrustedToolEntitlements,
  getTrustedToolLocale,
  getTrustedToolServices,
  getTrustedToolSession,
  getTrustedToolTrace,
  requireActiveChildScope,
  type TrustedToolContext,
} from "./trusted-tool-context";
import {
  TOOL_APPROVAL_REQUIREMENTS,
  verifyToolApproval,
  type ApprovalDecision,
  type ApprovalPreview,
  type ToolEffect,
} from "./tool-approval-policy";
import {
  REGISTERED_TOOL_IDS,
  authorizeToolInvocation,
  type RegisteredToolId,
} from "./tool-permission-policy";
import { isSafeToolError } from "./safe-tool-errors";

const REQUEST_VERSION = "tool-idempotency-request.v1" as const;
const SCHEMA_VERSION = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const VERSIONED_OPERATION = z.string().min(1).max(128).regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.v[1-9][0-9]*$/u);
const HASH = /^[a-f0-9]{64}$/u;

export type ToolIdempotencyErrorCode =
  | "TOOL_IDEMPOTENCY_DEFINITION_INVALID"
  | "TOOL_IDEMPOTENCY_DENIED"
  | "TOOL_IDEMPOTENCY_CONFLICT"
  | "TOOL_IDEMPOTENCY_CANCELLED"
  | "TOOL_IDEMPOTENCY_RESULT_INVALID"
  | "TOOL_IDEMPOTENCY_UNAVAILABLE";

export class ToolIdempotencyError extends Error {
  constructor(readonly code: ToolIdempotencyErrorCode) {
    super(code);
    this.name = "ToolIdempotencyError";
  }
}

export type ToolHandlerOutcome<T> =
  | Readonly<{ status: "no_effect"; result: T }>
  | Readonly<{ status: "committed"; outcome: "created" | "replayed"; result: T }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "cancelled" }>;

export type ToolReplayOutcome<T> = Readonly<{
  status: "succeeded";
  outcome: "no_effect" | "created" | "replayed";
  result: T;
  idempotencyKey: string | null;
  requestSha256: string;
  approvalSha256: string | null;
}>;

export type IdempotentToolContext = Readonly<{
  trustedContext: TrustedToolContext;
  scope: AuthorizedChildScope;
  toolId: RegisteredToolId;
  schemaVersion: string;
  effect: ToolEffect;
  operation: string;
  idempotencyKey: string | null;
  requestSha256: string;
  approvalSha256: string | null;
}>;

export type ToolIdempotencyDefinition<TInput, TResult> = Readonly<{
  toolId: RegisteredToolId;
  schemaVersion: string;
  effect: ToolEffect;
  operation: string;
  inputSchema: z.ZodType<TInput>;
  resultSchema: z.ZodType<TResult>;
}>;

export type ToolApprovalSubmission = Readonly<{
  preview: ApprovalPreview;
  token: string;
}>;

export type ToolIdempotencyInvocationResult<TResult> =
  | ToolReplayOutcome<TResult>
  | Extract<ApprovalDecision, { allowed: false }>;

export interface ToolIdempotencyClock {
  now(): Date;
}

const handlerOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("no_effect"), result: z.unknown() }).strict(),
  z.object({
    status: z.literal("committed"),
    outcome: z.enum(["created", "replayed"]),
    result: z.unknown(),
  }).strict(),
  z.object({ status: z.literal("conflict") }).strict(),
  z.object({ status: z.literal("cancelled") }).strict(),
]);

function fail(code: ToolIdempotencyErrorCode): never {
  throw new ToolIdempotencyError(code);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function validZodSchema(value: unknown): value is z.ZodType {
  return value !== null
    && typeof value === "object"
    && typeof (value as { safeParse?: unknown }).safeParse === "function";
}

function validateDefinition<TInput, TResult>(
  raw: ToolIdempotencyDefinition<TInput, TResult>,
): ToolIdempotencyDefinition<TInput, TResult> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("TOOL_IDEMPOTENCY_DEFINITION_INVALID");
  const keys = Object.keys(raw).sort().join("|");
  if (keys !== "effect|inputSchema|operation|resultSchema|schemaVersion|toolId"
    || !REGISTERED_TOOL_IDS.includes(raw.toolId)
    || !SCHEMA_VERSION.safeParse(raw.schemaVersion).success
    || !validZodSchema(raw.inputSchema)
    || !validZodSchema(raw.resultSchema)) fail("TOOL_IDEMPOTENCY_DEFINITION_INVALID");
  const requirement = TOOL_APPROVAL_REQUIREMENTS[raw.toolId];
  if (requirement.effect !== raw.effect
    || (raw.effect === "read_only" && raw.operation !== "no_effect")
    || (raw.effect !== "read_only" && !VERSIONED_OPERATION.safeParse(raw.operation).success)) {
    fail("TOOL_IDEMPOTENCY_DEFINITION_INVALID");
  }
  return Object.freeze({ ...raw });
}

function clockFor(context: TrustedToolContext): ToolIdempotencyClock | null {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const raw = services.toolIdempotency;
    if (!raw || typeof raw !== "object") return null;
    const clock = raw as Partial<ToolIdempotencyClock>;
    return typeof clock.now === "function" ? clock as ToolIdempotencyClock : null;
  } catch {
    return null;
  }
}

function nowFrom(clock: ToolIdempotencyClock): Date | null {
  try {
    const now = clock.now();
    return now instanceof Date && Number.isFinite(now.getTime()) ? new Date(now) : null;
  } catch {
    return null;
  }
}

function createRuntimeContext(
  trustedContext: TrustedToolContext,
  definition: ToolIdempotencyDefinition<unknown, unknown>,
  scope: AuthorizedChildScope,
  idempotencyKey: string | null,
  requestSha256: string,
  approvalSha256: string | null,
): IdempotentToolContext {
  const runtime = Object.create(null) as IdempotentToolContext;
  Object.defineProperties(runtime, {
    trustedContext: { value: trustedContext, enumerable: false },
    scope: { value: scope, enumerable: false },
    toolId: { value: definition.toolId, enumerable: false },
    schemaVersion: { value: definition.schemaVersion, enumerable: false },
    effect: { value: definition.effect, enumerable: false },
    operation: { value: definition.operation, enumerable: false },
    idempotencyKey: { value: idempotencyKey, enumerable: false },
    requestSha256: { value: requestSha256, enumerable: false },
    approvalSha256: { value: approvalSha256, enumerable: false },
  });
  return Object.freeze(runtime);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function parseResult<TResult>(schema: z.ZodType<TResult>, raw: unknown): TResult {
  let result: z.ZodSafeParseResult<TResult>;
  try {
    result = schema.safeParse(raw);
  } catch {
    fail("TOOL_IDEMPOTENCY_RESULT_INVALID");
  }
  if (!result.success) fail("TOOL_IDEMPOTENCY_RESULT_INVALID");
  return deepFreeze(result.data);
}

export function withToolIdempotency<TInput, TResult>(
  rawDefinition: ToolIdempotencyDefinition<TInput, TResult>,
  handler: (
    context: IdempotentToolContext,
    input: TInput,
  ) => Promise<ToolHandlerOutcome<unknown>>,
): (
  context: TrustedToolContext,
  rawInput: unknown,
  approval: ToolApprovalSubmission | null,
) => Promise<ToolIdempotencyInvocationResult<TResult>> {
  const definition = validateDefinition(rawDefinition);
  if (typeof handler !== "function") fail("TOOL_IDEMPOTENCY_DEFINITION_INVALID");

  return async (context, rawInput, approval) => {
    const clock = clockFor(context);
    const now = clock ? nowFrom(clock) : null;
    if (!now) fail("TOOL_IDEMPOTENCY_DENIED");

    const approvalDecision = await verifyToolApproval(context, definition.toolId, Object.freeze({
      schemaVersion: definition.schemaVersion,
      inputSchema: definition.inputSchema,
      rawInput,
      approval,
    }));
    if (!approvalDecision.allowed) return approvalDecision;
    if (!authorizeToolInvocation(context, definition.toolId, now).allowed) fail("TOOL_IDEMPOTENCY_DENIED");

    let input: z.ZodSafeParseResult<TInput>;
    try {
      input = definition.inputSchema.safeParse(rawInput);
    } catch {
      fail("TOOL_IDEMPOTENCY_DENIED");
    }
    if (!input.success) fail("TOOL_IDEMPOTENCY_DENIED");

    let scope: AuthorizedChildScope;
    try {
      scope = requireActiveChildScope(context, now);
    } catch {
      fail("TOOL_IDEMPOTENCY_DENIED");
    }
    const abortSignal = getTrustedToolAbortSignal(context);
    if (abortSignal.aborted) fail("TOOL_IDEMPOTENCY_CANCELLED");

    const actor = getTrustedToolActor(context);
    const session = getTrustedToolSession(context);
    const entitlements = getTrustedToolEntitlements(context);
    const trace = getTrustedToolTrace(context);
    const approvalSha256 = approvalDecision.status === "approved"
      ? approvalDecision.approvalDigest
      : null;
    const idempotencyKey = definition.effect === "read_only"
      ? null
      : `${definition.toolId}:${hash({
        version: "tool-idempotency-key.v1",
        productSessionId: session.productSessionId,
        toolCallId: trace.toolCallId,
        toolId: definition.toolId,
        operation: definition.operation,
      })}`;
    if (definition.effect !== "read_only"
      && (!idempotencyKey || !/^[a-z][a-z0-9_]*:[a-f0-9]{64}$/u.test(idempotencyKey))) {
      fail("TOOL_IDEMPOTENCY_DENIED");
    }
    const requestSha256 = hash({
      version: REQUEST_VERSION,
      toolId: definition.toolId,
      schemaVersion: definition.schemaVersion,
      effect: definition.effect,
      operation: definition.operation,
      actorUserId: actor.userId,
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      productSessionId: session.productSessionId,
      authorizationVersion: session.authorizationVersion,
      entitlementRevision: entitlements.revision,
      locale: getTrustedToolLocale(context),
      approvalSha256,
      input: input.data,
    });
    if (!HASH.test(requestSha256)) fail("TOOL_IDEMPOTENCY_DENIED");

    const runtime = createRuntimeContext(
      context,
      definition as ToolIdempotencyDefinition<unknown, unknown>,
      scope,
      idempotencyKey,
      requestSha256,
      approvalSha256,
    );
    let rawOutcome: unknown;
    try {
      rawOutcome = await handler(runtime, input.data);
    } catch (error) {
      if (isSafeToolError(error)) throw error;
      fail("TOOL_IDEMPOTENCY_UNAVAILABLE");
    }
    const outcome = handlerOutcomeSchema.safeParse(rawOutcome);
    if (!outcome.success) fail("TOOL_IDEMPOTENCY_UNAVAILABLE");
    if (outcome.data.status === "conflict") fail("TOOL_IDEMPOTENCY_CONFLICT");
    if (outcome.data.status === "cancelled") fail("TOOL_IDEMPOTENCY_CANCELLED");

    if (definition.effect === "read_only") {
      if (outcome.data.status !== "no_effect" || abortSignal.aborted) fail("TOOL_IDEMPOTENCY_CANCELLED");
    } else if (outcome.data.status !== "committed") {
      fail("TOOL_IDEMPOTENCY_UNAVAILABLE");
    }
    const result = parseResult(definition.resultSchema, outcome.data.result);
    const replayOutcome: ToolReplayOutcome<TResult>["outcome"] = outcome.data.status === "no_effect"
      ? "no_effect"
      : outcome.data.outcome;
    return Object.freeze({
      status: "succeeded" as const,
      outcome: replayOutcome,
      result,
      idempotencyKey,
      requestSha256,
      approvalSha256,
    });
  };
}
