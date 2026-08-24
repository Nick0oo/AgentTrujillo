import type { HandleMessageStreamEvent } from "eve/client";

import { parseWidgetEnvelope, type WidgetEnvelope } from "../../presentation/widget-registry";
import {
  CRECIENDO_EVENT_VERSION,
  parseChannelEvent,
  type ChannelEvent,
} from "./types";

export type EveEventKind = HandleMessageStreamEvent["type"];

type EventMappingPolicy =
  | "map-text"
  | "map-trusted-projection"
  | "map-completion"
  | "fail-closed-error"
  | "drop-sensitive"
  | "drop-internal"
  | "drop-nonterminal";

/** Binding event union from installed Eve 0.27.13. A framework upgrade must update this table. */
export const EVE_EVENT_KIND_REGISTRY = Object.freeze({
  "session.started": "drop-internal",
  "turn.started": "drop-internal",
  "message.received": "drop-sensitive",
  "actions.requested": "map-trusted-projection",
  "input.requested": "drop-sensitive",
  "action.result": "map-trusted-projection",
  "subagent.called": "drop-sensitive",
  "subagent.started": "drop-sensitive",
  "subagent.event": "drop-sensitive",
  "subagent.completed": "drop-sensitive",
  "message.appended": "map-text",
  "reasoning.appended": "drop-sensitive",
  "message.completed": "drop-nonterminal",
  "reasoning.completed": "drop-sensitive",
  "result.completed": "drop-sensitive",
  "step.started": "drop-internal",
  "step.completed": "drop-sensitive",
  "step.failed": "fail-closed-error",
  "turn.completed": "map-completion",
  "turn.failed": "fail-closed-error",
  "turn.cancelled": "drop-nonterminal",
  "compaction.requested": "drop-sensitive",
  "compaction.completed": "drop-sensitive",
  "authorization.required": "drop-sensitive",
  "authorization.completed": "drop-sensitive",
  "session.waiting": "drop-sensitive",
  "session.failed": "fail-closed-error",
  "session.completed": "drop-nonterminal",
} as const satisfies Readonly<Record<EveEventKind, EventMappingPolicy>>);

export type TrustedMobileProjection =
  | Readonly<{ kind: "widget"; widget: unknown }>
  | Readonly<{
    kind: "citation";
    citationId: string;
    label: string;
    href: string;
  }>;

export type TrustedProjectionReference = Readonly<{
  sourceEventId: string;
  eveKind: "actions.requested" | "action.result";
  eveSequence: number;
  expectedEveTurnId: string;
}>;

/**
 * Resolves a server-owned projection by source identity. The raw Eve action/result is deliberately
 * absent so an implementation cannot accidentally promote tool/model payloads to the mobile wire.
 */
export type TrustedMobileProjectionRegistry = Readonly<{
  resolveTrustedProjection(reference: TrustedProjectionReference): TrustedMobileProjection | null;
}>;

export type EveEventMappingContext = Readonly<{
  eventId: string;
  sessionId: string;
  turnId: string;
  messageId: string;
  sequence: number;
  occurredAt: string;
  cursor: string;
  sourceEventId: string;
  expectedEveTurnId: string;
  effectState: "none" | "committed" | "unknown";
  completionOutcome: "completed" | "abstained";
  terminalAlreadyEmitted: boolean;
  seenSourceEventIds: ReadonlySet<string>;
  supportedWidgetVersions: ReadonlySet<string>;
}>;

type MappingFailureCode =
  | "UNKNOWN_EVE_EVENT"
  | "SOURCE_EVENT_INVALID"
  | "DUPLICATE_SOURCE_EVENT"
  | "EVENT_AFTER_TERMINAL"
  | "EVE_EVENT_INVALID"
  | "EVE_TURN_MISMATCH"
  | "EVE_FAILURE"
  | "TRUSTED_PROJECTION_UNAVAILABLE"
  | "TRUSTED_PROJECTION_INVALID"
  | "WIDGET_VERSION_UNSUPPORTED"
  | "EVE_EMERGENCY_FORBIDDEN"
  | "CHANNEL_EVENT_INVALID";

type DropReason =
  | "internal-lifecycle-event"
  | "sensitive-internal-event"
  | "untrusted-tool-payload"
  | "untrusted-model-result"
  | "empty-text-delta"
  | "duplicate-message-boundary"
  | "duplicate-lifecycle-boundary"
  | "public-cancel-ledger-owned";

type MappingSource = Readonly<{
  eventId: string;
  eveKind: EveEventKind;
  eveSequence: number | null;
}>;

type MappingTelemetry = Readonly<{
  code: MappingFailureCode;
  eveKind: EveEventKind | "unknown";
}>;

export type MappingDisposition =
  | Readonly<{
    disposition: "emit";
    source: MappingSource;
    event: ChannelEvent;
  }>
  | Readonly<{
    disposition: "drop";
    source: MappingSource;
    reason: DropReason;
  }>
  | Readonly<{
    disposition: "fail_closed";
    code: MappingFailureCode;
    closeStream: true;
    telemetry: MappingTelemetry;
  }>;

const SOURCE_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const MAX_EMERGENCY_SCAN_NODES = 256;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isKnownKind(value: unknown): value is EveEventKind {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(EVE_EVENT_KIND_REGISTRY, value);
}

function eventKind(raw: unknown): EveEventKind | null {
  if (!isRecord(raw) || !isKnownKind(raw.type)) return null;
  return raw.type;
}

function eventData(raw: unknown): Readonly<Record<string, unknown>> | null {
  if (!isRecord(raw) || !isRecord(raw.data)) return null;
  return raw.data;
}

function isSequence(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function readSequence(raw: unknown): number | null {
  const data = eventData(raw);
  return data !== null && isSequence(data.sequence) ? data.sequence : null;
}

function source(context: EveEventMappingContext, kind: EveEventKind, sequence: number | null): MappingSource {
  return Object.freeze({ eventId: context.sourceEventId, eveKind: kind, eveSequence: sequence });
}

function fail(kind: EveEventKind | null, code: MappingFailureCode): MappingDisposition {
  return Object.freeze({
    disposition: "fail_closed" as const,
    code,
    closeStream: true as const,
    telemetry: Object.freeze({ code, eveKind: kind ?? "unknown" }),
  });
}

function drop(
  context: EveEventMappingContext,
  kind: EveEventKind,
  sequence: number | null,
  reason: DropReason,
): MappingDisposition {
  return Object.freeze({
    disposition: "drop" as const,
    source: source(context, kind, sequence),
    reason,
  });
}

function emit(
  rawEvent: unknown,
  context: EveEventMappingContext,
  kind: EveEventKind,
  candidate: unknown,
): MappingDisposition {
  try {
    const event = parseChannelEvent(candidate);
    return Object.freeze({
      disposition: "emit" as const,
      source: source(context, kind, readSequence(rawEvent)),
      event,
    });
  } catch {
    return fail(kind, "CHANNEL_EVENT_INVALID");
  }
}

function publicEventBase(context: EveEventMappingContext) {
  return {
    version: CRECIENDO_EVENT_VERSION,
    eventId: context.eventId,
    sessionId: context.sessionId,
    turnId: context.turnId,
    sequence: context.sequence,
    occurredAt: context.occurredAt,
    cursor: context.cursor,
  } as const;
}

function turnBoundData(raw: unknown, requireStep: boolean): Readonly<{
  sequence: number;
  stepIndex: number | null;
}> | null {
  const data = eventData(raw);
  if (data === null
    || !isSequence(data.sequence)
    || typeof data.turnId !== "string") return null;
  if (!requireStep) return { sequence: data.sequence, stepIndex: null };
  if (!isSequence(data.stepIndex)) return null;
  return { sequence: data.sequence, stepIndex: data.stepIndex };
}

function matchesExpectedTurn(raw: unknown, context: EveEventMappingContext): boolean {
  const data = eventData(raw);
  return data !== null
    && typeof data.turnId === "string"
    && data.turnId === context.expectedEveTurnId;
}

function containsEmergencyKind(raw: unknown): boolean {
  const pending: unknown[] = [raw];
  const seen = new Set<object>();
  let visited = 0;
  while (pending.length > 0 && visited < MAX_EMERGENCY_SCAN_NODES) {
    const value = pending.pop();
    visited += 1;
    if (!isRecord(value) && !Array.isArray(value)) continue;
    if (seen.has(value as object)) continue;
    seen.add(value as object);
    if (isRecord(value) && value.kind === "emergency_recommendation") return true;
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) pending.push(child);
  }
  return false;
}

function mapText(raw: unknown, context: EveEventMappingContext): MappingDisposition {
  const kind = "message.appended" as const;
  const data = eventData(raw);
  if (turnBoundData(raw, true) === null || data === null) return fail(kind, "EVE_EVENT_INVALID");
  if (!matchesExpectedTurn(raw, context)) return fail(kind, "EVE_TURN_MISMATCH");
  if (typeof data.messageDelta !== "string") return fail(kind, "EVE_EVENT_INVALID");
  if (data.messageDelta.length === 0) {
    return drop(context, kind, data.sequence as number, "empty-text-delta");
  }
  return emit(raw, context, kind, {
    ...publicEventBase(context),
    type: "text-delta",
    terminal: false,
    data: { text: data.messageDelta },
  });
}

function mapCompletion(raw: unknown, context: EveEventMappingContext): MappingDisposition {
  const kind = "turn.completed" as const;
  if (turnBoundData(raw, false) === null) return fail(kind, "EVE_EVENT_INVALID");
  if (!matchesExpectedTurn(raw, context)) return fail(kind, "EVE_TURN_MISMATCH");
  return emit(raw, context, kind, {
    ...publicEventBase(context),
    type: "message-complete",
    terminal: true,
    data: {
      messageId: context.messageId,
      outcome: context.completionOutcome,
      effectState: context.effectState,
    },
  });
}

function mapProjection(
  raw: unknown,
  context: EveEventMappingContext,
  registry: TrustedMobileProjectionRegistry,
  kind: "actions.requested" | "action.result",
): MappingDisposition {
  const binding = turnBoundData(raw, true);
  if (binding === null) return fail(kind, "EVE_EVENT_INVALID");
  if (!matchesExpectedTurn(raw, context)) return fail(kind, "EVE_TURN_MISMATCH");
  if (containsEmergencyKind(raw)) return fail(kind, "EVE_EMERGENCY_FORBIDDEN");

  let projection: TrustedMobileProjection | null;
  try {
    projection = registry.resolveTrustedProjection(Object.freeze({
      sourceEventId: context.sourceEventId,
      eveKind: kind,
      eveSequence: binding.sequence,
      expectedEveTurnId: context.expectedEveTurnId,
    }));
  } catch {
    return fail(kind, "TRUSTED_PROJECTION_UNAVAILABLE");
  }
  if (projection === null) {
    return drop(context, kind, binding.sequence, "untrusted-tool-payload");
  }
  if (!isRecord(projection) || (projection.kind !== "widget" && projection.kind !== "citation")) {
    return fail(kind, "TRUSTED_PROJECTION_INVALID");
  }

  if (projection.kind === "widget") {
    let widget: WidgetEnvelope;
    try {
      widget = parseWidgetEnvelope(projection.widget);
    } catch {
      return fail(kind, "TRUSTED_PROJECTION_INVALID");
    }
    if (widget.kind === "emergency_recommendation") {
      return fail(kind, "EVE_EMERGENCY_FORBIDDEN");
    }
    if (!context.supportedWidgetVersions.has(widget.version)) {
      return fail(kind, "WIDGET_VERSION_UNSUPPORTED");
    }
    const type = widget.kind === "tool_state" ? "tool-state" : "ui-part";
    const mapped = emit(raw, context, kind, {
      ...publicEventBase(context),
      type,
      terminal: false,
      data: { widget },
    });
    return mapped.disposition === "fail_closed"
      ? fail(kind, "TRUSTED_PROJECTION_INVALID")
      : mapped;
  }

  const mapped = emit(raw, context, kind, {
    ...publicEventBase(context),
    type: "citation",
    terminal: false,
    data: {
      citationId: projection.citationId,
      label: projection.label,
      href: projection.href,
    },
  });
  return mapped.disposition === "fail_closed"
    ? fail(kind, "TRUSTED_PROJECTION_INVALID")
    : mapped;
}

function dropReason(kind: EveEventKind): DropReason {
  if (kind === "turn.cancelled") return "public-cancel-ledger-owned";
  if (kind === "session.completed") return "duplicate-lifecycle-boundary";
  if (kind === "message.completed") return "duplicate-message-boundary";
  return EVE_EVENT_KIND_REGISTRY[kind] === "drop-sensitive"
    ? "sensitive-internal-event"
    : "internal-lifecycle-event";
}

/**
 * Maps one Eve event without consulting authority, persistence, or raw tool output. Callers must
 * authorize and allocate the immutable public ledger identity before invoking this pure boundary.
 */
export function mapEveEvent(
  rawEvent: unknown,
  context: EveEventMappingContext,
  registry: TrustedMobileProjectionRegistry,
): MappingDisposition {
  let kind: EveEventKind | null = null;
  try {
    kind = eventKind(rawEvent);
    if (kind === null) return fail(null, "UNKNOWN_EVE_EVENT");
    if (!SOURCE_EVENT_ID.test(context.sourceEventId)) return fail(kind, "SOURCE_EVENT_INVALID");
    if (context.seenSourceEventIds.has(context.sourceEventId)) {
      return fail(kind, "DUPLICATE_SOURCE_EVENT");
    }
    if (context.terminalAlreadyEmitted) return fail(kind, "EVENT_AFTER_TERMINAL");

    const policy = EVE_EVENT_KIND_REGISTRY[kind];
    if (policy === "map-text") return mapText(rawEvent, context);
    if (policy === "map-completion") return mapCompletion(rawEvent, context);
    if (policy === "map-trusted-projection") {
      if (kind !== "actions.requested" && kind !== "action.result") {
        return fail(kind, "EVE_EVENT_INVALID");
      }
      return mapProjection(rawEvent, context, registry, kind);
    }
    if (policy === "fail-closed-error") return fail(kind, "EVE_FAILURE");
    if (kind === "result.completed") {
      if (containsEmergencyKind(rawEvent)) return fail(kind, "EVE_EMERGENCY_FORBIDDEN");
      return drop(context, kind, readSequence(rawEvent), "untrusted-model-result");
    }
    return drop(context, kind, readSequence(rawEvent), dropReason(kind));
  } catch {
    return fail(kind, "EVE_EVENT_INVALID");
  }
}
