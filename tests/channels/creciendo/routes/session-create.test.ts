import { base64url } from "jose";
import { describe, expect, it, vi } from "vitest";

import { createAccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAuthorizedChildScopeFromTrustedRow } from "../../../../agent/lib/access/authorized-child-scope";
import type { AuthenticatedGuardian } from "../../../../agent/lib/access/authenticated-guardian";
import type { OwnedSessionRecord } from "../../../../agent/lib/access/session-record";
import type { AuthenticatedChannelRequest } from "../../../../src/channels/creciendo/auth-middleware";
import { createContinuationTokenKeyRing } from "../../../../src/channels/creciendo/continuation-token";
import {
  INITIAL_EVENT_CURSOR,
  createSerializedSessionCreateStore,
  handleCreateSession,
  type SessionCreateRouteDependencies,
} from "../../../../src/channels/creciendo/routes/session-create";
import { SESSION_CREATE_RESPONSE_SCHEMA } from "../../../../src/channels/creciendo/types";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const USER_ID = "10000000-0000-4000-8000-000000000001";
const CARE_SPACE_ID = "20000000-0000-4000-8000-000000000002";
const CHILD_ID = "30000000-0000-4000-8000-000000000003";
const SESSION_ID = "40000000-0000-4000-8000-000000000004";
const CONTEXT_TOKEN = "synthetic.child.context.token";

const guardian: AuthenticatedGuardian = Object.freeze({
  userId: USER_ID,
  issuedAt: new Date(NOW.getTime() - 60_000),
  expiresAt: new Date(NOW.getTime() + 600_000),
  authSessionId: "auth-session-01",
  bearerToken: "header.payload.signature" as AuthenticatedGuardian["bearerToken"],
});

const auth = Object.freeze({
  requestId: "request-01",
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

const keys = createContinuationTokenKeyRing({
  current: { kid: "continuation-test", secret: base64url.encode(new Uint8Array(32).fill(14)) },
});

function body(overrides: Record<string, unknown> = {}) {
  return {
    version: "creciendo.channel.v1",
    childContextToken: CONTEXT_TOKEN,
    locale: "es-CO",
    idempotencyKey: "session-create.01",
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
  return new Request("https://agent.test/creciendo/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

function dependencies(overrides: Partial<SessionCreateRouteDependencies> = {}): SessionCreateRouteDependencies {
  return {
    contextTokens: { verify: vi.fn(async () => ({
      actorUserId: scope.actorUserId,
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      permissions: scope.permissions,
      countryOfCare: scope.countryOfCare,
      timezone: scope.timezone,
      authorizationVersion: scope.authorizationVersion,
      tokenId: "50000000-0000-4000-8000-000000000005",
      issuedAt: scope.issuedAt,
      expiresAt: scope.expiresAt,
    })), issue: vi.fn() },
    reauthorize: vi.fn(async () => scope),
    sessions: { createOrReplay: vi.fn(async () => ({ ok: true as const, outcome: "created" as const, session })) },
    continuationKeys: keys,
    now: () => new Date(NOW),
    ...overrides,
  };
}

describe("POST /creciendo/v1/sessions", () => {
  it("creates one immutable product session shell and emits safe initial continuity without invoking Eve", async () => {
    const deps = dependencies();
    const response = await handleCreateSession(request(), auth, deps);
    expect(response.status).toBe(201);
    const payload = SESSION_CREATE_RESPONSE_SCHEMA.parse(await response.json());
    expect(payload).toMatchObject({
      version: "creciendo.channel.v1",
      requestId: "request-01",
      sessionId: SESSION_ID,
      cursor: INITIAL_EVENT_CURSOR,
      authorizationExpiresAt: "2026-08-24T12:04:00.000Z",
      capabilities: { channelVersion: "creciendo.channel.v1", eventVersion: "creciendo.channel-event.v1", ndjson: true },
    });
    expect(payload.continuationToken).toMatch(/^[^.]+\.[^.]+\.[^.]+$/u);
    expect(deps.contextTokens.verify).toHaveBeenCalledWith(CONTEXT_TOKEN, guardian, NOW);
    expect(deps.reauthorize).toHaveBeenCalledWith(expect.objectContaining({ childId: CHILD_ID }), auth, NOW);
    expect(deps.sessions.createOrReplay).toHaveBeenCalledWith(expect.objectContaining({
      scope,
      auth,
      idempotencyKey: "session-create.01",
      locale: "es-CO",
    }));
    expect(JSON.stringify(payload)).not.toMatch(/careSpaceId|childId|ownerUserId|permissions|authorizationVersion|eveSessionId|model|tool|prompt/iu);
  });

  it("returns the same session for identical replay and rejects a conflicting key without creating effects", async () => {
    const replay = dependencies({ sessions: { createOrReplay: vi.fn(async () => ({ ok: true as const, outcome: "idempotent_replay" as const, session })) } });
    expect((await handleCreateSession(request(), auth, replay)).status).toBe(200);
    const conflict = dependencies({ sessions: { createOrReplay: vi.fn(async () => ({ ok: false as const, code: "conflict" as const, effectState: "none" as const })) } });
    const denied = await handleCreateSession(request(), auth, conflict);
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({ code: "CONFLICT", effectState: "none" });
  });

  it("denies forged/expired/revoked/sibling context uniformly before persistence", async () => {
    for (const reason of ["forged", "expired", "revoked", "sibling"] as const) {
      const createOrReplay = vi.fn();
      const deps = dependencies({
        contextTokens: { verify: vi.fn(async () => createAccessDenied(reason)), issue: vi.fn() },
        sessions: { createOrReplay },
      });
      const response = await handleCreateSession(request(body({ idempotencyKey: `create.${reason}` })), auth, deps);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "ACCESS_DENIED" });
      expect(createOrReplay).not.toHaveBeenCalled();
    }
  });

  it("rejects unknown authority and unsupported versions before token verification", async () => {
    const verify = vi.fn();
    const deps = dependencies({ contextTokens: { verify, issue: vi.fn() } });
    const cases = [
      body({ childId: CHILD_ID }),
      body({ capabilities: { ...body().capabilities as object, channelVersions: ["creciendo.channel.v2"] } }),
      { ...body(), locale: "es-MX" },
    ];
    for (const candidate of cases) expect((await handleCreateSession(request(candidate), auth, deps)).status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it("fails closed on current-access, persistence and continuation failures without exposing causes", async () => {
    const cases = [
      dependencies({ reauthorize: vi.fn(async () => createAccessDenied("revoked")) }),
      dependencies({ sessions: { createOrReplay: vi.fn(async () => ({ ok: false as const, code: "unavailable" as const, effectState: "unknown" as const })) } }),
      dependencies({ continuationKeys: {} as never }),
    ];
    for (const deps of cases) {
      const response = await handleCreateSession(request(body({ idempotencyKey: crypto.randomUUID() })), auth, deps);
      expect([404, 503]).toContain(response.status);
      const payload = await response.json();
      expect(JSON.stringify(payload)).not.toMatch(/supabase|sql|jose|secret|stack|child-context/iu);
      if (response.status === 503) expect(["unknown", "committed"]).toContain(payload.effectState);
    }
  });

  it("converges concurrent identical calls in the session store contract", async () => {
    const execute = vi.fn(async () => {
      await Promise.resolve();
      return { ok: true as const, outcome: "created" as const, session };
    });
    const store = createSerializedSessionCreateStore(execute);
    const deps = dependencies({ sessions: store });
    const [first, second] = await Promise.all([
      handleCreateSession(request(), auth, deps),
      handleCreateSession(request(), auth, deps),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(execute).toHaveBeenCalledOnce();
    expect((await first.json()).sessionId).toBe((await second.json()).sessionId);
  });
});
