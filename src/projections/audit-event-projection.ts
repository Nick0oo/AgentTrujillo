import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const CODE = /^[A-Z][A-Z0-9._-]{0,63}$/u;
const SAFE_METADATA_KEY = /^(?:policyCode|attempt|workflowVersion|toolVersion|statusCode)$/u;
const SENSITIVE_KEY = /(?:name|note|symptom|token|secret|password|prompt|reasoning|document|url|vector|embedding|raw|content|text|message|payload|medical|diagnos|prescri|allerg|address|phone|email)/iu;
const SENSITIVE_VALUE = /(?:https?:\/\/|bearer\s|-----begin|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/iu;

export const AuditEventSchema = Object.freeze({
  authorization: "audit.authorization.v1",
  tool: "audit.tool.v1",
  safety: "audit.safety.v1",
  workflow: "audit.workflow.v1",
  commerce: "audit.commerce.v1",
} as const);

type AuditEventType = keyof typeof AuditEventSchema;
type AuditActorType = "guardian" | "agent" | "system" | "operator" | "webhook";
type AuditOutcome = "allowed" | "denied" | "succeeded" | "failed";
type AuditRetentionClass = "security_control" | "clinical_control" | "operational_control" | "commerce_control";

export type AuditEventScope = Readonly<{
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  productSessionId: string;
}>;

export type AuditEvent = Readonly<{
  type: AuditEventType;
  action: string;
  actorType: AuditActorType;
  actorDigest: string;
  resourceType: string;
  resourceId: string | null;
  requestDigest: string;
  policyDigest: string | null;
  outcome: AuditOutcome;
  retentionClass: AuditRetentionClass;
  metadata: Readonly<Record<string, unknown>>;
  eventDigest: string;
}>;

export type AuditEventEnvelope = Readonly<{
  scope: AuditEventScope;
  sourceEventId: string;
  sourceEventVersion: string;
  sourceSequence: number;
  occurredAt: string;
  event: AuditEvent;
}>;

export type AuditEventProjectionState = Readonly<{
  scope: AuditEventScope;
  sourceEventId: string;
  sourceEventVersion: string;
  sourceSequence: number;
  occurredAt: string;
  schemaVersion: string;
  eventType: AuditEventType;
  action: string;
  actorType: AuditActorType;
  actorDigest: string;
  resourceType: string;
  resourceId: string | null;
  requestDigest: string;
  policyDigest: string | null;
  outcome: AuditOutcome;
  retentionClass: AuditRetentionClass;
  metadata: Readonly<Record<string, unknown>>;
  eventDigest: string;
}>;

type ProcessedAuditSource = Readonly<{
  sourceEventVersion: string;
  sourceSequence: number;
  eventDigest: string;
}>;

export type AuditEventProjectionTransaction = Readonly<{
  now(): Date;
  findProcessedSource(input: Readonly<{ scope: AuditEventScope; sourceEventId: string }>): Promise<ProcessedAuditSource | null>;
  appendAuditEvent(state: AuditEventProjectionState): Promise<AuditEventProjectionState>;
  recordProcessedSource(input: Readonly<{ sourceEventId: string; sourceEventVersion: string; sourceSequence: number; eventDigest: string }>): Promise<void>;
  quarantine(input: Readonly<{
    scope: AuditEventScope;
    sourceEventId: string;
    sourceSequence: number;
    reason: "invalid_event" | "sensitive_payload" | "timestamp_drift" | "source_conflict";
  }>): Promise<void>;
}>;

export type AuditSensitivityResult = Readonly<{
  disposition: "safe" | "sensitive";
  reason: "allowed" | "sensitive_key" | "sensitive_value" | "unsupported_value";
}>;

export type AuditEventProjectionResult =
  | Readonly<{ disposition: "stored"; outcome: "created" | "replayed"; sourceEventId: string; eventDigest: string }>
  | Readonly<{ disposition: "quarantined"; sourceEventId: string; reason: "invalid_event" | "sensitive_payload" | "timestamp_drift" | "source_conflict" }>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function isOpaque(value: unknown): value is string { return typeof value === "string" && OPAQUE_ID.test(value); }
function isVersion(value: unknown): value is string { return typeof value === "string" && VERSION.test(value); }
function isDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }

function validScope(value: unknown): value is AuditEventScope {
  return isRecord(value)
    && exactKeys(value, ["ownerUserId", "careSpaceId", "childId", "productSessionId"])
    && isUuid(value.ownerUserId) && isUuid(value.careSpaceId) && isUuid(value.childId) && isUuid(value.productSessionId);
}

function validInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function validMetadata(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value) || Object.keys(value).length > 16) return false;
  return Object.keys(value).every((key) => isOpaque(key));
}

function validEvent(value: unknown): value is AuditEvent {
  if (!isRecord(value) || !exactKeys(value, ["type", "action", "actorType", "actorDigest", "resourceType", "resourceId", "requestDigest", "policyDigest", "outcome", "retentionClass", "metadata", "eventDigest"])) return false;
  return typeof value.type === "string" && Object.hasOwn(AuditEventSchema, value.type)
    && isOpaque(value.action)
    && ["guardian", "agent", "system", "operator", "webhook"].includes(String(value.actorType))
    && isDigest(value.actorDigest)
    && isOpaque(value.resourceType)
    && (value.resourceId === null || isOpaque(value.resourceId))
    && isDigest(value.requestDigest)
    && (value.policyDigest === null || isDigest(value.policyDigest))
    && ["allowed", "denied", "succeeded", "failed"].includes(String(value.outcome))
    && ["security_control", "clinical_control", "operational_control", "commerce_control"].includes(String(value.retentionClass))
    && validMetadata(value.metadata)
    && isDigest(value.eventDigest);
}

function validEnvelope(value: unknown): value is AuditEventEnvelope {
  return isRecord(value)
    && exactKeys(value, ["scope", "sourceEventId", "sourceEventVersion", "sourceSequence", "occurredAt", "event"])
    && validScope(value.scope)
    && isOpaque(value.sourceEventId)
    && isVersion(value.sourceEventVersion)
    && Number.isSafeInteger(value.sourceSequence) && (value.sourceSequence as number) > 0
    && validInstant(value.occurredAt)
    && validEvent(value.event);
}

function sensitivity(value: unknown, key: string | null = null, metadata = false): AuditSensitivityResult {
  if (key !== null && SENSITIVE_KEY.test(key)) return Object.freeze({ disposition: "sensitive" as const, reason: "sensitive_key" as const });
  if (metadata && (key === null || !SAFE_METADATA_KEY.test(key))) return Object.freeze({ disposition: "sensitive" as const, reason: "sensitive_key" as const });
  if (typeof value === "string" && SENSITIVE_VALUE.test(value)) return Object.freeze({ disposition: "sensitive" as const, reason: "sensitive_value" as const });
  if (value === null || typeof value === "boolean" || typeof value === "number") return Object.freeze({ disposition: "safe" as const, reason: "allowed" as const });
  if (typeof value === "string") return Object.freeze({ disposition: "safe" as const, reason: "allowed" as const });
  if (Array.isArray(value)) return Object.freeze({ disposition: "sensitive" as const, reason: "unsupported_value" as const });
  if (!isRecord(value)) return Object.freeze({ disposition: "sensitive" as const, reason: "unsupported_value" as const });
  for (const [childKey, childValue] of Object.entries(value)) {
    const result = sensitivity(childValue, childKey, key === "metadata");
    if (result.disposition === "sensitive") return result;
  }
  return Object.freeze({ disposition: "safe" as const, reason: "allowed" as const });
}

export function scanAuditSensitivity(value: unknown): AuditSensitivityResult {
  return sensitivity(value);
}

function eventDigest(event: AuditEvent): string {
  const { eventDigest: _ignored, ...withoutDigest } = event;
  return createHash("sha256").update(canonicalize(withoutDigest), "utf8").digest("hex");
}

function quarantine(tx: AuditEventProjectionTransaction, input: AuditEventEnvelope, reason: "invalid_event" | "sensitive_payload" | "timestamp_drift" | "source_conflict"): Promise<AuditEventProjectionResult> {
  return tx.quarantine({ scope: input.scope, sourceEventId: input.sourceEventId, sourceSequence: input.sourceSequence, reason })
    .then(() => Object.freeze({ disposition: "quarantined" as const, sourceEventId: input.sourceEventId, reason }));
}

export async function projectAuditEvent(tx: AuditEventProjectionTransaction, input: unknown): Promise<AuditEventProjectionResult> {
  if (!validEnvelope(input)) {
    return Object.freeze({ disposition: "quarantined" as const, sourceEventId: isRecord(input) && typeof input.sourceEventId === "string" ? input.sourceEventId : "invalid", reason: "invalid_event" as const });
  }

  const existingSource = await tx.findProcessedSource({ scope: input.scope, sourceEventId: input.sourceEventId });
  if (existingSource) {
    if (existingSource.sourceEventVersion !== input.sourceEventVersion
      || existingSource.sourceSequence !== input.sourceSequence
      || existingSource.eventDigest !== input.event.eventDigest) return quarantine(tx, input, "source_conflict");
    return Object.freeze({ disposition: "stored" as const, outcome: "replayed" as const, sourceEventId: input.sourceEventId, eventDigest: input.event.eventDigest });
  }

  const scanned = scanAuditSensitivity(input.event);
  if (scanned.disposition === "sensitive") return quarantine(tx, input, "sensitive_payload");
  if (eventDigest(input.event) !== input.event.eventDigest) return quarantine(tx, input, "invalid_event");
  if (new Date(input.occurredAt).getTime() > tx.now().getTime() + 5 * 60 * 1000) return quarantine(tx, input, "timestamp_drift");

  const event = input.event;
  const state = Object.freeze({
    scope: input.scope,
    sourceEventId: input.sourceEventId,
    sourceEventVersion: input.sourceEventVersion,
    sourceSequence: input.sourceSequence,
    occurredAt: input.occurredAt,
    schemaVersion: AuditEventSchema[event.type],
    eventType: event.type,
    action: event.action,
    actorType: event.actorType,
    actorDigest: event.actorDigest,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    requestDigest: event.requestDigest,
    policyDigest: event.policyDigest,
    outcome: event.outcome,
    retentionClass: event.retentionClass,
    metadata: Object.freeze({ ...event.metadata }),
    eventDigest: event.eventDigest,
  });
  const stored = await tx.appendAuditEvent(state);
  await tx.recordProcessedSource({ sourceEventId: input.sourceEventId, sourceEventVersion: input.sourceEventVersion, sourceSequence: input.sourceSequence, eventDigest: stored.eventDigest });
  return Object.freeze({ disposition: "stored" as const, outcome: "created" as const, sourceEventId: stored.sourceEventId, eventDigest: stored.eventDigest });
}
