import {
  isSafeToolError,
  type ToolEffectState,
} from "../../../agent/lib/runtime/safe-tool-errors";
import { NdjsonEncoderError } from "./ndjson-encoder";
import {
  CRECIENDO_ERROR_VERSION,
  CRECIENDO_EVENT_VERSION,
  SAFE_CHANNEL_ERROR_SCHEMA,
  parseChannelEvent,
  type ChannelEvent,
  type SafeChannelError,
} from "./types";

export type StreamFailurePhase = "before-headers" | "after-headers";

export type RetryDisposition = Readonly<{
  disposition: "retry-request" | "resume-stream" | "do-not-retry";
  afterSeconds: number | null;
  cursor: string | null;
}>;

type CommonStreamErrorContext = Readonly<{
  requestId: string;
  errorId: string;
  effectState: ToolEffectState;
  persistedSequence: number | null;
  persistedCursor: string | null;
  retryAfterSeconds: number | null;
}>;

export type PreStreamErrorContext = CommonStreamErrorContext;

export type InStreamErrorContext = CommonStreamErrorContext & Readonly<{
  eventId: string;
  sessionId: string;
  turnId: string;
  sequence: number;
  occurredAt: string;
  cursor: string;
}>;

type PreStreamError = Readonly<{
  phase: "before-headers";
  correlationId: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Readonly<{
    ok: false;
    requestId: string;
    error: SafeChannelError;
  }>;
  retry: RetryDisposition;
}>;

type InStreamError = Readonly<{
  phase: "after-headers";
  correlationId: string;
  event: ChannelEvent | null;
  retry: RetryDisposition;
}>;

export type SafeStreamError = PreStreamError | InStreamError;

type ClassifiedFailure = Readonly<{
  code: SafeChannelError["code"];
  status: number;
}>;

const SAFE_SOURCE_CODE = /^[A-Z][A-Z0-9_]{0,95}$/u;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TRANSIENT = new Set<SafeChannelError["code"]>([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PERSISTENCE_UNAVAILABLE",
  "TIMEOUT",
]);
const RESUMABLE = new Set<SafeChannelError["code"]>([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PERSISTENCE_UNAVAILABLE",
  "TIMEOUT",
  "INTERNAL_UNAVAILABLE",
]);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function descriptorCode(raw: unknown): string {
  try {
    if (isSafeToolError(raw)) return raw.code;
    if (raw instanceof NdjsonEncoderError) return raw.code;
    if (raw instanceof Error) {
      if (raw.name === "AbortError") return "ABORTED";
      const descriptor = Object.getOwnPropertyDescriptor(raw, "code");
      if (descriptor !== undefined && "value" in descriptor
        && typeof descriptor.value === "string" && SAFE_SOURCE_CODE.test(descriptor.value)) {
        return descriptor.value;
      }
      return SAFE_SOURCE_CODE.test(raw.message) ? raw.message : "UNKNOWN";
    }
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, "code");
      if (descriptor !== undefined && "value" in descriptor
        && typeof descriptor.value === "string" && SAFE_SOURCE_CODE.test(descriptor.value)) {
        return descriptor.value;
      }
    }
  } catch {
    return "UNKNOWN";
  }
  return "UNKNOWN";
}

function classify(raw: unknown): ClassifiedFailure {
  const source = descriptorCode(raw);
  if (["AUTHENTICATION_REQUIRED", "JWT_MISSING", "JWT_INVALID", "JWT_EXPIRED"].includes(source)) {
    return Object.freeze({ code: "AUTHENTICATION_REQUIRED", status: 401 });
  }
  if ([
    "ACCESS_DENIED",
    "FORBIDDEN",
    "SESSION_NOT_FOUND",
    "TOKEN_REVOKED",
    "CHILD_ACCESS_REVOKED",
    "AUTHORIZATION_EXPIRED",
    "SESSION_OWNER_MISMATCH",
  ].includes(source)) return Object.freeze({ code: "ACCESS_DENIED", status: 404 });
  if (["REQUEST_INVALID", "INPUT_INVALID", "INVALID_INPUT", "CURSOR_INVALID", "CURSOR_SIGNATURE_INVALID"].includes(source)) {
    return Object.freeze({ code: "REQUEST_INVALID", status: 400 });
  }
  if (source === "VERSION_UNSUPPORTED") return Object.freeze({ code: "VERSION_UNSUPPORTED", status: 409 });
  if (source === "RETENTION_GAP") return Object.freeze({ code: "RETENTION_GAP", status: 409 });
  if (source === "RATE_LIMITED") return Object.freeze({ code: "RATE_LIMITED", status: 429 });
  if (source === "CONFLICT" || source === "IDEMPOTENCY_CONFLICT") {
    return Object.freeze({ code: "CONFLICT", status: 409 });
  }
  if (source === "PROVIDER_UNAVAILABLE") return Object.freeze({ code: "PROVIDER_UNAVAILABLE", status: 503 });
  if (["PERSISTENCE_UNAVAILABLE", "STORAGE_UNAVAILABLE"].includes(source)) {
    return Object.freeze({ code: "PERSISTENCE_UNAVAILABLE", status: 503 });
  }
  if (source === "TIMEOUT" || source === "ETIMEDOUT" || source.endsWith("_TIMEOUT")) {
    return Object.freeze({ code: "TIMEOUT", status: 504 });
  }
  if (["CANCELLED", "ABORTED", "NDJSON_STREAM_ABORTED"].includes(source)) {
    return Object.freeze({ code: "CANCELLED", status: 409 });
  }
  return Object.freeze({ code: "INTERNAL_UNAVAILABLE", status: 503 });
}

function effectState(raw: unknown): ToolEffectState {
  return raw === "none" || raw === "committed" || raw === "unknown" ? raw : "unknown";
}

function retryDelay(raw: unknown, code: SafeChannelError["code"]): number | null {
  return code === "RATE_LIMITED"
    && typeof raw === "number"
    && Number.isSafeInteger(raw)
    && raw >= 1
    && raw <= 300
    ? raw
    : null;
}

function resumableContext(context: CommonStreamErrorContext, code: SafeChannelError["code"]): string | null {
  try {
    return context.effectState !== "unknown"
      && RESUMABLE.has(code)
      && typeof context.persistedSequence === "number"
      && Number.isSafeInteger(context.persistedSequence)
      && context.persistedSequence >= 0
      && typeof context.persistedCursor === "string"
      && context.persistedCursor.length >= 16
      && context.persistedCursor.length <= 4_096
      ? context.persistedCursor
      : null;
  } catch {
    return null;
  }
}

function safeError(
  classification: ClassifiedFailure,
  context: CommonStreamErrorContext,
): SafeChannelError {
  const effect = effectState(context.effectState);
  const retryable = effect === "none" && TRANSIENT.has(classification.code);
  const delay = retryable ? retryDelay(context.retryAfterSeconds, classification.code) : null;
  const candidate = {
    version: CRECIENDO_ERROR_VERSION,
    code: classification.code,
    retryable,
    retryAfterSeconds: delay,
    effectState: effect,
    resumable: resumableContext(context, classification.code) !== null,
  };
  const parsed = SAFE_CHANNEL_ERROR_SCHEMA.safeParse(candidate);
  if (parsed.success) return deepFreeze(parsed.data) as SafeChannelError;
  return deepFreeze({
    version: CRECIENDO_ERROR_VERSION,
    code: "INTERNAL_UNAVAILABLE",
    retryable: false,
    retryAfterSeconds: null,
    effectState: "unknown",
    resumable: false,
  }) as SafeChannelError;
}

function retryDisposition(
  phase: StreamFailurePhase,
  error: SafeChannelError,
  context: CommonStreamErrorContext,
): RetryDisposition {
  const cursor = error.resumable ? resumableContext(context, error.code) : null;
  if (cursor !== null) {
    return Object.freeze({ disposition: "resume-stream", afterSeconds: error.retryAfterSeconds, cursor });
  }
  if (phase === "before-headers" && error.retryable) {
    return Object.freeze({ disposition: "retry-request", afterSeconds: error.retryAfterSeconds, cursor: null });
  }
  return Object.freeze({ disposition: "do-not-retry", afterSeconds: null, cursor: null });
}

function safeRequestId(raw: unknown): string {
  return typeof raw === "string" && OPAQUE_ID.test(raw) ? raw : "request-unavailable";
}

function safeErrorId(raw: unknown): string {
  return typeof raw === "string" && UUID.test(raw) ? raw : "00000000-0000-4000-8000-000000000000";
}

export function mapPreStreamError(raw: unknown, context: PreStreamErrorContext): PreStreamError {
  const classification = classify(raw);
  const error = safeError(classification, context);
  const requestId = safeRequestId(context.requestId);
  const correlationId = safeErrorId(context.errorId);
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-error-id": correlationId,
    "x-request-id": requestId,
  };
  if (error.retryAfterSeconds !== null) headers["retry-after"] = String(error.retryAfterSeconds);
  return deepFreeze({
    phase: "before-headers" as const,
    correlationId,
    status: classification.status,
    headers,
    body: { ok: false as const, requestId, error },
    retry: retryDisposition("before-headers", error, context),
  }) as PreStreamError;
}

export function mapInStreamError(raw: unknown, context: InStreamErrorContext): InStreamError {
  const classification = classify(raw);
  const error = safeError(classification, context);
  const correlationId = safeErrorId(context.errorId);
  const retry = retryDisposition("after-headers", error, context);
  try {
    const event = parseChannelEvent({
      version: CRECIENDO_EVENT_VERSION,
      eventId: context.eventId,
      sessionId: context.sessionId,
      turnId: context.turnId,
      sequence: context.sequence,
      occurredAt: context.occurredAt,
      cursor: context.cursor,
      type: "stream-error",
      terminal: true,
      data: { error },
    });
    return deepFreeze({
      phase: "after-headers" as const,
      correlationId,
      event,
      retry,
    }) as InStreamError;
  } catch {
    return deepFreeze({
      phase: "after-headers" as const,
      correlationId,
      event: null,
      retry: Object.freeze({ disposition: "do-not-retry" as const, afterSeconds: null, cursor: null }),
    }) as InStreamError;
  }
}
