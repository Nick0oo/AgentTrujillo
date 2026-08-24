import {
  EVE_EVENT_KIND_REGISTRY,
  type EveEventKind,
} from "./eve-event-mapper";

export type EveEventExposure =
  | "public-text"
  | "trusted-projection-reference"
  | "failure-signal"
  | "turn-boundary"
  | "private";

export const SAFE_EVE_EVENT_KIND_ALLOWLIST = Object.freeze({
  "message.appended": "public-text",
  "actions.requested": "trusted-projection-reference",
  "action.result": "trusted-projection-reference",
  "step.failed": "failure-signal",
  "turn.failed": "failure-signal",
  "session.failed": "failure-signal",
  "turn.completed": "turn-boundary",
} as const satisfies Partial<Readonly<Record<EveEventKind, Exclude<EveEventExposure, "private">>>>);

export type SuppressionReason = "private-event" | "unknown-event" | "unsafe-payload";

export type SuppressionMetric = Readonly<{
  metric: "creciendo_eve_event_suppressed_total";
  eveKind: EveEventKind | "unknown";
  reason: SuppressionReason;
  count: 1;
}>;

export type SuppressionMetricSink = (metric: SuppressionMetric) => void;

export type SuppressionCounterSnapshot = Readonly<{
  total: number;
  byKind: Readonly<Record<string, number>>;
  byReason: Readonly<Record<string, number>>;
}>;

export type SuppressionCounters = Readonly<{
  record(metric: SuppressionMetric): void;
  snapshot(): SuppressionCounterSnapshot;
}>;

export type SuppressionOptions = Readonly<{
  debug?: boolean;
}>;

export type SuppressionDecision =
  | Readonly<{
    disposition: "allow";
    exposure: Exclude<EveEventExposure, "private">;
    event: unknown;
  }>
  | Readonly<{
    disposition: "suppress";
    reason: "private-event" | "unknown-event";
    telemetry: SuppressionMetric;
  }>
  | Readonly<{
    disposition: "fail_closed";
    code: "UNSAFE_EVE_EVENT";
    telemetry: SuppressionMetric;
  }>;

const SENSITIVE_KEYS = new Set([
  "analysis",
  "apikey",
  "arguments",
  "base64",
  "blob",
  "cause",
  "chainofthought",
  "credential",
  "credentials",
  "debug",
  "debugtrace",
  "developerinstructions",
  "developerprompt",
  "encoded",
  "encodedpayload",
  "hiddenreasoning",
  "instruction",
  "instructions",
  "internalreasoning",
  "metadata",
  "modelprompt",
  "payload",
  "prompt",
  "providerframe",
  "providermetadata",
  "providerresponse",
  "raw",
  "rawresult",
  "rawtoolresult",
  "reasoning",
  "reasoningdelta",
  "reasoningsofar",
  "secret",
  "secrets",
  "stack",
  "systeminstructions",
  "systemprompt",
  "thoughtprocess",
  "token",
  "toolarguments",
  "toolargs",
  "toolinput",
  "tooloutput",
  "toolresult",
  "trace",
]);
const MAX_SCAN_NODES = 4_096;
const MAX_SCAN_DEPTH = 32;
const MAX_SCANNED_STRING_BYTES = 320 * 1_024;
const encoder = new TextEncoder();

export class ReasoningPayloadError extends Error {
  readonly code = "UNSAFE_INTERNAL_PAYLOAD" as const;

  constructor() {
    super("UNSAFE_INTERNAL_PAYLOAD");
    this.name = "ReasoningPayloadError";
  }
}

function failPayload(): never {
  throw new ReasoningPayloadError();
}

function normalizedKey(key: string): string {
  return key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function isSensitiveTag(key: string, value: unknown): boolean {
  const normalized = normalizedKey(key);
  if ((normalized !== "type" && normalized !== "kind" && normalized !== "contenttype")
    || typeof value !== "string") return false;
  const tag = normalizedKey(value);
  return [
    "reasoning",
    "chainofthought",
    "providerframe",
    "systemprompt",
    "toolarguments",
    "rawtool",
  ].some((forbidden) => tag.includes(forbidden));
}

function plainRecord(raw: unknown): Readonly<Record<string, unknown>> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(raw);
  if (keys.some((key) => typeof key !== "string")) return null;
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (descriptor === undefined
      || !descriptor.enumerable
      || !("value" in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined) return null;
  }
  return raw as Readonly<Record<string, unknown>>;
}

function exactKeys(record: Readonly<Record<string, unknown>>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function safeTurnId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 200;
}

function knownKind(raw: unknown): EveEventKind | null {
  try {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const prototype = Object.getPrototypeOf(raw);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptor = Object.getOwnPropertyDescriptor(raw, "type");
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "string") return null;
    return Object.prototype.hasOwnProperty.call(EVE_EVENT_KIND_REGISTRY, descriptor.value)
      ? descriptor.value as EveEventKind
      : null;
  } catch {
    return null;
  }
}

export function classifyEveEventExposure(raw: unknown): EveEventExposure {
  const kind = knownKind(raw);
  if (kind === null) return "private";
  return Object.prototype.hasOwnProperty.call(SAFE_EVE_EVENT_KIND_ALLOWLIST, kind)
    ? SAFE_EVE_EVENT_KIND_ALLOWLIST[kind as keyof typeof SAFE_EVE_EVENT_KIND_ALLOWLIST]
    : "private";
}

export function assertNoReasoningPayload(raw: unknown): void {
  const pending: Array<Readonly<{ value: unknown; depth: number }>> = [{ value: raw, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > MAX_SCAN_NODES || current.depth > MAX_SCAN_DEPTH) failPayload();
    const { value } = current;
    if (typeof value === "string") {
      if (encoder.encode(value).byteLength > MAX_SCANNED_STRING_BYTES) failPayload();
      continue;
    }
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) failPayload();
      continue;
    }
    if (typeof value !== "object") failPayload();
    if (seen.has(value)) failPayload();
    seen.add(value);

    if (Array.isArray(value)) {
      if (value.length > MAX_SCAN_NODES) failPayload();
      for (const child of value) pending.push({ value: child, depth: current.depth + 1 });
      continue;
    }

    const record = plainRecord(value);
    if (record === null) failPayload();
    for (const [key, child] of Object.entries(record)) {
      if (SENSITIVE_KEYS.has(normalizedKey(key)) || isSensitiveTag(key, child)) failPayload();
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
}

export function createSuppressionCounters(): SuppressionCounters {
  let total = 0;
  const byKind = new Map<string, number>();
  const byReason = new Map<string, number>();
  return Object.freeze({
    record(metric: SuppressionMetric) {
      total += 1;
      byKind.set(metric.eveKind, (byKind.get(metric.eveKind) ?? 0) + 1);
      byReason.set(metric.reason, (byReason.get(metric.reason) ?? 0) + 1);
    },
    snapshot() {
      return Object.freeze({
        total,
        byKind: Object.freeze(Object.fromEntries([...byKind.entries()].sort())),
        byReason: Object.freeze(Object.fromEntries([...byReason.entries()].sort())),
      });
    },
  });
}

function metric(kind: EveEventKind | null, reason: SuppressionReason): SuppressionMetric {
  return Object.freeze({
    metric: "creciendo_eve_event_suppressed_total" as const,
    eveKind: kind ?? "unknown",
    reason,
    count: 1 as const,
  });
}

function recordSuppression(
  counters: SuppressionCounters,
  sink: SuppressionMetricSink | undefined,
  kind: EveEventKind | null,
  reason: SuppressionReason,
): SuppressionMetric {
  const value = metric(kind, reason);
  counters.record(value);
  try {
    sink?.(value);
  } catch {
    // Observability cannot weaken or interrupt the suppression boundary.
  }
  return value;
}

function unsafe(
  counters: SuppressionCounters,
  sink: SuppressionMetricSink | undefined,
  kind: EveEventKind | null,
): SuppressionDecision {
  return Object.freeze({
    disposition: "fail_closed" as const,
    code: "UNSAFE_EVE_EVENT" as const,
    telemetry: recordSuppression(counters, sink, kind, "unsafe-payload"),
  });
}

function minimalTurnData(raw: unknown, withStep: boolean): Readonly<Record<string, unknown>> | null {
  const event = plainRecord(raw);
  const data = event === null ? null : plainRecord(event.data);
  if (event === null || data === null || !exactKeys(event, ["type", "data", ...(event.meta === undefined ? [] : ["meta"])])) {
    return null;
  }
  if (!safeInteger(data.sequence) || !safeTurnId(data.turnId)) return null;
  if (withStep && !safeInteger(data.stepIndex)) return null;
  return withStep
    ? Object.freeze({ sequence: data.sequence, stepIndex: data.stepIndex, turnId: data.turnId })
    : Object.freeze({ sequence: data.sequence, turnId: data.turnId });
}

function sanitizedEvent(
  raw: unknown,
  kind: EveEventKind,
  exposure: Exclude<EveEventExposure, "private">,
): unknown | null {
  const event = plainRecord(raw);
  if (event === null) return null;

  if (exposure === "failure-signal") {
    if (!exactKeys(event, ["type", "data", ...(event.meta === undefined ? [] : ["meta"])])) return null;
    if (plainRecord(event.data) === null) return null;
    return Object.freeze({ type: kind, data: Object.freeze({}) });
  }

  if (exposure === "turn-boundary") {
    const data = minimalTurnData(raw, false);
    return data === null ? null : Object.freeze({ type: kind, data });
  }

  if (exposure === "trusted-projection-reference") {
    const data = plainRecord(event.data);
    const expected = kind === "actions.requested"
      ? ["actions", "sequence", "stepIndex", "turnId"]
      : ["error", "result", "sequence", "stepIndex", "status", "turnId"];
    if (data === null || !exactKeys(data, expected)) return null;
    const minimal = minimalTurnData(raw, true);
    return minimal === null ? null : Object.freeze({ type: kind, data: minimal });
  }

  const data = plainRecord(event.data);
  if (data === null
    || !exactKeys(data, ["messageDelta", "messageSoFar", "sequence", "stepIndex", "turnId"])
    || typeof data.messageDelta !== "string"
    || typeof data.messageSoFar !== "string") return null;
  const minimal = minimalTurnData(raw, true);
  if (minimal === null) return null;
  return Object.freeze({
    type: kind,
    data: Object.freeze({
      messageDelta: data.messageDelta,
      messageSoFar: "",
      sequence: minimal.sequence,
      stepIndex: minimal.stepIndex,
      turnId: minimal.turnId,
    }),
  });
}

export function suppressUnsafeEveEvent(
  raw: unknown,
  counters: SuppressionCounters,
  sink?: SuppressionMetricSink,
  options: SuppressionOptions = {},
): SuppressionDecision {
  void options.debug;
  const kind = knownKind(raw);
  if (kind === null) {
    const telemetry = recordSuppression(counters, sink, null, "unknown-event");
    return Object.freeze({ disposition: "suppress" as const, reason: "unknown-event" as const, telemetry });
  }
  const exposure = classifyEveEventExposure(raw);
  if (exposure === "private") {
    const telemetry = recordSuppression(counters, sink, kind, "private-event");
    return Object.freeze({ disposition: "suppress" as const, reason: "private-event" as const, telemetry });
  }

  try {
    const event = sanitizedEvent(raw, kind, exposure);
    if (event === null) return unsafe(counters, sink, kind);
    assertNoReasoningPayload(event);
    return Object.freeze({ disposition: "allow" as const, exposure, event });
  } catch {
    return unsafe(counters, sink, kind);
  }
}
