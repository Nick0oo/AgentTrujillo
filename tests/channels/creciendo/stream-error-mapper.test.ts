import { describe, expect, it } from "vitest";

import { mapToolError } from "../../../agent/lib/runtime/safe-tool-errors";
import { NdjsonEncoderError } from "../../../src/channels/creciendo/ndjson-encoder";
import {
  mapInStreamError,
  mapPreStreamError,
  type InStreamErrorContext,
  type PreStreamErrorContext,
} from "../../../src/channels/creciendo/stream-error-mapper";

const REQUEST_ID = "request-stream-01";
const ERROR_ID = "90000000-0000-4000-8000-000000000009";
const EVENT_ID = "30000000-0000-4000-8000-000000000003";
const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const TURN_ID = "20000000-0000-4000-8000-000000000002";
const CURSOR = "opaque-cursor-value-0000000000000001";

function pre(overrides: Partial<PreStreamErrorContext> = {}): PreStreamErrorContext {
  return {
    requestId: REQUEST_ID,
    errorId: ERROR_ID,
    effectState: "none",
    persistedSequence: null,
    persistedCursor: null,
    retryAfterSeconds: null,
    ...overrides,
  };
}

function inside(overrides: Partial<InStreamErrorContext> = {}): InStreamErrorContext {
  return {
    ...pre(),
    eventId: EVENT_ID,
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    sequence: 7,
    occurredAt: "2026-08-24T17:00:00.000Z",
    cursor: `${CURSOR}:7`,
    ...overrides,
  };
}

describe("phase-aware safe stream error mapper", () => {
  it("maps a transient pre-header provider failure to a retryable safe HTTP projection", () => {
    const result = mapPreStreamError(Object.assign(new Error("raw provider stack"), {
      code: "PROVIDER_UNAVAILABLE",
      stack: "secret stack",
    }), pre());

    expect(result).toEqual({
      phase: "before-headers",
      correlationId: ERROR_ID,
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-error-id": ERROR_ID,
        "x-request-id": REQUEST_ID,
      },
      body: {
        ok: false,
        requestId: REQUEST_ID,
        error: {
          version: "creciendo.error.v1",
          code: "PROVIDER_UNAVAILABLE",
          retryable: true,
          retryAfterSeconds: null,
          effectState: "none",
          resumable: false,
        },
      },
      retry: { disposition: "retry-request", afterSeconds: null, cursor: null },
    });
    expect(JSON.stringify(result)).not.toMatch(/raw provider|stack|secret/iu);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("bounds rate-limit retry delay and never advertises delay for another code", () => {
    const limited = mapPreStreamError({ code: "RATE_LIMITED", details: "private" }, pre({ retryAfterSeconds: 45 }));
    const invalidDelay = mapPreStreamError({ code: "PROVIDER_UNAVAILABLE" }, pre({ retryAfterSeconds: 999 }));

    expect(limited).toMatchObject({
      status: 429,
      headers: { "retry-after": "45" },
      body: { error: { code: "RATE_LIMITED", retryable: true, retryAfterSeconds: 45 } },
      retry: { disposition: "retry-request", afterSeconds: 45 },
    });
    expect(invalidDelay).toMatchObject({
      body: { error: { code: "PROVIDER_UNAVAILABLE", retryAfterSeconds: null } },
    });
    expect(invalidDelay.headers).not.toHaveProperty("retry-after");
  });

  it("makes guessed/not-found/revoked session failures indistinguishable and non-resumable", () => {
    const codes = ["SESSION_NOT_FOUND", "ACCESS_DENIED", "TOKEN_REVOKED", "CHILD_ACCESS_REVOKED"];
    const results = codes.map((code) => mapPreStreamError({ code, message: `private-${code}` }, pre({
      persistedSequence: 6,
      persistedCursor: `${CURSOR}:6`,
    })));

    for (const result of results) {
      expect(result).toMatchObject({
        status: 404,
        body: { error: { code: "ACCESS_DENIED", retryable: false, resumable: false } },
        retry: { disposition: "do-not-retry", cursor: null },
      });
    }
    expect(new Set(results.map((result) => JSON.stringify(result.body.error))).size).toBe(1);
    expect(JSON.stringify(results)).not.toContain("private-");
  });

  it("distinguishes request/cursor/version and retention classes without internal detail", () => {
    expect(mapPreStreamError({ code: "CURSOR_INVALID" }, pre())).toMatchObject({
      status: 400,
      body: { error: { code: "REQUEST_INVALID", resumable: false } },
    });
    expect(mapPreStreamError({ code: "VERSION_UNSUPPORTED" }, pre())).toMatchObject({
      status: 409,
      body: { error: { code: "VERSION_UNSUPPORTED", resumable: false } },
    });
    expect(mapPreStreamError({ code: "RETENTION_GAP", details: { oldestSequence: 4 } }, pre({
      persistedSequence: 8,
      persistedCursor: `${CURSOR}:8`,
    }))).toMatchObject({
      status: 409,
      body: { error: { code: "RETENTION_GAP", resumable: false } },
      retry: { disposition: "do-not-retry", cursor: null },
    });
  });

  it("maps a post-header failure to exactly one strict terminal stream-error event", () => {
    const result = mapInStreamError({ code: "PROVIDER_UNAVAILABLE", message: "provider internals" }, inside({
      persistedSequence: 6,
      persistedCursor: `${CURSOR}:6`,
    }));

    expect(result).toEqual({
      phase: "after-headers",
      correlationId: ERROR_ID,
      event: {
        version: "creciendo.channel-event.v1",
        eventId: EVENT_ID,
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        sequence: 7,
        occurredAt: "2026-08-24T17:00:00.000Z",
        cursor: `${CURSOR}:7`,
        type: "stream-error",
        terminal: true,
        data: {
          error: {
            version: "creciendo.error.v1",
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            retryAfterSeconds: null,
            effectState: "none",
            resumable: true,
          },
        },
      },
      retry: { disposition: "resume-stream", afterSeconds: null, cursor: `${CURSOR}:6` },
    });
    expect(JSON.stringify(result)).not.toContain("provider internals");
  });

  it("blocks retry and resume when effect truth is ambiguous even with a cursor", () => {
    const result = mapInStreamError({ code: "PERSISTENCE_UNAVAILABLE" }, inside({
      effectState: "unknown",
      persistedSequence: 6,
      persistedCursor: `${CURSOR}:6`,
    }));

    expect(result).toMatchObject({
      event: { data: { error: { retryable: false, effectState: "unknown", resumable: false } } },
      retry: { disposition: "do-not-retry", cursor: null },
    });
  });

  it("allows resume but never command retry after a known committed effect", () => {
    const result = mapInStreamError({ code: "TIMEOUT" }, inside({
      effectState: "committed",
      persistedSequence: 6,
      persistedCursor: `${CURSOR}:6`,
    }));

    expect(result).toMatchObject({
      event: { data: { error: { code: "TIMEOUT", retryable: false, effectState: "committed", resumable: true } } },
      retry: { disposition: "resume-stream", cursor: `${CURSOR}:6` },
    });
  });

  it("maps SafeToolError/encoder/abort/unknown causes without localization-dependent text", () => {
    const safeTool = mapToolError({ code: "TIMEOUT", message: "private" }, { effectState: "none" });
    const causes = [
      safeTool,
      new NdjsonEncoderError("NDJSON_EVENT_INVALID"),
      new NdjsonEncoderError("NDJSON_STREAM_ABORTED"),
      Object.assign(new Error("private abort"), { name: "AbortError" }),
      { code: "UNRECOGNIZED", localeText: "mensaje privado" },
    ];
    const codes = causes.map((cause) => mapPreStreamError(cause, pre()).body.error.code);

    expect(codes).toEqual([
      "TIMEOUT",
      "INTERNAL_UNAVAILABLE",
      "CANCELLED",
      "CANCELLED",
      "INTERNAL_UNAVAILABLE",
    ]);
    const spanish = mapPreStreamError({ code: "PROVIDER_UNAVAILABLE", message: "No disponible" }, pre());
    const english = mapPreStreamError({ code: "PROVIDER_UNAVAILABLE", message: "Unavailable" }, pre());
    expect(spanish.body.error).toEqual(english.body.error);
    expect(JSON.stringify([spanish, english])).not.toContain("No disponible");
    expect(JSON.stringify([spanish, english])).not.toContain("\"Unavailable\"");
  });

  it("contains hostile getters and invalid trusted context as code-only failures", () => {
    const hostile = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostile, "code", { get() { throw new Error("getter secret"); } });
    const raw = mapPreStreamError(hostile, pre());
    const invalidEvent = mapInStreamError(hostile, inside({ eventId: "not-a-uuid" }));

    expect(raw).toMatchObject({ body: { error: { code: "INTERNAL_UNAVAILABLE" } } });
    expect(invalidEvent).toMatchObject({
      phase: "after-headers",
      correlationId: ERROR_ID,
      event: null,
      retry: { disposition: "do-not-retry" },
    });
    expect(JSON.stringify([raw, invalidEvent])).not.toContain("getter secret");
  });
});
