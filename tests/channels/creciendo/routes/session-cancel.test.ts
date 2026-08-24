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
  createEveCancellationPort,
  createSessionCancelRouteDependencies,
  handleCancelSession,
  type SessionCancelRouteDependencies,
} from "../../../../src/channels/creciendo/routes/session-cancel";
import { createSessionCreateRouteDependencies } from "../../../../src/channels/creciendo/routes/session-create";
import { SESSION_CANCEL_RESPONSE_SCHEMA } from "../../../../src/channels/creciendo/types";

const NOW = new Date("2026-08-24T13:00:00.000Z");
const USER_ID = "10000000-0000-4000-8000-000000000001";
const CARE_SPACE_ID = "20000000-0000-4000-8000-000000000002";
const CHILD_ID = "30000000-0000-4000-8000-000000000003";
const SESSION_ID = "40000000-0000-4000-8000-000000000004";
const OPERATION_ID = "50000000-0000-4000-8000-000000000005";
const TURN_ID = "60000000-0000-4000-8000-000000000006";
const CURSOR = "70000000-0000-4000-8000-000000000007";

const guardian: AuthenticatedGuardian = Object.freeze({
  userId: USER_ID,
  issuedAt: new Date(NOW.getTime() - 60_000),
  expiresAt: new Date(NOW.getTime() + 600_000),
  authSessionId: "auth-session-cancel-01",
  bearerToken: "header.payload.signature" as AuthenticatedGuardian["bearerToken"],
});

const auth = Object.freeze({
  requestId: "request-cancel-route-01",
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
  eveSessionId: "eve-session-cancel-01",
  ownerUserId: scope.actorUserId,
  careSpaceId: scope.careSpaceId,
  childId: scope.childId,
  authorizationVersion: scope.authorizationVersion,
  authorizationExpiresAt: scope.expiresAt,
  status: "active",
  lastSequence: 1,
});

const keys = createContinuationTokenKeyRing({
  current: { kid: "continuation-cancel-test", secret: base64url.encode(new Uint8Array(32).fill(31)) },
});
let continuationToken = "";

beforeAll(async () => {
  continuationToken = await issueContinuationToken({ scope, session, lastSequence: 1 }, keys, NOW);
});

function body(overrides: Record<string, unknown> = {}) {
  return {
    version: "creciendo.channel.v1",
    continuationToken,
    operationId: OPERATION_ID,
    reason: "user_requested",
    idempotencyKey: "cancel.command.01",
    ...overrides,
  };
}

function request(value: unknown = body(), signal?: AbortSignal) {
  return new Request(`https://agent.test/creciendo/v1/sessions/${SESSION_ID}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
    signal,
  });
}

function dependencies(overrides: Partial<SessionCancelRouteDependencies> = {}): SessionCancelRouteDependencies {
  return {
    sessionId: SESSION_ID,
    continuationKeys: keys,
    now: () => NOW,
    authorizeSession: vi.fn(async () => ({ scope, session })),
    store: {
      acceptOrReplay: vi.fn(async () => ({
        ok: true as const,
        outcome: "created" as const,
        finalizeRequired: true,
        operationId: OPERATION_ID,
        turnId: TURN_ID,
        acceptedAt: NOW,
        cancellationOutcome: null,
        effectState: null,
        cursor: CURSOR,
        session,
      })),
      finalizeOrReplay: vi.fn(async (_input) => ({
        ok: true as const,
        outcome: "created" as const,
        operationId: OPERATION_ID,
        turnId: TURN_ID,
        cancellationOutcome: "requested" as const,
        effectState: "unknown" as const,
        occurredAt: NOW,
        cursor: CURSOR,
        session: Object.freeze({ ...session, lastSequence: 2 }),
      })),
    },
    eve: { cancel: vi.fn(async () => ({ status: "accepted" as const })) },
    ...overrides,
  };
}

describe("safe idempotent Creciendo cancellation route", () => {
  it("accepts the durable ticket before signaling the exact Eve turn, then finalizes truthful unknown effect", async () => {
    const deps = dependencies();
    const response = await handleCancelSession(request(), auth, deps);
    expect(response.status).toBe(202);
    expect(SESSION_CANCEL_RESPONSE_SCHEMA.parse(await response.json())).toMatchObject({
      version: "creciendo.channel.v1",
      requestId: auth.requestId,
      sessionId: SESSION_ID,
      operationId: OPERATION_ID,
      outcome: "requested",
      effectState: "unknown",
      cursor: CURSOR,
    });
    expect(deps.store.acceptOrReplay).toHaveBeenCalledBefore(deps.eve.cancel as ReturnType<typeof vi.fn>);
    expect(deps.eve.cancel).toHaveBeenCalledWith(expect.objectContaining({ authorization: { scope, session }, turnId: TURN_ID }));
    expect(deps.store.finalizeOrReplay).toHaveBeenCalledWith(expect.objectContaining({
      cancellationOutcome: "requested",
      effectState: "unknown",
    }));
  });

  it("shares continuation-key derivation with create and uses Eve 0.27.13 session cancellation with the exact turn guard", async () => {
    const config = Object.freeze({
      appEnv: "test",
      googleApiKey: "test-google-api-key-material",
      supabaseUrl: "https://project.test",
      supabasePublishableKey: "test-publishable-key-material",
      supabaseJwtIssuer: "https://project.test/auth/v1",
      supabaseJwtAudience: "authenticated",
      supabaseJwtJwksUrl: "https://project.test/auth/v1/.well-known/jwks.json",
      childContextSigningKey: base64url.encode(new Uint8Array(32).fill(43)),
      childContextSigningKid: "context-current-v1",
    }) satisfies RuntimeConfig;
    const createDependencies = createSessionCreateRouteDependencies(config);
    const cancelDependencies = createSessionCancelRouteDependencies(config);
    const token = await issueContinuationToken({ scope, session, lastSequence: 1 }, createDependencies.continuationKeys, NOW);
    const sessionCancel = vi.fn(async () => ({ status: "accepted" as const }));
    const getSession = vi.fn(() => ({ continuationToken: "eve-local-token", cancel: sessionCancel }));
    const resolveActiveSession = vi.fn(async () => ({ sessionId: session.eveSessionId! }));
    const routeCancel = vi.fn();
    const port = createEveCancellationPort({ cancel: routeCancel, resolveActiveSession, getSession } as never, config);

    const response = await handleCancelSession(request(body({ continuationToken: token })), auth, dependencies({
      continuationKeys: cancelDependencies.continuationKeys,
      eve: port,
    }));
    expect(response.status).toBe(202);
    expect(getSession).toHaveBeenCalledWith(session.eveSessionId);
    expect(resolveActiveSession).toHaveBeenCalledWith({ continuationToken: "eve-local-token" });
    expect(sessionCancel).toHaveBeenCalledWith({ turnId: TURN_ID });
    expect(routeCancel).not.toHaveBeenCalled();
  });

  it("uses only the derived channel-local token for an unbound Eve session and ignores stale owners", async () => {
    const config = Object.freeze({
      appEnv: "test",
      googleApiKey: "test-google-api-key-material",
      supabaseUrl: "https://project.test",
      supabasePublishableKey: "test-publishable-key-material",
      supabaseJwtIssuer: "https://project.test/auth/v1",
      supabaseJwtAudience: "authenticated",
      supabaseJwtJwksUrl: "https://project.test/auth/v1/.well-known/jwks.json",
      childContextSigningKey: base64url.encode(new Uint8Array(32).fill(47)),
      childContextSigningKid: "context-current-v1",
    }) satisfies RuntimeConfig;
    const unbound = Object.freeze({ ...session, eveSessionId: null });
    const routeCancel = vi.fn(async () => ({ status: "accepted" as const }));
    const resolveActiveSession = vi.fn(async ({ continuationToken }: { continuationToken: string }) =>
      continuationToken.startsWith("creciendo.eve.v1.") ? { sessionId: "eve-derived" } : undefined);
    const getSession = vi.fn();
    const port = createEveCancellationPort({ cancel: routeCancel, resolveActiveSession, getSession } as never, config);
    expect(await port.cancel({ authorization: { scope, session: unbound }, turnId: TURN_ID })).toEqual({ status: "accepted" });
    expect(routeCancel).toHaveBeenCalledWith({
      continuationToken: expect.stringMatching(/^creciendo\.eve\.v1\.[A-Za-z0-9_-]+$/u),
      turnId: TURN_ID,
    });
    expect(getSession).not.toHaveBeenCalled();

    const staleSession = Object.freeze({ ...session, eveSessionId: "eve-stale" });
    const stalePort = createEveCancellationPort({
      cancel: routeCancel,
      resolveActiveSession: vi.fn(async () => ({ sessionId: "eve-new-owner" })),
      getSession: vi.fn(() => ({ continuationToken: "stale-token", cancel: vi.fn() })),
    } as never, config);
    expect(await stalePort.cancel({ authorization: { scope, session: staleSession }, turnId: TURN_ID })).toEqual({ status: "no_active_turn" });
  });

  it("never signals Eve or appends another terminal event when emergency/completion is already terminal", async () => {
    const eve = { cancel: vi.fn() };
    const finalizeOrReplay = vi.fn();
    const deps = dependencies({
      eve,
      store: {
        acceptOrReplay: vi.fn(async () => ({
          ok: true as const,
          outcome: "created" as const,
          finalizeRequired: false,
          operationId: OPERATION_ID,
          turnId: TURN_ID,
          acceptedAt: NOW,
          cancellationOutcome: "already_terminal" as const,
          effectState: "committed" as const,
          cursor: CURSOR,
          session: Object.freeze({ ...session, lastSequence: 2 }),
        })),
        finalizeOrReplay,
      },
    });
    const response = await handleCancelSession(request(), auth, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "already_terminal", effectState: "committed", cursor: CURSOR });
    expect(eve.cancel).not.toHaveBeenCalled();
    expect(finalizeOrReplay).not.toHaveBeenCalled();
  });

  it.each(["no_active_turn", "throw"] as const)("uses effect_may_have_committed when Eve cancellation is %s", async (mode) => {
    const finalizeOrReplay = vi.fn(async (input) => ({
      ok: true as const,
      outcome: "created" as const,
      operationId: OPERATION_ID,
      turnId: TURN_ID,
      cancellationOutcome: input.cancellationOutcome,
      effectState: input.effectState,
      occurredAt: NOW,
      cursor: CURSOR,
      session: Object.freeze({ ...session, lastSequence: 2 }),
    }));
    const eve = { cancel: vi.fn(async () => {
      if (mode === "throw") throw new Error("provider and private work details");
      return { status: "no_active_turn" as const };
    }) };
    const response = await handleCancelSession(request(), auth, dependencies({
      eve,
      store: { ...dependencies().store, finalizeOrReplay },
    }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ outcome: "effect_may_have_committed", effectState: "unknown" });
    expect(text).not.toContain("provider");
    expect(finalizeOrReplay).toHaveBeenCalledWith(expect.objectContaining({
      cancellationOutcome: "effect_may_have_committed",
      effectState: "unknown",
    }));
  });

  it("finishes the durable ticket conservatively when the caller aborts after acceptance", async () => {
    const controller = new AbortController();
    const eve = { cancel: vi.fn() };
    const base = dependencies();
    const acceptOrReplay = vi.fn(async (input: Parameters<typeof base.store.acceptOrReplay>[0]) => {
      controller.abort("private caller reason");
      return base.store.acceptOrReplay(input);
    });
    const finalizeOrReplay = vi.fn(async (input) => ({
      ok: true as const,
      outcome: "created" as const,
      operationId: OPERATION_ID,
      turnId: TURN_ID,
      cancellationOutcome: input.cancellationOutcome,
      effectState: input.effectState,
      occurredAt: NOW,
      cursor: CURSOR,
      session: Object.freeze({ ...session, lastSequence: 2 }),
    }));
    const response = await handleCancelSession(request(body(), controller.signal), auth, dependencies({
      eve,
      store: { acceptOrReplay, finalizeOrReplay },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "effect_may_have_committed", effectState: "unknown" });
    expect(eve.cancel).not.toHaveBeenCalled();
    expect(finalizeOrReplay).toHaveBeenCalledWith(expect.objectContaining({
      cancellationOutcome: "effect_may_have_committed",
      effectState: "unknown",
    }));
  });

  it("denies guessed/revoked sessions and forged continuations before persistence or Eve", async () => {
    const acceptOrReplay = vi.fn();
    const eve = { cancel: vi.fn() };
    const denied = await handleCancelSession(request(), auth, dependencies({
      authorizeSession: vi.fn(async () => createAccessDenied(auth.requestId)),
      eve,
      store: { ...dependencies().store, acceptOrReplay },
    }));
    expect(denied.status).toBe(404);
    expect(await denied.json()).toMatchObject({ code: "ACCESS_DENIED" });

    const forged = await handleCancelSession(request(body({ continuationToken: `${continuationToken}x` })), auth, dependencies({
      eve,
      store: { ...dependencies().store, acceptOrReplay },
    }));
    expect(forged.status).toBe(404);
    expect(await forged.json()).toMatchObject({ code: "ACCESS_DENIED" });
    expect(acceptOrReplay).not.toHaveBeenCalled();
    expect(eve.cancel).not.toHaveBeenCalled();
  });

  it("rejects unknown input and preserves conflict/unknown persistence truth without signaling twice", async () => {
    const malformed = await handleCancelSession(request(body({ childId: CHILD_ID })), auth, dependencies());
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ code: "REQUEST_INVALID" });

    const conflictEve = { cancel: vi.fn() };
    const conflict = await handleCancelSession(request(), auth, dependencies({
      eve: conflictEve,
      store: {
        ...dependencies().store,
        acceptOrReplay: vi.fn(async () => ({ ok: false as const, code: "conflict" as const, effectState: "none" as const })),
      },
    }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "CONFLICT", effectState: "none" });
    expect(conflictEve.cancel).not.toHaveBeenCalled();

    const finalizeFailure = await handleCancelSession(request(), auth, dependencies({
      store: {
        ...dependencies().store,
        finalizeOrReplay: vi.fn(async () => ({ ok: false as const, code: "unavailable" as const, effectState: "unknown" as const })),
      },
    }));
    expect(finalizeFailure.status).toBe(503);
    expect(await finalizeFailure.json()).toMatchObject({ code: "PERSISTENCE_UNAVAILABLE", effectState: "unknown" });
  });
});
