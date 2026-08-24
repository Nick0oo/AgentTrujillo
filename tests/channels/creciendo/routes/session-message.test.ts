import { base64url } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SendFn } from "eve/channels";

import { createAccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAuthorizedChildScopeFromTrustedRow } from "../../../../agent/lib/access/authorized-child-scope";
import type { AuthenticatedGuardian } from "../../../../agent/lib/access/authenticated-guardian";
import type { OwnedSessionRecord } from "../../../../agent/lib/access/session-record";
import type { AuthenticatedChannelRequest } from "../../../../src/channels/creciendo/auth-middleware";
import {
  createContinuationTokenKeyRing,
  issueContinuationToken,
} from "../../../../src/channels/creciendo/continuation-token";
import {
  createEveMessageDispatcher,
  createSerializedSessionMessageStore,
  handleSessionMessage,
  type SessionMessageRouteDependencies,
  type SessionMessageStoreInput,
} from "../../../../src/channels/creciendo/routes/session-message";
import {
  INITIAL_EVENT_CURSOR,
} from "../../../../src/channels/creciendo/routes/session-create";
import { SESSION_MESSAGE_RESPONSE_SCHEMA } from "../../../../src/channels/creciendo/types";
import { compileRedFlagPack } from "../../../../src/safety/compile-red-flag-pack";
import { SafetyPreflight } from "../../../../src/safety/preflight";
import { createTrustedSafetyContextFromAuthorizedScope } from "../../../../src/safety/safety-context";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const USER_ID = "10000000-0000-4000-8000-000000000001";
const CARE_SPACE_ID = "20000000-0000-4000-8000-000000000002";
const CHILD_ID = "30000000-0000-4000-8000-000000000003";
const SESSION_ID = "40000000-0000-4000-8000-000000000004";
const MESSAGE_ID = "50000000-0000-4000-8000-000000000005";
const TURN_ID = "60000000-0000-4000-8000-000000000006";
const EVE_SESSION_ID = "eve-session-internal-01";
const digest = "a".repeat(64);

const guardian: AuthenticatedGuardian = Object.freeze({
  userId: USER_ID,
  issuedAt: new Date(NOW.getTime() - 60_000),
  expiresAt: new Date(NOW.getTime() + 600_000),
  authSessionId: "auth-session-01",
  bearerToken: "header.payload.signature" as AuthenticatedGuardian["bearerToken"],
});

const auth = Object.freeze({
  requestId: "request-message-01",
  actorKey: "a".repeat(64),
  rateClass: "command" as const,
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
  eveSessionId: null,
  ownerUserId: scope.actorUserId,
  careSpaceId: scope.careSpaceId,
  childId: scope.childId,
  authorizationVersion: scope.authorizationVersion,
  authorizationExpiresAt: scope.expiresAt,
  status: "active",
  lastSequence: 0,
});

const boundSession: OwnedSessionRecord = Object.freeze({ ...session, eveSessionId: EVE_SESSION_ID });
const trustedContext = createTrustedSafetyContextFromAuthorizedScope(scope, {
  chronologicalAgeDays: 30,
  locale: "es-CO",
  timezone: scope.timezone,
  referenceInstant: NOW,
});
const keys = createContinuationTokenKeyRing({
  current: { kid: "continuation-message-test", secret: base64url.encode(new Uint8Array(32).fill(19)) },
});
let continuationToken = "";

const pack = compileRedFlagPack({
  verification: "synthetic_test_only",
  pack: {
    schemaVersion: "emergency-pack-v1",
    packageId: "synthetic-co-message-route",
    jurisdiction: "CO",
    locale: "es-CO",
    version: "1.0.0",
    effectiveFrom: "2026-01-01T00:00:00Z",
    effectiveUntil: null,
    algorithm: { key: "synthetic-safety", version: "1.0.0", implementationSha256: digest },
    sources: [{ id: "synthetic-source", digestSha256: digest }],
    copyKeys: ["emergency_department_es_co_v1"],
    approval: { status: "synthetic_test_only", artifactSha256: digest, approvalId: "synthetic-approval" },
    concepts: [{ id: "variant.breathing", patterns: ["respirar"] }],
    rules: [{
      code: "synthetic-breathing",
      priority: 100,
      population: { country: "CO" },
      predicate: { kind: "concept", conceptId: "variant.breathing", assertion: ["present"] },
      ambiguityPolicy: "abstain",
      decision: "urgent",
      copyKey: "emergency_department_es_co_v1",
      sourceIds: ["synthetic-source"],
    }],
  },
});

beforeAll(async () => {
  continuationToken = await issueContinuationToken({ scope, session, lastSequence: 0 }, keys, NOW);
});

function body(overrides: Record<string, unknown> = {}) {
  return {
    version: "creciendo.channel.v1",
    continuationToken,
    clientMessageId: MESSAGE_ID,
    idempotencyKey: "message.command.01",
    parts: [{ type: "text", text: "Necesito orientación general." }],
    capabilities: {
      channelVersions: ["creciendo.channel.v1"],
      eventVersions: ["creciendo.channel-event.v1"],
      widgetVersions: ["growth.summary.v1"],
      ndjson: true,
    },
    ...overrides,
  };
}

function request(value: unknown = body()) {
  return new Request(`https://agent.test/creciendo/v1/sessions/${SESSION_ID}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

function dependencies(overrides: Partial<SessionMessageRouteDependencies> = {}): SessionMessageRouteDependencies {
  return {
    sessionId: SESSION_ID,
    authorizeSession: vi.fn(async () => ({ scope, session, trustedContext })),
    revalidateSession: vi.fn(async () => true),
    messages: {
      acceptOrReplay: vi.fn(async () => ({
        ok: true as const,
        outcome: "created" as const,
        dispatchRequired: true,
        session,
        messageId: MESSAGE_ID,
        turnId: TURN_ID,
        acceptedAt: NOW,
        cursor: INITIAL_EVENT_CURSOR,
      })),
    },
    preflight: new SafetyPreflight(),
    packages: { resolve: vi.fn(async () => pack) },
    eve: {
      resolve: vi.fn(async () => null),
      dispatch: vi.fn(async () => ({ eveSessionId: EVE_SESSION_ID })),
    },
    bindEveSession: vi.fn(async () => boundSession),
    continuationKeys: keys,
    now: () => new Date(NOW),
    ...overrides,
  };
}

describe("POST /creciendo/v1/sessions/:sessionId/messages", () => {
  it("reauthorizes, runs synchronous safety, persists once and only then starts/binds Eve", async () => {
    const order: string[] = [];
    const deps = dependencies({
      authorizeSession: vi.fn(async () => { order.push("authorize"); return { scope, session, trustedContext }; }),
      revalidateSession: vi.fn(async () => { order.push("revalidate"); return true; }),
      packages: { resolve: vi.fn(async () => { order.push("safety"); return pack; }) },
      messages: { acceptOrReplay: vi.fn(async () => {
        order.push("persist");
        return { ok: true as const, outcome: "created" as const, dispatchRequired: true, session, messageId: MESSAGE_ID, turnId: TURN_ID, acceptedAt: NOW, cursor: INITIAL_EVENT_CURSOR };
      }) },
      eve: {
        resolve: vi.fn(async () => null),
        dispatch: vi.fn(async () => { order.push("eve"); return { eveSessionId: EVE_SESSION_ID }; }),
      },
      bindEveSession: vi.fn(async () => { order.push("bind"); return boundSession; }),
    });

    const response = await handleSessionMessage(request(), auth, deps);
    expect(response.status).toBe(202);
    const payload = SESSION_MESSAGE_RESPONSE_SCHEMA.parse(await response.json());
    expect(payload).toMatchObject({
      version: "creciendo.channel.v1",
      requestId: auth.requestId,
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      messageId: MESSAGE_ID,
      outcome: "accepted",
      cursor: INITIAL_EVENT_CURSOR,
    });
    expect(order).toEqual(["authorize", "revalidate", "safety", "revalidate", "persist", "revalidate", "eve", "bind"]);
    expect(deps.messages.acceptOrReplay).toHaveBeenCalledWith(expect.objectContaining({
      kind: "continue",
      sessionId: SESSION_ID,
      clientMessageId: MESSAGE_ID,
      parts: [{ type: "text", text: "Necesito orientación general." }],
    }));
    expect(JSON.stringify(payload)).not.toMatch(/careSpace|childId|ownerUser|permission|eveSession|prompt|reasoning|tool/iu);
  });

  it("persists one emergency-only terminal event with no Eve, model, tool or workflow invocation", async () => {
    const acceptOrReplay = vi.fn(async (input: SessionMessageStoreInput) => ({
      ok: true as const,
      outcome: "created" as const,
      dispatchRequired: false,
      session: Object.freeze({ ...session, lastSequence: 1 }),
      messageId: MESSAGE_ID,
      turnId: TURN_ID,
      acceptedAt: NOW,
      cursor: "70000000-0000-4000-8000-000000000007",
    }));
    const eve = { resolve: vi.fn(), dispatch: vi.fn() };
    const bindEveSession = vi.fn();
    const deps = dependencies({ messages: { acceptOrReplay }, eve, bindEveSession });
    const response = await handleSessionMessage(request(body({
      parts: [{ type: "text", text: "Mi hijo no puede respirar" }],
    })), auth, deps);

    expect(acceptOrReplay).toHaveBeenCalledOnce();
    expect(response.status).toBe(202);
    const stored = acceptOrReplay.mock.calls[0]![0];
    expect(stored.kind).toBe("emergency");
    expect(JSON.stringify(stored)).not.toContain("Mi hijo no puede respirar");
    expect(stored).toMatchObject({
      terminalEvent: {
        type: "emergency-recommendation",
        terminal: true,
        widget: { kind: "emergency_recommendation", version: "emergency.recommendation.v1" },
      },
    });
    expect(eve.resolve).not.toHaveBeenCalled();
    expect(eve.dispatch).not.toHaveBeenCalled();
    expect(bindEveSession).not.toHaveBeenCalled();
  });

  it("denies guessed sessions, forged continuations and live revocation without enumeration or effects", async () => {
    const cases: SessionMessageRouteDependencies[] = [
      dependencies({ authorizeSession: vi.fn(async () => createAccessDenied("guessed")) }),
      dependencies(),
      dependencies({ revalidateSession: vi.fn(async () => false) }),
    ];
    const requests = [
      request(),
      request(body({ continuationToken: `${continuationToken}x` })),
      request(),
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const response = await handleSessionMessage(requests[index]!, auth, cases[index]!);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "ACCESS_DENIED", effectState: "none" });
      expect(cases[index]!.messages.acceptOrReplay).not.toHaveBeenCalled();
      expect(cases[index]!.eve.dispatch).not.toHaveBeenCalled();
    }
  });

  it("rechecks revocation when consuming the safety permit and before Eve", async () => {
    for (const results of [[true, false], [true, true, false]] as const) {
      const revalidateSession = vi.fn();
      for (const result of results) revalidateSession.mockResolvedValueOnce(result);
      const deps = dependencies({ revalidateSession });
      const response = await handleSessionMessage(request(body({ idempotencyKey: crypto.randomUUID() })), auth, deps);
      expect(response.status).toBe(404);
      const payload = await response.json();
      expect(payload).toMatchObject({
        code: "ACCESS_DENIED",
        effectState: results.length === 2 ? "none" : "committed",
        resumable: false,
      });
      expect(deps.eve.dispatch).not.toHaveBeenCalled();
      expect(deps.messages.acceptOrReplay).toHaveBeenCalledTimes(results.length === 2 ? 0 : 1);
    }
  });

  it("rejects unknown authority, malformed content and unsupported versions before session lookup", async () => {
    const authorizeSession = vi.fn();
    const deps = dependencies({ authorizeSession });
    const oversized = "x".repeat(16_001);
    const cases = [
      body({ childId: CHILD_ID }),
      body({ parts: [{ type: "text", text: "e\u0301" }] }),
      body({ parts: [{ type: "text", text: oversized }] }),
      body({ capabilities: { ...body().capabilities as object, eventVersions: ["creciendo.channel-event.v2"] } }),
    ];
    for (const candidate of cases) expect((await handleSessionMessage(request(candidate), auth, deps)).status).toBe(400);
    expect(authorizeSession).not.toHaveBeenCalled();
  });

  it("fails closed when the governed safety package is unavailable before persistence/Eve", async () => {
    const deps = dependencies({ packages: { resolve: vi.fn(async () => null) } });
    const response = await handleSessionMessage(request(), auth, deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "PROVIDER_UNAVAILABLE", effectState: "none", retryable: true });
    expect(deps.messages.acceptOrReplay).not.toHaveBeenCalled();
    expect(deps.eve.dispatch).not.toHaveBeenCalled();
  });

  it("reports a committed input truthfully when Eve fails and never redispatches its replay", async () => {
    const dispatch = vi.fn(async () => { throw new Error("provider details"); });
    const firstDeps = dependencies({ eve: { resolve: vi.fn(async () => null), dispatch } });
    const failed = await handleSessionMessage(request(), auth, firstDeps);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ code: "PROVIDER_UNAVAILABLE", effectState: "committed", retryable: false });

    const replayDeps = dependencies({
      messages: { acceptOrReplay: vi.fn(async () => ({ ok: true as const, outcome: "idempotent_replay" as const, dispatchRequired: false, session, messageId: MESSAGE_ID, turnId: TURN_ID, acceptedAt: NOW, cursor: INITIAL_EVENT_CURSOR })) },
      eve: { resolve: vi.fn(async () => null), dispatch },
    });
    const replay = await handleSessionMessage(request(), auth, replayDeps);
    expect(replay.status).toBe(200);
    expect((await replay.json()).outcome).toBe("idempotent_replay");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("maps persistence conflicts/outages and Eve-binding uncertainty without internal details", async () => {
    const cases = [
      dependencies({ messages: { acceptOrReplay: vi.fn(async () => ({ ok: false as const, code: "conflict" as const, effectState: "none" as const })) } }),
      dependencies({ messages: { acceptOrReplay: vi.fn(async () => ({ ok: false as const, code: "unavailable" as const, effectState: "unknown" as const })) } }),
      dependencies({ bindEveSession: vi.fn(async () => { throw new Error("database bind details"); }) }),
    ];
    for (const deps of cases) {
      const response = await handleSessionMessage(request(body({ idempotencyKey: crypto.randomUUID() })), auth, deps);
      expect([409, 503]).toContain(response.status);
      const text = await response.text();
      expect(text).not.toMatch(/database|supabase|sql|bind details|stack/iu);
      expect(JSON.parse(text)).toMatchObject({ code: expect.stringMatching(/CONFLICT|PERSISTENCE_UNAVAILABLE/u) });
    }
  });

  it("uses Eve 0.27.13 send/resolve APIs with a private product-bound token and minimal principal", async () => {
    const send = vi.fn<SendFn>(async () => ({
      id: EVE_SESSION_ID,
      continuationToken: "internal",
      cancel: vi.fn(async () => ({ status: "accepted" as const })),
      getEventStream: vi.fn(async () => new ReadableStream()),
      getStreamTailIndex: vi.fn(async () => -1),
    }));
    const resolveActiveSession = vi.fn(async () => undefined);
    const getSession = vi.fn();
    const dispatcher = createEveMessageDispatcher({ send, resolveActiveSession, getSession }, {
      appEnv: "test",
      googleApiKey: "synthetic-google-key-123456789",
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "synthetic-publishable-key-123456789",
      supabaseJwtIssuer: "https://project.supabase.co/auth/v1",
      supabaseJwtAudience: "authenticated",
      supabaseJwtJwksUrl: "https://project.supabase.co/auth/v1/.well-known/jwks.json",
      childContextSigningKey: base64url.encode(new Uint8Array(32).fill(23)),
      childContextSigningKid: "context-current",
    });
    expect(await dispatcher.dispatch({ session, auth, parts: [{ type: "text", text: "orientación" }] })).toEqual({ eveSessionId: EVE_SESSION_ID });
    expect(send).toHaveBeenCalledOnce();
    const [input, options] = send.mock.calls[0]!;
    expect(input).toEqual([{ type: "text", text: "orientación" }]);
    expect(options).toMatchObject({
      mode: "conversation",
      title: "Creciendo session",
      auth: { authenticator: "supabase-jwt", principalId: USER_ID, principalType: "user", attributes: {} },
    });
    expect(options.continuationToken).toMatch(/^creciendo\.eve\.v1\.[A-Za-z0-9_-]{43}$/u);
    expect(options.continuationToken).not.toContain(SESSION_ID);
    expect(JSON.stringify(options)).not.toMatch(/bearerToken|careSpace|childId|permission|authorizationVersion/iu);
  });

  it("converges concurrent identical persistence attempts and rejects conflicting reuse", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn(async () => {
      await gate;
      return { ok: true as const, outcome: "created" as const, dispatchRequired: true, session, messageId: MESSAGE_ID, turnId: TURN_ID, acceptedAt: NOW, cursor: INITIAL_EVENT_CURSOR };
    });
    const store = createSerializedSessionMessageStore(execute);
    const base = {
      kind: "continue" as const,
      scope,
      session,
      auth,
      sessionId: SESSION_ID,
      clientMessageId: MESSAGE_ID,
      idempotencyKeySha256: "c".repeat(64),
      requestSha256: "d".repeat(64),
      parts: [{ type: "text" as const, text: "texto" }],
      now: NOW,
    };
    const firstPromise = store.acceptOrReplay(base);
    const secondPromise = store.acceptOrReplay(base);
    const conflictPromise = store.acceptOrReplay({ ...base, requestSha256: "e".repeat(64) });
    release();
    const [first, second, conflict] = await Promise.all([firstPromise, secondPromise, conflictPromise]);
    expect(execute).toHaveBeenCalledOnce();
    expect(first).toMatchObject({ ok: true, outcome: "created" });
    expect(second).toMatchObject({ ok: true, outcome: "idempotent_replay", dispatchRequired: false });
    expect(conflict).toMatchObject({ ok: false, code: "conflict", effectState: "none" });
  });
});
