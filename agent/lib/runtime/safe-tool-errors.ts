import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";

import { TrustedToolContextError } from "./trusted-tool-context";
import { ToolIdempotencyError } from "./tool-idempotency";

const ERROR_VERSION = "safe-tool-error.v1" as const;
const DIAGNOSTICS_VERSION = "tool-error-diagnostics.v1" as const;
const SOURCE_CODE = /^[A-Z][A-Z0-9_]{0,95}$/u;

export const TOOL_ERROR_CODES = Object.freeze([
  "INPUT_INVALID",
  "RESOURCE_UNAVAILABLE",
  "CONFIRMATION_REQUIRED",
  "CONFIRMATION_INVALID",
  "IDEMPOTENCY_CONFLICT",
  "CLINICAL_POLICY_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "PERSISTENCE_UNAVAILABLE",
  "RATE_LIMITED",
  "TIMEOUT",
  "CANCELLED",
  "INTERNAL_UNAVAILABLE",
] as const);

export type ToolErrorCode = typeof TOOL_ERROR_CODES[number];
export type ToolEffectState = "none" | "committed" | "unknown";

export type SafeToolErrorPayload = Readonly<{
  kind: "tool_error";
  version: typeof ERROR_VERSION;
  code: ToolErrorCode;
  retryable: boolean;
  retryAfterSeconds: number | null;
}>;

export type PrivateToolErrorDiagnostics = Readonly<{
  schemaVersion: typeof DIAGNOSTICS_VERSION;
  causeClass:
    | "forbidden"
    | "not_found"
    | "input"
    | "confirmation"
    | "idempotency"
    | "clinical_policy"
    | "provider"
    | "persistence"
    | "rate_limit"
    | "timeout"
    | "cancelled"
    | "unknown";
  sourceCodeSha256: string;
  effectState: ToolEffectState;
  retryableBeforeEffect: boolean;
}>;

const SAFE_ERROR_BRAND: unique symbol = Symbol("SafeToolError");

export class SafeToolError extends Error {
  readonly code: ToolErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly [SAFE_ERROR_BRAND] = true;

  private constructor(code: ToolErrorCode, retryable: boolean, retryAfterSeconds: number | null) {
    super(code);
    this.name = "SafeToolError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  static create(code: ToolErrorCode, retryable: boolean, retryAfterSeconds: number | null): SafeToolError {
    return new SafeToolError(code, retryable, retryAfterSeconds);
  }

  toJSON(): SafeToolErrorPayload {
    return Object.freeze({
      kind: "tool_error",
      version: ERROR_VERSION,
      code: this.code,
      retryable: this.retryable,
      retryAfterSeconds: this.retryAfterSeconds,
    });
  }
}

type PrivateCauseRecord = Readonly<{
  cause: unknown;
  diagnostics: PrivateToolErrorDiagnostics;
}>;

const PRIVATE_CAUSES = new WeakMap<SafeToolError, PrivateCauseRecord>();

type MappingOptions = Readonly<{
  effectState?: ToolEffectState;
  retryAfterSeconds?: unknown;
}>;

type CauseClassification = Readonly<{
  code: ToolErrorCode;
  causeClass: PrivateToolErrorDiagnostics["causeClass"];
  sourceCode: string;
}>;

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function sourceCodeOf(error: unknown): string {
  try {
    if (error instanceof ToolIdempotencyError || error instanceof TrustedToolContextError) return error.code;
    if (error instanceof Error) {
      const coded = error as Error & Readonly<{ code?: unknown }>;
      if (typeof coded.code === "string" && SOURCE_CODE.test(coded.code)) return coded.code;
      if (SOURCE_CODE.test(error.message)) return error.message;
      if (error.name === "AbortError") return "ABORTED";
      return "UNKNOWN";
    }
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const code = (error as Readonly<Record<string, unknown>>).code;
      return typeof code === "string" && SOURCE_CODE.test(code) ? code : "UNKNOWN";
    }
  } catch {
    return "UNKNOWN";
  }
  return "UNKNOWN";
}

function classifySource(sourceCode: string): CauseClassification {
  if (sourceCode === "CONFIRMATION_REQUIRED" || sourceCode === "TOOL_APPROVAL_REQUIRED") {
    return Object.freeze({ code: "CONFIRMATION_REQUIRED", causeClass: "confirmation", sourceCode });
  }
  if (/^(?:CONFIRMATION_(?:INVALID|DRIFT|MISMATCH)|PREVIEW_DRIFT|TOOL_APPROVAL_DENIED)$/u.test(sourceCode)) {
    return Object.freeze({ code: "CONFIRMATION_INVALID", causeClass: "confirmation", sourceCode });
  }
  if (/IDEMPOTENCY_CONFLICT$/u.test(sourceCode) || sourceCode === "SUPERSESSION_CONFLICT") {
    return Object.freeze({ code: "IDEMPOTENCY_CONFLICT", causeClass: "idempotency", sourceCode });
  }
  if (sourceCode === "TOOL_IDEMPOTENCY_CANCELLED"
    || sourceCode === "TOOL_CONTEXT_CANCELLED"
    || sourceCode === "TOOL_AUDIT_CANCELLED"
    || sourceCode === "CANCELLED"
    || sourceCode === "ABORTED") {
    return Object.freeze({ code: "CANCELLED", causeClass: "cancelled", sourceCode });
  }
  if (sourceCode === "TIMEOUT" || sourceCode === "ETIMEDOUT" || sourceCode.endsWith("_TIMEOUT")) {
    return Object.freeze({ code: "TIMEOUT", causeClass: "timeout", sourceCode });
  }
  if (sourceCode === "RATE_LIMITED" || sourceCode === "TOO_MANY_REQUESTS") {
    return Object.freeze({ code: "RATE_LIMITED", causeClass: "rate_limit", sourceCode });
  }
  if (sourceCode.endsWith("_NOT_FOUND") || sourceCode === "NOT_FOUND" || sourceCode === "DOCUMENT_UNAVAILABLE") {
    return Object.freeze({ code: "RESOURCE_UNAVAILABLE", causeClass: "not_found", sourceCode });
  }
  if (sourceCode === "ACCESS_DENIED"
    || sourceCode === "NOT_AUTHORIZED"
    || sourceCode === "AUTHENTICATION_FAILED"
    || sourceCode === "TOOL_IDEMPOTENCY_DENIED"
    || sourceCode === "TOOL_AUDIT_DENIED"
    || sourceCode === "TOOL_CONTEXT_EXPIRED"
    || sourceCode.endsWith("_SCOPE_DENIED")
    || sourceCode === "FORBIDDEN") {
    return Object.freeze({ code: "RESOURCE_UNAVAILABLE", causeClass: "forbidden", sourceCode });
  }
  if (sourceCode === "RULE_UNAVAILABLE"
    || sourceCode === "RULE_PACK_UNAVAILABLE"
    || sourceCode === "PACKAGE_UNAVAILABLE"
    || sourceCode === "POLICY_UNAVAILABLE"
    || sourceCode === "APPROVED_PACKAGE_UNAVAILABLE") {
    return Object.freeze({ code: "CLINICAL_POLICY_UNAVAILABLE", causeClass: "clinical_policy", sourceCode });
  }
  if (sourceCode === "PROVIDER_UNAVAILABLE") {
    return Object.freeze({ code: "PROVIDER_UNAVAILABLE", causeClass: "provider", sourceCode });
  }
  if (sourceCode === "STORAGE_UNAVAILABLE"
    || sourceCode === "PERSISTENCE_UNAVAILABLE"
    || sourceCode === "CLOUD_PERSISTENCE_ERROR"
    || sourceCode === "PROVIDER_PERSISTENCE_ERROR"
    || sourceCode === "TOOL_IDEMPOTENCY_UNAVAILABLE"
    || sourceCode === "TOOL_AUDIT_UNAVAILABLE") {
    return Object.freeze({ code: "PERSISTENCE_UNAVAILABLE", causeClass: "persistence", sourceCode });
  }
  if (sourceCode === "INVALID_INPUT"
    || sourceCode === "INVALID_REQUEST"
    || sourceCode === "INVALID_OBSERVATION"
    || sourceCode === "VALIDATION_FAILED"
    || sourceCode === "INPUT_INVALID") {
    return Object.freeze({ code: "INPUT_INVALID", causeClass: "input", sourceCode });
  }
  if (sourceCode === "TOOL_CONTEXT_INVALID" || sourceCode === "TRUSTED_TOOL_CONTEXT_INVALID") {
    return Object.freeze({ code: "RESOURCE_UNAVAILABLE", causeClass: "forbidden", sourceCode });
  }
  return Object.freeze({ code: "INTERNAL_UNAVAILABLE", causeClass: "unknown", sourceCode: "UNKNOWN" });
}

function parseOptions(raw: MappingOptions | undefined): Readonly<{
  effectState: ToolEffectState;
  retryAfterSeconds: number | null;
}> {
  const fallback = Object.freeze({ effectState: "unknown" as const, retryAfterSeconds: null });
  if (raw === undefined) return fallback;
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || Object.keys(raw).some((key) => key !== "effectState" && key !== "retryAfterSeconds")
      || (raw.effectState !== undefined && !["none", "committed", "unknown"].includes(raw.effectState))) {
      return fallback;
    }
    const retryAfterSeconds = Number.isSafeInteger(raw.retryAfterSeconds)
      && (raw.retryAfterSeconds as number) >= 1
      && (raw.retryAfterSeconds as number) <= 300
      ? raw.retryAfterSeconds as number
      : null;
    return Object.freeze({ effectState: raw.effectState ?? "unknown", retryAfterSeconds });
  } catch {
    return fallback;
  }
}

function transient(code: ToolErrorCode): boolean {
  return code === "PROVIDER_UNAVAILABLE"
    || code === "PERSISTENCE_UNAVAILABLE"
    || code === "RATE_LIMITED"
    || code === "TIMEOUT";
}

export function mapToolError(error: unknown, rawOptions?: MappingOptions): SafeToolError {
  if (isSafeToolError(error)) return error;
  const options = parseOptions(rawOptions);
  const classification = classifySource(sourceCodeOf(error));
  const retryable = options.effectState === "none" && transient(classification.code);
  const retryAfterSeconds = retryable && classification.code === "RATE_LIMITED"
    ? options.retryAfterSeconds
    : null;
  const safe = SafeToolError.create(classification.code, retryable, retryAfterSeconds);
  const diagnostics: PrivateToolErrorDiagnostics = Object.freeze({
    schemaVersion: DIAGNOSTICS_VERSION,
    causeClass: classification.causeClass,
    sourceCodeSha256: hash({
      domain: "tool-error-source-code.v1",
      sourceCode: classification.sourceCode,
    }),
    effectState: options.effectState,
    retryableBeforeEffect: retryable,
  });
  PRIVATE_CAUSES.set(safe, Object.freeze({ cause: error, diagnostics }));
  return Object.freeze(safe);
}

export function isSafeToolError(value: unknown): value is SafeToolError {
  try {
    return value instanceof SafeToolError && PRIVATE_CAUSES.has(value);
  } catch {
    return false;
  }
}

export function isRetryableBeforeEffect(value: unknown): boolean {
  if (!isSafeToolError(value)) return false;
  const record = PRIVATE_CAUSES.get(value);
  return record?.diagnostics.effectState === "none"
    && record.diagnostics.retryableBeforeEffect
    && value.retryable;
}

export function getPrivateToolErrorDiagnostics(value: unknown): PrivateToolErrorDiagnostics | null {
  return isSafeToolError(value) ? PRIVATE_CAUSES.get(value)?.diagnostics ?? null : null;
}
