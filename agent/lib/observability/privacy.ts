export const SAFE_RUNTIME_CONTEXT_KEYS = [
  "agent.correlation_id",
  "agent.provider_route",
  "agent.channel_kind",
  "agent.tool_name",
  "agent.tool_status",
  "agent.failure_class",
  "agent.safety_mode",
] as const;

export type SafeRuntimeContextKey = (typeof SAFE_RUNTIME_CONTEXT_KEYS)[number];

type SafeRuntimeContextValue = string;
export type SafeRuntimeContext = Partial<
  Record<SafeRuntimeContextKey, SafeRuntimeContextValue>
>;

const SAFE_RUNTIME_CONTEXT_KEY_SET = new Set<string>(
  SAFE_RUNTIME_CONTEXT_KEYS,
);
const MAX_SAFE_VALUE_LENGTH = 64;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9._:/-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeSafeValue(key: SafeRuntimeContextKey, value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`Unsafe runtime context value for ${key}`);
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_SAFE_VALUE_LENGTH ||
    !SAFE_VALUE_PATTERN.test(normalized)
  ) {
    throw new Error(`Unsafe runtime context value for ${key}`);
  }

  return normalized;
}

export function normalizeSafeRuntimeContext(
  value: Record<string, unknown>,
): SafeRuntimeContext {
  if (!isRecord(value)) {
    throw new Error("Runtime context must be a plain object");
  }

  const normalized: SafeRuntimeContext = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (!SAFE_RUNTIME_CONTEXT_KEY_SET.has(rawKey)) {
      throw new Error("Unsafe runtime context key");
    }

    const key = rawKey as SafeRuntimeContextKey;
    normalized[key] = normalizeSafeValue(key, rawValue);
  }

  return normalized;
}

export function assertSafeRuntimeContext(value: Record<string, unknown>): void {
  normalizeSafeRuntimeContext(value);
}
