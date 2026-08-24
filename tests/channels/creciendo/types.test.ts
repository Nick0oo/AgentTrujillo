import { describe, expect, it } from "vitest";

import {
  CHANNEL_EVENT_SCHEMA,
  CHILD_CONTEXT_REQUEST_SCHEMA,
  CONTINUATION_TOKEN_CLAIMS_SCHEMA,
  CRECIENDO_CHANNEL_VERSION,
  CRECIENDO_EVENT_VERSION,
  MAX_CHANNEL_EVENT_BYTES,
  SAFE_CHANNEL_ERROR_SCHEMA,
  SESSION_CANCEL_REQUEST_SCHEMA,
  SESSION_CREATE_REQUEST_SCHEMA,
  SESSION_MESSAGE_REQUEST_SCHEMA,
  SESSION_STREAM_REQUEST_SCHEMA,
  negotiateClientCapabilities,
  parseChannelEvent,
} from "../../../src/channels/creciendo/types";

const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const TURN_ID = "20000000-0000-4000-8000-000000000002";
const EVENT_ID = "30000000-0000-4000-8000-000000000003";
const CHILD_ID = "40000000-0000-4000-8000-000000000004";
const CLIENT_MESSAGE_ID = "50000000-0000-4000-8000-000000000005";

const CAPABILITIES = Object.freeze({
  channelVersions: [CRECIENDO_CHANNEL_VERSION],
  eventVersions: [CRECIENDO_EVENT_VERSION],
  widgetVersions: ["growth.summary.v1", "future.widget.v9"],
  ndjson: true,
});

const EVENT_BASE = Object.freeze({
  version: CRECIENDO_EVENT_VERSION,
  eventId: EVENT_ID,
  sessionId: SESSION_ID,
  turnId: TURN_ID,
  sequence: 1,
  occurredAt: "2026-08-24T12:00:00.000Z",
  cursor: "cursor.v1.synthetic",
});

describe("Creciendo public channel contracts", () => {
  it("negotiates only the closed channel, event and widget registry versions", () => {
    expect(negotiateClientCapabilities(CAPABILITIES)).toEqual({
      channelVersion: CRECIENDO_CHANNEL_VERSION,
      eventVersion: CRECIENDO_EVENT_VERSION,
      widgetVersions: ["growth.summary.v1"],
      ndjson: true,
    });
    expect(negotiateClientCapabilities({ ...CAPABILITIES, channelVersions: ["creciendo.channel.v2"] })).toBeNull();
    expect(negotiateClientCapabilities({ ...CAPABILITIES, eventVersions: ["creciendo.channel-event.v2"] })).toBeNull();
  });

  it("keeps child selection explicit while rejecting client-supplied authority", () => {
    expect(CHILD_CONTEXT_REQUEST_SCHEMA.safeParse({
      version: CRECIENDO_CHANNEL_VERSION,
      childId: CHILD_ID,
      nonce: "child-context.01.test",
      capabilities: CAPABILITIES,
    }).success).toBe(true);
    expect(CHILD_CONTEXT_REQUEST_SCHEMA.safeParse({
      version: CRECIENDO_CHANNEL_VERSION,
      childId: CHILD_ID,
      nonce: "child-context.01.test",
      capabilities: CAPABILITIES,
      careSpaceId: SESSION_ID,
      permissions: ["manage_guardians"],
      countryOfCare: "CO",
    }).success).toBe(false);
  });

  it("defines strict create, message, stream and cancel commands without tool or child authority", () => {
    expect(SESSION_CREATE_REQUEST_SCHEMA.safeParse({
      version: CRECIENDO_CHANNEL_VERSION,
      childContextToken: "child-context.jwt.synthetic",
      locale: "es-CO",
      idempotencyKey: "session:create:01",
      capabilities: CAPABILITIES,
    }).success).toBe(true);

    const message = {
      version: CRECIENDO_CHANNEL_VERSION,
      continuationToken: "continuation.jwt.synthetic",
      clientMessageId: CLIENT_MESSAGE_ID,
      idempotencyKey: "message:01",
      parts: [{ type: "text", text: "Mi hijo tiene tos." }],
      capabilities: CAPABILITIES,
    };
    expect(SESSION_MESSAGE_REQUEST_SCHEMA.safeParse(message).success).toBe(true);
    expect(SESSION_MESSAGE_REQUEST_SCHEMA.safeParse({ ...message, childId: CHILD_ID }).success).toBe(false);
    expect(SESSION_MESSAGE_REQUEST_SCHEMA.safeParse({ ...message, tool: "record_medication_intake" }).success).toBe(false);
    expect(SESSION_MESSAGE_REQUEST_SCHEMA.safeParse({
      ...message,
      parts: [{ type: "text", text: "x".repeat(8_001) }],
    }).success).toBe(false);

    expect(SESSION_STREAM_REQUEST_SCHEMA.safeParse({
      version: CRECIENDO_CHANNEL_VERSION,
      continuationToken: "continuation.jwt.synthetic",
      cursor: "cursor.v1.synthetic",
      capabilities: CAPABILITIES,
    }).success).toBe(true);
    expect(SESSION_CANCEL_REQUEST_SCHEMA.safeParse({
      version: CRECIENDO_CHANNEL_VERSION,
      continuationToken: "continuation.jwt.synthetic",
      operationId: TURN_ID,
      reason: "user_requested",
      idempotencyKey: "cancel:01",
    }).success).toBe(true);
  });

  it("accepts a bounded text event and rejects unknown, extra and terminal-incompatible data", () => {
    const textEvent = {
      ...EVENT_BASE,
      type: "text-delta",
      terminal: false,
      data: { text: "Respuesta educativa." },
    };
    expect(CHANNEL_EVENT_SCHEMA.safeParse(textEvent).success).toBe(true);
    expect(Object.isFrozen(parseChannelEvent(textEvent))).toBe(true);
    expect(CHANNEL_EVENT_SCHEMA.safeParse({ ...textEvent, type: "reasoning-delta" }).success).toBe(false);
    expect(CHANNEL_EVENT_SCHEMA.safeParse({ ...textEvent, terminal: true }).success).toBe(false);
    expect(CHANNEL_EVENT_SCHEMA.safeParse({ ...textEvent, prompt: "hidden" }).success).toBe(false);
    expect(CHANNEL_EVENT_SCHEMA.safeParse({ ...textEvent, sequence: 0 }).success).toBe(false);
  });

  it("makes emergency output exactly terminal, text-only and action-free", () => {
    const widget = {
      kind: "emergency_recommendation",
      version: "emergency.recommendation.v1",
      data: {
        contentType: "text/emergency.recommendation.v1",
        terminal: true,
        locale: "es-CO",
        copy: { id: "emergency-es-co", version: "emergency-copy-v1" },
        text: "Acudan directamente al servicio de urgencias.",
        screenReaderText: "Acudan directamente al servicio de urgencias.",
        fallbackText: "Acudan directamente al servicio de urgencias.",
      },
    };
    const event = {
      ...EVENT_BASE,
      type: "emergency-recommendation",
      terminal: true,
      data: { widget },
    };
    expect(CHANNEL_EVENT_SCHEMA.safeParse(event).success).toBe(true);
    expect(CHANNEL_EVENT_SCHEMA.safeParse({
      ...event,
      data: { widget: { ...widget, data: { ...widget.data, actions: [{ type: "call" }] } } },
    }).success).toBe(false);
    expect(CHANNEL_EVENT_SCHEMA.safeParse({ ...event, terminal: false }).success).toBe(false);
  });

  it("enforces safe error invariants and the whole-event byte budget", () => {
    expect(SAFE_CHANNEL_ERROR_SCHEMA.safeParse({
      version: "creciendo.error.v1",
      code: "RATE_LIMITED",
      retryable: true,
      retryAfterSeconds: 30,
      effectState: "none",
      resumable: true,
    }).success).toBe(true);
    expect(SAFE_CHANNEL_ERROR_SCHEMA.safeParse({
      version: "creciendo.error.v1",
      code: "ACCESS_DENIED",
      retryable: true,
      retryAfterSeconds: null,
      effectState: "none",
      resumable: false,
    }).success).toBe(false);

    const oversized = {
      ...EVENT_BASE,
      type: "text-delta",
      terminal: false,
      data: { text: "x".repeat(MAX_CHANNEL_EVENT_BYTES) },
    };
    expect(() => parseChannelEvent(oversized)).toThrowError("CHANNEL_EVENT_INVALID");
  });

  it("uses opaque continuation bindings and rejects raw authorization claims", () => {
    const claims = {
      version: 1,
      issuer: "agent-trujillo",
      audience: "creciendo-session-continuation",
      tokenId: EVENT_ID,
      sessionBindingSha256: "a".repeat(64),
      authorizationBindingSha256: "b".repeat(64),
      securityVersionSha256: "c".repeat(64),
      lastSequence: 0,
      issuedAt: 1_777_200_000,
      notBefore: 1_777_200_000,
      expiresAt: 1_777_200_120,
    };
    expect(CONTINUATION_TOKEN_CLAIMS_SCHEMA.safeParse(claims).success).toBe(true);
    expect(CONTINUATION_TOKEN_CLAIMS_SCHEMA.safeParse({
      ...claims,
      actorUserId: SESSION_ID,
      careSpaceId: TURN_ID,
      childId: CHILD_ID,
    }).success).toBe(false);
  });
});
