import { base64url } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createAccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAuthorizedChildScopeFromTrustedRow } from "../../../../agent/lib/access/authorized-child-scope";
import type { AuthenticatedGuardian } from "../../../../agent/lib/access/authenticated-guardian";
import type { OwnedSessionRecord } from "../../../../agent/lib/access/session-record";
import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import type { AuthenticatedChannelRequest } from "../../../../src/channels/creciendo/auth-middleware";
import {
  createContinuationTokenKeyRing,
  issueContinuationToken,
} from "../../../../src/channels/creciendo/continuation-token";
import {
  createSessionStreamRouteDependencies,
  handleSessionStream,
  type PersistedChannelEvent,
  type SessionStreamRouteDependencies,
} from "../../../../src/channels/creciendo/routes/session-stream";
import { createSessionCreateRouteDependencies } from "../../../../src/channels/creciendo/routes/session-create";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const USER_ID = "10000000-0000-4000-8000-000000000001";
const CARE_SPACE_ID = "20000000-0000-4000-8000-000000000002";
const CHILD_ID = "30000000-0000-4000-8000-000000000003";
const SESSION_ID = "40000000-0000-4000-8000-000000000004";
const EVENT_1 = "50000000-0000-4000-8000-000000000005";
const EVENT_2 = "50000000-0000-4000-8000-000000000006";
const EVENT_3 = "50000000-0000-4000-8000-000000000007";
const TURN_ID = "60000000-0000-4000-8000-000000000006";

const guardian: AuthenticatedGuardian = Object.freeze({
  userId: USER_ID,
  issuedAt: new Date(NOW.getTime() - 60_000),
  expiresAt: new Date(NOW.getTime() + 600_000),
  authSessionId: "auth-session-stream-01",
  bearerToken: "header.payload.signature" as AuthenticatedGuardian["bearerToken"],
});

const auth = Object.freeze({
  requestId: "request-stream-route-01",
  actorKey: "a".repeat(64),
  rateClass: "stream" as const,
  profile: Object.freeze({ locale: "es-CO" as const, timeZone: "America/Bogota", versionSha256: "b".repeat(64) }),
  guardian,
}) satisfies AuthenticatedChannelRequest;

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: USER_ID,
  careSpaceId: CARE_SPACE_ID,
  childId: CHILD_ID,
  permissions: ["read", "record"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:2:a:7",
  issuedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 240_000),
});

const session: OwnedSessionRecord = Object.freeze({
  productSessionId: SESSION_ID,
  eveSessionId: "eve-session-stream-01",
  ownerUserId: scope.actorUserId,
  careSpaceId: scope.careSpaceId,
  childId: scope.childId,
  authorizationVersion: scope.authorizationVersion,
  authorizationExpiresAt: scope.expiresAt,
  status: "active",
  lastSequence: 3,
});

const keys = createContinuationTokenKeyRing({
  current: { kid: "continuation-stream-test", secret: base64url.encode(new Uint8Array(32).fill(29)) },
});
let continuationToken = "";

beforeAll(async () => {
  continuationToken = await issueContinuationToken({ scope, session, lastSequence: 1 }, keys, NOW);
});

function row(input: Readonly<{
  eventId: string;
  sequence: number;
  type: "text-delta" | "message-complete";
}>): PersistedChannelEvent {
  return Object.freeze({
    eventId: input.eventId,
    version: "creciendo.channel-event.v1",
    type: input.type,
    terminal: input.type === "message-complete",
    turnId: TURN_ID,
    sequence: input.sequence,
    occurredAt: `2026-08-24T12:00:0${input.sequence}.000Z`,
    cursor: input.eventId,
    data: input.type === "text-delta"
      ? { text: `fragment-${input.sequence}` }
      : { messageId: "70000000-0000-4000-8000-000000000007", outcome: "completed", effectState: "none" },
  });
}

function request(overrides: Readonly<Record<string, string>> = {}) {
  return new Request(`https://agent.test/creciendo/v1/sessions/${SESSION_ID}/stream`, {
    headers: {
      accept: "application/x-ndjson",
      "last-event-id": EVENT_1,
      "x-continuation-token": continuationToken,
      "x-creciendo-channel-version": "creciendo.channel.v1",
      "x-creciendo-event-version": "creciendo.channel-event.v1",
      ...overrides,
    },
  });
}

function dependencies(overrides: Partial<SessionStreamRouteDependencies> = {}): SessionStreamRouteDependencies {
  return {
    sessionId: SESSION_ID,
    continuationKeys: keys,
    now: () => NOW,
    pollIntervalMs: 1,
    maxDurationMs: 20,
    authorizeSession: vi.fn(async () => ({ scope, session })),
    revalidateSession: vi.fn(async () => ({ scope, session })),
    abortWork: vi.fn(),
    resolveCursor: vi.fn(async () => ({
      ok: true as const,
      afterSequence: 1,
      firstAvailableSequence: 1,
      lastSequence: 3,
      terminalEventId: EVENT_3,
    })),
    readEvents: vi.fn(async () => [
      row({ eventId: EVENT_2, sequence: 2, type: "text-delta" }),
      row({ eventId: EVENT_3, sequence: 3, type: "message-complete" }),
    ]),
    ...overrides,
  };
}

describe("authorized resumable session stream route", () => {
  it("authorizes and resolves the cursor before headers, then emits only later persisted events as NDJSON", async () => {
    const deps = dependencies();
    const response = await handleSessionStream(request(), auth, deps);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("x-creciendo-channel-version")).toBe("creciendo.channel.v1");
    expect(response.headers.get("x-creciendo-event-version")).toBe("creciendo.channel-event.v1");

    const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.map((event) => [event.eventId, event.sequence, event.terminal])).toEqual([
      [EVENT_2, 2, false],
      [EVENT_3, 3, true],
    ]);
    expect(JSON.stringify(lines)).not.toContain(EVENT_1);
    expect(deps.authorizeSession).toHaveBeenCalledBefore(deps.resolveCursor as ReturnType<typeof vi.fn>);
    expect(deps.resolveCursor).toHaveBeenCalledWith(expect.objectContaining({ cursor: EVENT_1, authorization: { scope, session } }));
    expect(deps.readEvents).toHaveBeenCalledWith(expect.objectContaining({ afterSequence: 1, limit: 128 }));
    expect(deps.readEvents).toHaveBeenCalledOnce();
  });

  it("uses the exact same derived continuation key identity as session creation", async () => {
    const config = Object.freeze({
      appEnv: "test",
      googleApiKey: "test-google-api-key-material",
      supabaseUrl: "https://project.test",
      supabasePublishableKey: "test-publishable-key-material",
      supabaseJwtIssuer: "https://project.test/auth/v1",
      supabaseJwtAudience: "authenticated",
      supabaseJwtJwksUrl: "https://project.test/auth/v1/.well-known/jwks.json",
      childContextSigningKey: base64url.encode(new Uint8Array(32).fill(41)),
      childContextSigningKid: "context-current-v1",
    }) satisfies RuntimeConfig;
    const createDependencies = createSessionCreateRouteDependencies(config);
    const streamDependencies = createSessionStreamRouteDependencies(config);
    const token = await issueContinuationToken({ scope, session, lastSequence: 1 }, createDependencies.continuationKeys, NOW);
    const response = await handleSessionStream(request({ "x-continuation-token": token }), auth, dependencies({
      continuationKeys: streamDependencies.continuationKeys,
    }));
    expect(response.status).toBe(200);
    await response.body?.cancel();
  });

  it("returns one indistinguishable access denial before cursor lookup or any stream bytes", async () => {
    const resolveCursor = vi.fn();
    const readEvents = vi.fn();
    const response = await handleSessionStream(request(), auth, dependencies({
      authorizeSession: vi.fn(async () => createAccessDenied(auth.requestId)),
      resolveCursor,
      readEvents,
    }));

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ ok: false, requestId: auth.requestId, error: { code: "ACCESS_DENIED" } });
    expect(resolveCursor).not.toHaveBeenCalled();
    expect(readEvents).not.toHaveBeenCalled();
  });

  it("rejects unsupported versions, forged continuations, invalid cursors and retention gaps before opening NDJSON", async () => {
    const readEvents = vi.fn();
    const unsupported = await handleSessionStream(request({ "x-creciendo-event-version": "creciendo.channel-event.v2" }), auth, dependencies({ readEvents }));
    expect(unsupported.status).toBe(409);
    expect(await unsupported.json()).toMatchObject({ error: { code: "VERSION_UNSUPPORTED" } });

    const forged = await handleSessionStream(request({ "x-continuation-token": `${continuationToken}x` }), auth, dependencies({ readEvents }));
    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({ error: { code: "REQUEST_INVALID" } });

    const invalid = await handleSessionStream(request(), auth, dependencies({
      readEvents,
      resolveCursor: vi.fn(async () => ({ ok: false as const, code: "CURSOR_INVALID" as const })),
    }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "REQUEST_INVALID" } });

    const gap = await handleSessionStream(request(), auth, dependencies({
      readEvents,
      resolveCursor: vi.fn(async () => ({ ok: false as const, code: "RETENTION_GAP" as const })),
    }));
    expect(gap.status).toBe(409);
    expect(await gap.json()).toMatchObject({ error: { code: "RETENTION_GAP", resumable: false } });
    expect(readEvents).not.toHaveBeenCalled();
  });

  it("fails closed before headers when the persisted page is malformed, duplicated or out of order", async () => {
    for (const page of [
      [{ ...row({ eventId: EVENT_2, sequence: 2, type: "text-delta" }), secret: "must-not-leak" }],
      [row({ eventId: EVENT_2, sequence: 2, type: "text-delta" }), row({ eventId: EVENT_2, sequence: 2, type: "text-delta" })],
      [row({ eventId: EVENT_3, sequence: 3, type: "message-complete" }), row({ eventId: EVENT_2, sequence: 2, type: "text-delta" })],
    ]) {
      const response = await handleSessionStream(request(), auth, dependencies({ readEvents: vi.fn(async () => page) }));
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(body).toContain("PERSISTENCE_UNAVAILABLE");
      expect(body).not.toContain("must-not-leak");
    }
  });

  it("polls without inventing events and disposes promptly when the reader disconnects", async () => {
    const readEvents = vi.fn()
      .mockResolvedValueOnce([row({ eventId: EVENT_2, sequence: 2, type: "text-delta" })])
      .mockResolvedValue([]);
    const response = await handleSessionStream(request(), auth, dependencies({ readEvents, maxDurationMs: 1_000 }));
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader!.read();
    expect(new TextDecoder().decode(first.value)).toContain(`"eventId":"${EVENT_2}"`);
    await reader!.cancel("private disconnect details");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(readEvents.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("closes a post-header source conflict without emitting the duplicate event or its details", async () => {
    const readEvents = vi.fn()
      .mockResolvedValueOnce([row({ eventId: EVENT_2, sequence: 2, type: "text-delta" })])
      .mockResolvedValueOnce([{ ...row({ eventId: EVENT_2, sequence: 3, type: "text-delta" }), data: { text: "private duplicate" } }]);
    const response = await handleSessionStream(request(), auth, dependencies({ readEvents, maxDurationMs: 1_000 }));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(`"eventId":"${EVENT_2}"`);
    await expect(reader.read()).rejects.toMatchObject({ code: "NDJSON_STREAM_FAILED" });
  });

  it("denies revocation or authorization-provider failure before cursor lookup and headers", async () => {
    for (const revalidateSession of [
      vi.fn(async () => createAccessDenied("revoked-private")),
      vi.fn(async () => { throw new Error("database and membership details"); }),
    ]) {
      const resolveCursor = vi.fn();
      const readEvents = vi.fn();
      const abortWork = vi.fn();
      const response = await handleSessionStream(request(), auth, dependencies({
        revalidateSession,
        resolveCursor,
        readEvents,
        abortWork,
      }));
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toContain("ACCESS_DENIED");
      expect(text).not.toContain("private");
      expect(text).not.toContain("membership");
      expect(resolveCursor).not.toHaveBeenCalled();
      expect(readEvents).not.toHaveBeenCalled();
      expect(abortWork).toHaveBeenCalledOnce();
    }
  });

  it("discards queued/live frames and aborts Eve exactly once when access is invalidated after headers", async () => {
    let invalidation!: () => void;
    let live = true;
    const revalidateSession = vi.fn(async () => live
      ? { scope, session }
      : createAccessDenied("revoked-private"));
    const abortWork = vi.fn();
    const readEvents = vi.fn()
      .mockResolvedValueOnce([row({ eventId: EVENT_2, sequence: 2, type: "text-delta" })])
      .mockResolvedValueOnce([row({ eventId: EVENT_3, sequence: 3, type: "message-complete" })]);
    const response = await handleSessionStream(request(), auth, dependencies({
      revalidateSession,
      abortWork,
      readEvents,
      pollIntervalMs: 1_000,
      maxDurationMs: 2_000,
      subscribeInvalidation(listener) {
        invalidation = listener;
        return () => undefined;
      },
    }));
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain(`"eventId":"${EVENT_2}"`);
    live = false;
    invalidation();
    await Promise.resolve();
    await Promise.resolve();
    await expect(reader.read()).rejects.toMatchObject({ code: "NDJSON_STREAM_ABORTED" });
    expect(first).not.toContain(EVENT_3);
    expect(readEvents).toHaveBeenCalledOnce();
    expect(abortWork).toHaveBeenCalledOnce();
  });

  it("fails closed if revocation invalidation cannot be subscribed", async () => {
    const readEvents = vi.fn();
    const response = await handleSessionStream(request(), auth, dependencies({
      readEvents,
      abortWork: vi.fn(),
      subscribeInvalidation() {
        throw new Error("realtime private details");
      },
    }));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("realtime");
    expect(readEvents).not.toHaveBeenCalled();
  });
});
