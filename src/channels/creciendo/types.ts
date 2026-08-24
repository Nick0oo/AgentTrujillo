import { z } from "zod";

import { EMERGENCY_RECOMMENDATION_SCHEMA } from "../../presentation/emergency-recommendation";
import { TOOL_STATE_SCHEMA } from "../../presentation/tool-state";
import {
  WIDGET_REGISTRY,
  parseWidgetEnvelope,
  type WidgetEnvelope,
  type WidgetVersion,
} from "../../presentation/widget-registry";

export const CRECIENDO_ROUTE_PREFIX = "/creciendo/v1" as const;
export const CRECIENDO_CHANNEL_VERSION = "creciendo.channel.v1" as const;
export const CRECIENDO_EVENT_VERSION = "creciendo.channel-event.v1" as const;
export const CRECIENDO_ERROR_VERSION = "creciendo.error.v1" as const;
export const CONTINUATION_TOKEN_VERSION = 1 as const;
export const CONTINUATION_TOKEN_ISSUER = "agent-trujillo" as const;
export const CONTINUATION_TOKEN_AUDIENCE = "creciendo-session-continuation" as const;
export const CONTINUATION_TOKEN_TTL_SECONDS = 120;
export const MAX_CHANNEL_EVENT_BYTES = 320 * 1_024;

export type CreciendoChannelVersion = typeof CRECIENDO_CHANNEL_VERSION;

const UUID = z.string().uuid();
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const POSITIVE_SEQUENCE = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const NONNEGATIVE_SEQUENCE = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const IDEMPOTENCY_KEY = OPAQUE_ID;
const OPAQUE_TOKEN_SCHEMA = z.string().min(16).max(4_096).regex(/^[^\s\u0000-\u001f\u007f]+$/u);
const VERSION = z.string().min(3).max(128).regex(/^[a-z][a-z0-9._-]*\.v[1-9][0-9]*$/u);
const SAFE_TEXT = z.string().min(1).max(8_000).refine(
  (value) => value === value.normalize("NFKC") && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Cf}\p{Cs}]/u.test(value),
  "unsafe_text",
);

function uniqueVersions(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export const CLIENT_CAPABILITIES_SCHEMA = z.object({
  channelVersions: z.array(VERSION).min(1).max(4).readonly(),
  eventVersions: z.array(VERSION).min(1).max(4).readonly(),
  widgetVersions: z.array(VERSION).max(64).readonly(),
  ndjson: z.literal(true),
}).strict().superRefine((value, context) => {
  if (!uniqueVersions(value.channelVersions)) {
    context.addIssue({ code: "custom", path: ["channelVersions"], message: "duplicate_version" });
  }
  if (!uniqueVersions(value.eventVersions)) {
    context.addIssue({ code: "custom", path: ["eventVersions"], message: "duplicate_version" });
  }
  if (!uniqueVersions(value.widgetVersions)) {
    context.addIssue({ code: "custom", path: ["widgetVersions"], message: "duplicate_version" });
  }
});

export type ClientCapabilities = Readonly<z.infer<typeof CLIENT_CAPABILITIES_SCHEMA>>;

export const NEGOTIATED_CAPABILITIES_SCHEMA = z.object({
  channelVersion: z.literal(CRECIENDO_CHANNEL_VERSION),
  eventVersion: z.literal(CRECIENDO_EVENT_VERSION),
  widgetVersions: z.array(VERSION).max(64).readonly(),
  ndjson: z.literal(true),
}).strict();

export type NegotiatedClientCapabilities = Readonly<z.infer<typeof NEGOTIATED_CAPABILITIES_SCHEMA>>;

const REGISTERED_WIDGET_VERSIONS = Object.freeze(
  Object.values(WIDGET_REGISTRY).map((entry) => entry.version),
);

export function negotiateClientCapabilities(raw: unknown): NegotiatedClientCapabilities | null {
  const parsed = CLIENT_CAPABILITIES_SCHEMA.safeParse(raw);
  if (!parsed.success
    || !parsed.data.channelVersions.includes(CRECIENDO_CHANNEL_VERSION)
    || !parsed.data.eventVersions.includes(CRECIENDO_EVENT_VERSION)) return null;
  const supported = new Set(parsed.data.widgetVersions);
  return Object.freeze({
    channelVersion: CRECIENDO_CHANNEL_VERSION,
    eventVersion: CRECIENDO_EVENT_VERSION,
    widgetVersions: Object.freeze(
      REGISTERED_WIDGET_VERSIONS.filter((version) => supported.has(version)),
    ),
    ndjson: true as const,
  });
}

export const CHILD_CONTEXT_REQUEST_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  childId: UUID,
  nonce: OPAQUE_ID,
  capabilities: CLIENT_CAPABILITIES_SCHEMA,
}).strict();

export const CHILD_CONTEXT_RESPONSE_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  requestId: OPAQUE_ID,
  childContextToken: OPAQUE_TOKEN_SCHEMA,
  expiresAt: INSTANT,
  scopeVersion: z.literal("authorized-child-scope.v1"),
  child: z.object({
    reference: UUID,
    displayName: SAFE_TEXT.max(160),
  }).strict(),
  capabilities: NEGOTIATED_CAPABILITIES_SCHEMA,
}).strict();

export const SESSION_CREATE_REQUEST_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  childContextToken: OPAQUE_TOKEN_SCHEMA,
  locale: z.enum(["es-CO", "en-US"]),
  idempotencyKey: IDEMPOTENCY_KEY,
  capabilities: CLIENT_CAPABILITIES_SCHEMA,
}).strict();

export const EVENT_CURSOR_SCHEMA = OPAQUE_TOKEN_SCHEMA.brand<"EventCursor">();
export type EventCursor = z.infer<typeof EVENT_CURSOR_SCHEMA>;

export const CONTINUATION_TOKEN_SCHEMA = OPAQUE_TOKEN_SCHEMA.brand<"ContinuationToken">();
export type ContinuationToken = z.infer<typeof CONTINUATION_TOKEN_SCHEMA>;

export const SESSION_CREATE_RESPONSE_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  requestId: OPAQUE_ID,
  sessionId: UUID,
  continuationToken: CONTINUATION_TOKEN_SCHEMA,
  cursor: EVENT_CURSOR_SCHEMA,
  authorizationExpiresAt: INSTANT,
  capabilities: NEGOTIATED_CAPABILITIES_SCHEMA,
}).strict();

const MESSAGE_PART_SCHEMA = z.object({
  type: z.literal("text"),
  text: SAFE_TEXT,
}).strict();

export const SESSION_MESSAGE_REQUEST_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  continuationToken: CONTINUATION_TOKEN_SCHEMA,
  clientMessageId: UUID,
  idempotencyKey: IDEMPOTENCY_KEY,
  parts: z.array(MESSAGE_PART_SCHEMA).min(1).max(8).readonly(),
  capabilities: CLIENT_CAPABILITIES_SCHEMA,
}).strict().superRefine((value, context) => {
  const totalCharacters = value.parts.reduce((sum, part) => sum + part.text.length, 0);
  if (totalCharacters > 16_000) {
    context.addIssue({ code: "custom", path: ["parts"], message: "message_too_large" });
  }
});

export const SESSION_MESSAGE_RESPONSE_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  requestId: OPAQUE_ID,
  sessionId: UUID,
  turnId: UUID,
  messageId: UUID,
  outcome: z.enum(["accepted", "idempotent_replay"]),
  acceptedAt: INSTANT,
  continuationToken: CONTINUATION_TOKEN_SCHEMA,
  cursor: EVENT_CURSOR_SCHEMA,
}).strict();

export const SESSION_STREAM_REQUEST_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  continuationToken: CONTINUATION_TOKEN_SCHEMA,
  cursor: EVENT_CURSOR_SCHEMA.nullable(),
  capabilities: CLIENT_CAPABILITIES_SCHEMA,
}).strict();

export const SESSION_CANCEL_REQUEST_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  continuationToken: CONTINUATION_TOKEN_SCHEMA,
  operationId: UUID,
  reason: z.enum(["user_requested", "navigation", "session_closed"]),
  idempotencyKey: IDEMPOTENCY_KEY,
}).strict();

export const CANCELLATION_OUTCOME_SCHEMA = z.enum([
  "requested",
  "already_terminal",
  "cancelled_before_effect",
  "effect_may_have_committed",
]);

export const SESSION_CANCEL_RESPONSE_SCHEMA = z.object({
  version: z.literal(CRECIENDO_CHANNEL_VERSION),
  requestId: OPAQUE_ID,
  sessionId: UUID,
  operationId: UUID,
  outcome: CANCELLATION_OUTCOME_SCHEMA,
  effectState: z.enum(["none", "committed", "unknown"]),
  continuationToken: CONTINUATION_TOKEN_SCHEMA,
  cursor: EVENT_CURSOR_SCHEMA,
}).strict().superRefine((value, context) => {
  if (value.outcome === "cancelled_before_effect" && value.effectState !== "none") {
    context.addIssue({ code: "custom", path: ["effectState"], message: "effect_state" });
  }
  if (value.outcome === "effect_may_have_committed" && value.effectState !== "unknown") {
    context.addIssue({ code: "custom", path: ["effectState"], message: "effect_state" });
  }
});

export const CONTINUATION_TOKEN_CLAIMS_SCHEMA = z.object({
  version: z.literal(CONTINUATION_TOKEN_VERSION),
  issuer: z.literal(CONTINUATION_TOKEN_ISSUER),
  audience: z.literal(CONTINUATION_TOKEN_AUDIENCE),
  tokenId: UUID,
  sessionBindingSha256: HASH,
  authorizationBindingSha256: HASH,
  securityVersionSha256: HASH,
  lastSequence: NONNEGATIVE_SEQUENCE,
  issuedAt: z.number().int().positive(),
  notBefore: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (value.notBefore < value.issuedAt
    || value.expiresAt <= value.notBefore
    || value.expiresAt - value.issuedAt > CONTINUATION_TOKEN_TTL_SECONDS) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "token_window" });
  }
});

export type ContinuationTokenClaims = Readonly<z.infer<typeof CONTINUATION_TOKEN_CLAIMS_SCHEMA>>;

export const SAFE_CHANNEL_ERROR_CODES = Object.freeze([
  "AUTHENTICATION_REQUIRED",
  "ACCESS_DENIED",
  "REQUEST_INVALID",
  "VERSION_UNSUPPORTED",
  "RATE_LIMITED",
  "CONFLICT",
  "RETENTION_GAP",
  "PROVIDER_UNAVAILABLE",
  "PERSISTENCE_UNAVAILABLE",
  "TIMEOUT",
  "CANCELLED",
  "INTERNAL_UNAVAILABLE",
] as const);

const SAFE_CHANNEL_ERROR_CODE_SCHEMA = z.enum(SAFE_CHANNEL_ERROR_CODES);
const RETRYABLE_ERROR_CODES = new Set([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PERSISTENCE_UNAVAILABLE",
  "TIMEOUT",
]);

export const SAFE_CHANNEL_ERROR_SCHEMA = z.object({
  version: z.literal(CRECIENDO_ERROR_VERSION),
  code: SAFE_CHANNEL_ERROR_CODE_SCHEMA,
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().min(1).max(300).nullable(),
  effectState: z.enum(["none", "committed", "unknown"]),
  resumable: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.retryable && (!RETRYABLE_ERROR_CODES.has(value.code) || value.effectState !== "none")) {
    context.addIssue({ code: "custom", path: ["retryable"], message: "unsafe_retry" });
  }
  if (!value.retryable && value.retryAfterSeconds !== null) {
    context.addIssue({ code: "custom", path: ["retryAfterSeconds"], message: "retry_disabled" });
  }
  if (value.retryAfterSeconds !== null && value.code !== "RATE_LIMITED") {
    context.addIssue({ code: "custom", path: ["retryAfterSeconds"], message: "retry_delay" });
  }
  if (["AUTHENTICATION_REQUIRED", "ACCESS_DENIED", "RETENTION_GAP", "CANCELLED"].includes(value.code)
    && value.resumable) {
    context.addIssue({ code: "custom", path: ["resumable"], message: "unsafe_resume" });
  }
});

export type SafeChannelError = Readonly<z.infer<typeof SAFE_CHANNEL_ERROR_SCHEMA>>;

const WIDGET_ENVELOPE_SCHEMA = z.unknown().transform((value, context): WidgetEnvelope => {
  try {
    return parseWidgetEnvelope(value);
  } catch {
    context.addIssue({ code: "custom", message: "widget_invalid" });
    return z.NEVER;
  }
});

const EVENT_COMMON = {
  version: z.literal(CRECIENDO_EVENT_VERSION),
  eventId: UUID,
  sessionId: UUID,
  turnId: UUID,
  sequence: POSITIVE_SEQUENCE,
  occurredAt: INSTANT,
  cursor: EVENT_CURSOR_SCHEMA,
} as const;

function eventSchema<T extends string, Terminal extends boolean, Data extends z.ZodType>(
  type: T,
  terminal: Terminal,
  data: Data,
) {
  return z.object({
    ...EVENT_COMMON,
    type: z.literal(type),
    terminal: z.literal(terminal),
    data,
  }).strict();
}

const UI_PART_DATA_SCHEMA = z.object({
  widget: WIDGET_ENVELOPE_SCHEMA,
}).strict().superRefine((value, context) => {
  if (value.widget.kind === "emergency_recommendation" || value.widget.kind === "tool_state") {
    context.addIssue({ code: "custom", path: ["widget", "kind"], message: "dedicated_event_required" });
  }
});

const PUBLIC_CITATION_URL = z.string().url().max(2_048).refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}, "public_https_reference");

export const CHANNEL_EVENT_SCHEMA = z.union([
  eventSchema("text-delta", false, z.object({ text: SAFE_TEXT.max(4_096) }).strict()),
  eventSchema("tool-state", false, z.object({ widget: TOOL_STATE_SCHEMA }).strict()),
  eventSchema("ui-part", false, UI_PART_DATA_SCHEMA),
  eventSchema("citation", false, z.object({
    citationId: OPAQUE_ID,
    label: SAFE_TEXT.max(256),
    href: PUBLIC_CITATION_URL,
  }).strict()),
  eventSchema("heartbeat", false, z.object({ observedAt: INSTANT }).strict()),
  eventSchema("message-complete", true, z.object({
    messageId: UUID,
    outcome: z.enum(["completed", "abstained"]),
    effectState: z.enum(["none", "committed", "unknown"]),
  }).strict()),
  eventSchema("session-cancelled", true, z.object({
    outcome: CANCELLATION_OUTCOME_SCHEMA,
    effectState: z.enum(["none", "committed", "unknown"]),
  }).strict()),
  eventSchema("emergency-recommendation", true, z.object({
    widget: EMERGENCY_RECOMMENDATION_SCHEMA,
  }).strict()),
  eventSchema("stream-error", true, z.object({ error: SAFE_CHANNEL_ERROR_SCHEMA }).strict()),
]);

export type ChannelEvent = Readonly<z.infer<typeof CHANNEL_EVENT_SCHEMA>>;
export type ChannelEventType = ChannelEvent["type"];

function encodedBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export class ChannelContractError extends Error {
  readonly code = "CHANNEL_EVENT_INVALID" as const;

  constructor() {
    super("CHANNEL_EVENT_INVALID");
    this.name = "ChannelContractError";
  }
}

export function parseChannelEvent(raw: unknown): ChannelEvent {
  const parsed = CHANNEL_EVENT_SCHEMA.safeParse(raw);
  if (!parsed.success || encodedBytes(parsed.data) > MAX_CHANNEL_EVENT_BYTES) {
    throw new ChannelContractError();
  }
  return deepFreeze(parsed.data) as ChannelEvent;
}

export type ChildContextRequest = Readonly<z.infer<typeof CHILD_CONTEXT_REQUEST_SCHEMA>>;
export type ChildContextResponse = Readonly<z.infer<typeof CHILD_CONTEXT_RESPONSE_SCHEMA>>;
export type SessionCreateRequest = Readonly<z.infer<typeof SESSION_CREATE_REQUEST_SCHEMA>>;
export type SessionCreateResponse = Readonly<z.infer<typeof SESSION_CREATE_RESPONSE_SCHEMA>>;
export type SessionMessageRequest = Readonly<z.infer<typeof SESSION_MESSAGE_REQUEST_SCHEMA>>;
export type SessionMessageResponse = Readonly<z.infer<typeof SESSION_MESSAGE_RESPONSE_SCHEMA>>;
export type SessionStreamRequest = Readonly<z.infer<typeof SESSION_STREAM_REQUEST_SCHEMA>>;
export type SessionCancelRequest = Readonly<z.infer<typeof SESSION_CANCEL_REQUEST_SCHEMA>>;
export type SessionCancelResponse = Readonly<z.infer<typeof SESSION_CANCEL_RESPONSE_SCHEMA>>;

export const REGISTERED_CHANNEL_WIDGET_VERSIONS: readonly WidgetVersion[] = REGISTERED_WIDGET_VERSIONS;
