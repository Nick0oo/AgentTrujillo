const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

export type SessionStatus = "active" | "completed" | "cancelled" | "archived";

export type SessionProjectionScope = Readonly<{
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  productSessionId: string;
}>;

export type SessionProjectionEvent =
  | Readonly<{ type: "session.started"; eveSessionId: string }>
  | Readonly<{ type: "turn.started"; turnId: string }>
  | Readonly<{ type: "turn.completed"; turnId: string }>
  | Readonly<{ type: "turn.cancelled"; turnId: string }>
  | Readonly<{ type: "session.completed"; eveSessionId: string }>
  | Readonly<{ type: "session.cancelled"; eveSessionId: string }>
  | Readonly<{ type: "session.failed"; eveSessionId: string }>;

export type SessionProjectionEnvelope = Readonly<{
  scope: SessionProjectionScope;
  sourceEventId: string;
  sourceEventVersion: string;
  sourceSequence: number;
  occurredAt: string;
  event: SessionProjectionEvent;
}>;

export type SessionRecord = Readonly<SessionProjectionScope & {
  eveSessionId: string | null;
  status: SessionStatus;
  lastSequence: number;
  completedAt: string | null;
  updatedAt?: string;
}>;

export type ProcessedSessionEvent = Readonly<{
  sourceEventId: string;
  sourceEventVersion: string;
  sourceSequence: number;
  status: SessionStatus;
}>;

export type SafeSessionChannelEvent = Readonly<{
  resource: "session";
  scope: SessionProjectionScope;
  sourceEventId: string;
  version: number;
  occurredAt: string;
}>;

export type SessionProjectionTransaction = Readonly<{
  findSession(scope: SessionProjectionScope): Promise<SessionRecord | null>;
  findProcessedSource(input: Readonly<{ scope: SessionProjectionScope; sourceEventId: string }>): Promise<ProcessedSessionEvent | null>;
  updateSession(input: Readonly<{
    status: SessionStatus;
    lastSequence: number;
    eveSessionId?: string | null;
    completedAt?: string | null;
    updatedAt?: string;
  }>): Promise<SessionRecord>;
  appendSafeChannelEvent(event: SafeSessionChannelEvent): Promise<void>;
  recordProcessedSource(event: ProcessedSessionEvent): Promise<void>;
  quarantine(event: Readonly<{
    scope: SessionProjectionScope;
    sourceEventId: string;
    sourceSequence: number;
    reason: "invalid_event" | "out_of_order" | "terminal_transition" | "scope_mismatch" | "source_conflict";
  }>): Promise<void>;
}>;

export type SessionProjectionResult =
  | Readonly<{ outcome: "applied"; sourceEventId: string; status: SessionStatus; lastSequence: number }>
  | Readonly<{ outcome: "replayed"; sourceEventId: string; status: SessionStatus; lastSequence: number }>
  | Readonly<{ outcome: "quarantined"; sourceEventId: string; reason: "invalid_event" | "out_of_order" | "terminal_transition" | "scope_mismatch" | "source_conflict" }>
  | Readonly<{ outcome: "rejected"; sourceEventId: string; reason: "invalid_event" | "not_found" | "scope_mismatch" }>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function validScope(scope: unknown): scope is SessionProjectionScope {
  return isRecord(scope)
    && exactKeys(scope, ["ownerUserId", "careSpaceId", "childId", "productSessionId"])
    && isUuid(scope.ownerUserId)
    && isUuid(scope.careSpaceId)
    && isUuid(scope.childId)
    && isUuid(scope.productSessionId);
}

function sameScope(left: SessionProjectionScope, right: SessionProjectionScope): boolean {
  return left.ownerUserId === right.ownerUserId
    && left.careSpaceId === right.careSpaceId
    && left.childId === right.childId
    && left.productSessionId === right.productSessionId;
}

function validEvent(event: unknown): event is SessionProjectionEvent {
  if (!isRecord(event) || typeof event.type !== "string") return false;
  if (event.type === "turn.started" || event.type === "turn.completed" || event.type === "turn.cancelled") {
    return exactKeys(event, ["type", "turnId"])
      && typeof event.turnId === "string" && OPAQUE_ID.test(event.turnId);
  }
  if (event.type === "session.started" || event.type === "session.completed" || event.type === "session.cancelled" || event.type === "session.failed") {
    return exactKeys(event, ["type", "eveSessionId"])
      && typeof event.eveSessionId === "string" && OPAQUE_ID.test(event.eveSessionId);
  }
  return false;
}

function validEnvelope(value: unknown): value is SessionProjectionEnvelope {
  if (!isRecord(value)
    || !exactKeys(value, ["scope", "sourceEventId", "sourceEventVersion", "sourceSequence", "occurredAt", "event"])
    || !validScope(value.scope)
    || !OPAQUE_ID.test(String(value.sourceEventId))
    || !VERSION.test(String(value.sourceEventVersion))
    || !Number.isSafeInteger(value.sourceSequence)
    || (value.sourceSequence as number) < 1
    || !isInstant(value.occurredAt)
    || !validEvent(value.event)) return false;
  return true;
}

function terminal(status: SessionStatus): boolean {
  return status === "completed" || status === "cancelled" || status === "archived";
}

function quarantine(
  tx: SessionProjectionTransaction,
  envelope: SessionProjectionEnvelope,
  reason: "invalid_event" | "out_of_order" | "terminal_transition" | "scope_mismatch" | "source_conflict",
): Promise<SessionProjectionResult> {
  return tx.quarantine({
    scope: envelope.scope,
    sourceEventId: envelope.sourceEventId,
    sourceSequence: envelope.sourceSequence,
    reason,
  }).then(() => Object.freeze({ outcome: "quarantined" as const, sourceEventId: envelope.sourceEventId, reason }));
}

export async function projectSessionEvent(
  tx: SessionProjectionTransaction,
  input: unknown,
): Promise<SessionProjectionResult> {
  if (!validEnvelope(input)) {
    return Object.freeze({ outcome: "rejected", sourceEventId: isRecord(input) && typeof input.sourceEventId === "string" ? input.sourceEventId : "invalid", reason: "invalid_event" });
  }

  const existingSource = await tx.findProcessedSource({ scope: input.scope, sourceEventId: input.sourceEventId });
  if (existingSource) {
    if (existingSource.sourceEventVersion !== input.sourceEventVersion || existingSource.sourceSequence !== input.sourceSequence) {
      return quarantine(tx, input, "source_conflict");
    }
    return Object.freeze({ outcome: "replayed" as const, sourceEventId: input.sourceEventId, status: existingSource.status, lastSequence: existingSource.sourceSequence });
  }

  const session = await tx.findSession(input.scope);
  if (!session) return Object.freeze({ outcome: "rejected", sourceEventId: input.sourceEventId, reason: "not_found" });
  if (!sameScope(session, input.scope)) return Object.freeze({ outcome: "rejected", sourceEventId: input.sourceEventId, reason: "scope_mismatch" });
  if (input.sourceSequence <= session.lastSequence) return quarantine(tx, input, "out_of_order");
  if (terminal(session.status)) return quarantine(tx, input, "terminal_transition");

  const event = input.event;
  if ("eveSessionId" in event && session.eveSessionId !== null && event.eveSessionId !== session.eveSessionId) {
    return quarantine(tx, input, "source_conflict");
  }
  const isSessionTerminal = event.type === "session.completed" || event.type === "session.cancelled" || event.type === "session.failed";
  const nextStatus: SessionStatus = event.type === "session.completed"
    ? "completed"
    : event.type === "session.cancelled" || event.type === "session.failed"
      ? "cancelled"
      : "active";
  const nextSession = await tx.updateSession({
    status: nextStatus,
    lastSequence: input.sourceSequence,
    ...(event.type === "session.started" ? { eveSessionId: event.eveSessionId } : {}),
    ...(isSessionTerminal ? { completedAt: input.occurredAt } : {}),
    updatedAt: input.occurredAt,
  });
  await tx.appendSafeChannelEvent({
    resource: "session",
    scope: input.scope,
    sourceEventId: input.sourceEventId,
    version: input.sourceSequence,
    occurredAt: input.occurredAt,
  });
  await tx.recordProcessedSource({
    sourceEventId: input.sourceEventId,
    sourceEventVersion: input.sourceEventVersion,
    sourceSequence: input.sourceSequence,
    status: nextSession.status,
  });
  return Object.freeze({ outcome: "applied" as const, sourceEventId: input.sourceEventId, status: nextSession.status, lastSequence: nextSession.lastSequence });
}
