const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f\p{Cf}\p{Cs}]+$/u;

export type MessageProjectionScope = Readonly<{
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  productSessionId: string;
}>;

export type PersistableMessagePart =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "citation"; citationId: string; label: string; href: string }>;

export type MessageProjectionEvent =
  | Readonly<{ type: "guardian.text"; messageId: string; messageSequence: number; text: string }>
  | Readonly<{ type: "assistant.text"; messageId: string; messageSequence: number; text: string }>
  | Readonly<{ type: "assistant.citation"; messageId: string; messageSequence: number; citationId: string; label: string; href: string }>
  | Readonly<{ type: "assistant.completed"; messageId: string; messageSequence: number }>;

export type MessageProjectionEnvelope = Readonly<{
  scope: MessageProjectionScope;
  sourceEventId: string;
  sourceEventVersion: string;
  sourceSequence: number;
  occurredAt: string;
  event: MessageProjectionEvent;
}>;

export type MessageProjectionRecord = Readonly<{
  scope: MessageProjectionScope;
  messageId: string;
  actorType: "guardian" | "agent";
  sequence: number;
  status: "streaming" | "completed";
  parts: readonly PersistableMessagePart[];
}>;

type ProcessedMessageSource = Readonly<{
  sourceEventId: string;
  sourceEventVersion: string;
  sourceSequence: number;
  disposition: "stored";
}>;

export type SafeMessageChannelEvent = Readonly<{
  resource: "message";
  scope: MessageProjectionScope;
  sourceEventId: string;
  version: number;
  occurredAt: string;
}>;

export type MessageProjectionTransaction = Readonly<{
  findMessage(input: Readonly<{ scope: MessageProjectionScope; messageId: string }>): Promise<MessageProjectionRecord | null>;
  findProcessedSource(input: Readonly<{ scope: MessageProjectionScope; sourceEventId: string }>): Promise<ProcessedMessageSource | null>;
  upsertMessage(input: MessageProjectionRecord): Promise<MessageProjectionRecord>;
  appendSafeChannelEvent(event: SafeMessageChannelEvent): Promise<void>;
  recordProcessedSource(event: ProcessedMessageSource): Promise<void>;
  quarantine(event: Readonly<{
    scope: MessageProjectionScope;
    sourceEventId: string;
    sourceSequence: number;
    reason: "invalid_event" | "out_of_order" | "scope_mismatch" | "message_conflict" | "source_conflict";
  }>): Promise<void>;
}>;

export type MessageProjectionResult =
  | Readonly<{ disposition: "stored"; outcome?: "created" | "replayed"; sourceEventId: string; messageId: string }>
  | Readonly<{ disposition: "suppressed"; reason: "untrusted_event" }>
  | Readonly<{ disposition: "quarantined"; sourceEventId: string; reason: "invalid_event" | "out_of_order" | "scope_mismatch" | "message_conflict" | "source_conflict" }>
  | Readonly<{ disposition: "rejected"; sourceEventId: string; reason: "invalid_event" | "not_found" | "scope_mismatch" | "message_conflict" }>;

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

function isInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function validScope(value: unknown): value is MessageProjectionScope {
  return isRecord(value)
    && exactKeys(value, ["ownerUserId", "careSpaceId", "childId", "productSessionId"])
    && isUuid(value.ownerUserId)
    && isUuid(value.careSpaceId)
    && isUuid(value.childId)
    && isUuid(value.productSessionId);
}

function sameScope(left: MessageProjectionScope, right: MessageProjectionScope): boolean {
  return left.ownerUserId === right.ownerUserId
    && left.careSpaceId === right.careSpaceId
    && left.childId === right.childId
    && left.productSessionId === right.productSessionId;
}

function safeText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength && SAFE_TEXT.test(value);
}

function safeUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.search === "" && url.hash === "";
  } catch {
    return false;
  }
}

function validEvent(value: unknown): value is MessageProjectionEvent {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  const common = (keys: readonly string[]) => exactKeys(value, keys) && isUuid(value.messageId) && Number.isSafeInteger(value.messageSequence) && (value.messageSequence as number) > 0;
  if (value.type === "guardian.text" || value.type === "assistant.text") {
    return common(["type", "messageId", "messageSequence", "text"]) && safeText(value.text, 4_096);
  }
  if (value.type === "assistant.citation") {
    return common(["type", "messageId", "messageSequence", "citationId", "label", "href"])
      && typeof value.citationId === "string" && OPAQUE_ID.test(value.citationId)
      && safeText(value.label, 256)
      && safeUrl(value.href);
  }
  return value.type === "assistant.completed"
    && common(["type", "messageId", "messageSequence"]);
}

function validEnvelope(value: unknown): value is MessageProjectionEnvelope {
  return isRecord(value)
    && exactKeys(value, ["scope", "sourceEventId", "sourceEventVersion", "sourceSequence", "occurredAt", "event"])
    && validScope(value.scope)
    && typeof value.sourceEventId === "string" && OPAQUE_ID.test(value.sourceEventId)
    && typeof value.sourceEventVersion === "string" && VERSION.test(value.sourceEventVersion)
    && Number.isSafeInteger(value.sourceSequence) && (value.sourceSequence as number) > 0
    && isInstant(value.occurredAt)
    && validEvent(value.event);
}

function isSensitiveUntrustedEvent(value: unknown): boolean {
  return isRecord(value)
    && typeof value.type === "string"
    && /^(reasoning\.|step\.|action\.|tool\.|provider\.)/u.test(value.type);
}

function quarantine(
  tx: MessageProjectionTransaction,
  input: MessageProjectionEnvelope,
  reason: "invalid_event" | "out_of_order" | "scope_mismatch" | "message_conflict" | "source_conflict",
): Promise<MessageProjectionResult> {
  return tx.quarantine({ scope: input.scope, sourceEventId: input.sourceEventId, sourceSequence: input.sourceSequence, reason })
    .then(() => Object.freeze({ disposition: "quarantined" as const, sourceEventId: input.sourceEventId, reason }));
}

function includesPart(parts: readonly PersistableMessagePart[], candidate: PersistableMessagePart): boolean {
  return parts.some((part) => JSON.stringify(part) === JSON.stringify(candidate));
}

export async function projectMessageEvent(tx: MessageProjectionTransaction, input: unknown): Promise<MessageProjectionResult> {
  if (isSensitiveUntrustedEvent(isRecord(input) ? input.event : undefined)) return Object.freeze({ disposition: "suppressed" as const, reason: "untrusted_event" as const });
  if (!validEnvelope(input)) {
    return Object.freeze({ disposition: "rejected" as const, sourceEventId: isRecord(input) && typeof input.sourceEventId === "string" ? input.sourceEventId : "invalid", reason: "invalid_event" as const });
  }

  const existingSource = await tx.findProcessedSource({ scope: input.scope, sourceEventId: input.sourceEventId });
  if (existingSource) {
    if (existingSource.sourceEventVersion !== input.sourceEventVersion || existingSource.sourceSequence !== input.sourceSequence) return quarantine(tx, input, "source_conflict");
    return Object.freeze({ disposition: "stored" as const, outcome: "replayed" as const, sourceEventId: input.sourceEventId, messageId: input.event.messageId });
  }

  const current = await tx.findMessage({ scope: input.scope, messageId: input.event.messageId });
  if (current && !sameScope(current.scope, input.scope)) return Object.freeze({ disposition: "rejected" as const, sourceEventId: input.sourceEventId, reason: "scope_mismatch" as const });
  if (current && current.sequence > input.event.messageSequence) return quarantine(tx, input, "out_of_order");
  if (current && current.sequence !== input.event.messageSequence) return quarantine(tx, input, "message_conflict");

  const event = input.event;
  const actorType = event.type === "guardian.text" ? "guardian" : "agent";
  if (current && current.actorType !== actorType) return quarantine(tx, input, "message_conflict");
  if (!current && (event.type === "assistant.citation" || event.type === "assistant.completed")) return Object.freeze({ disposition: "rejected" as const, sourceEventId: input.sourceEventId, reason: "not_found" as const });

  const candidatePart: PersistableMessagePart | null = event.type === "guardian.text" || event.type === "assistant.text"
    ? { kind: "text", text: event.text }
    : event.type === "assistant.citation"
      ? { kind: "citation", citationId: event.citationId, label: event.label, href: event.href }
      : null;
  const parts = current?.parts ? [...current.parts] : [];
  if (candidatePart && !includesPart(parts, candidatePart)) parts.push(candidatePart);
  if (parts.length > 64 || parts.reduce((total, part) => total + JSON.stringify(part).length, 0) > 32_768) return quarantine(tx, input, "message_conflict");
  const status = event.type === "assistant.completed" || event.type === "guardian.text" ? "completed" : "streaming";
  const stored = await tx.upsertMessage({
    scope: input.scope,
    messageId: event.messageId,
    actorType,
    sequence: event.messageSequence,
    status,
    parts: Object.freeze(parts),
  });
  await tx.appendSafeChannelEvent({ resource: "message", scope: input.scope, sourceEventId: input.sourceEventId, version: input.sourceSequence, occurredAt: input.occurredAt });
  await tx.recordProcessedSource({ sourceEventId: input.sourceEventId, sourceEventVersion: input.sourceEventVersion, sourceSequence: input.sourceSequence, disposition: "stored" });
  return Object.freeze({ disposition: "stored" as const, outcome: "created" as const, sourceEventId: input.sourceEventId, messageId: stored.messageId });
}
