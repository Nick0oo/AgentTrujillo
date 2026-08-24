import { describe, expect, it, vi } from "vitest";

import { createAccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAuthorizedChildScopeFromTrustedRow } from "../../../../agent/lib/access/authorized-child-scope";
import type { AuthenticatedGuardian } from "../../../../agent/lib/access/authenticated-guardian";
import {
  createInMemoryChildContextNonceStore,
  handleChildContext,
  type ChildContextRouteDependencies,
} from "../../../../src/channels/creciendo/routes/child-context";
import type { AuthenticatedChannelRequest } from "../../../../src/channels/creciendo/auth-middleware";
import { CHILD_CONTEXT_RESPONSE_SCHEMA } from "../../../../src/channels/creciendo/types";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const USER_ID = "10000000-0000-4000-8000-000000000001";
const CHILD_ID = "20000000-0000-4000-8000-000000000002";
const CARE_SPACE_ID = "30000000-0000-4000-8000-000000000003";
const TOKEN = "synthetic.child.context.token";

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
  expiresAt: new Date(NOW.getTime() + 180_000),
});

function body(overrides: Record<string, unknown> = {}) {
  return {
    version: "creciendo.channel.v1",
    childId: CHILD_ID,
    nonce: "child-context.01",
    capabilities: {
      channelVersions: ["creciendo.channel.v1"],
      eventVersions: ["creciendo.channel-event.v1"],
      widgetVersions: ["growth.summary.v1", "unknown-widget.v1"],
      ndjson: true,
    },
    ...overrides,
  };
}

function request(value: unknown = body()) {
  return new Request("https://agent.test/creciendo/v1/child-context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

function dependencies(overrides: Partial<ChildContextRouteDependencies> = {}): ChildContextRouteDependencies {
  return {
    authorizeChild: { authorize: vi.fn(async () => scope) },
    tokens: { issue: vi.fn(async () => TOKEN as never), verify: vi.fn() },
    childSummary: { resolve: vi.fn(async () => ({ reference: CHILD_ID, displayName: "Luna" })) },
    nonces: createInMemoryChildContextNonceStore(),
    now: () => new Date(NOW),
    ...overrides,
  };
}

describe("POST /creciendo/v1/child-context", () => {
  it("authorizes the selected child, signs the bounded scope and returns only display-safe data", async () => {
    const deps = dependencies();
    const response = await handleChildContext(request(), auth, deps);
    expect(response.status).toBe(200);
    const payload = CHILD_CONTEXT_RESPONSE_SCHEMA.parse(await response.json());
    expect(payload).toEqual({
      version: "creciendo.channel.v1",
      requestId: "request-01",
      childContextToken: TOKEN,
      expiresAt: "2026-08-24T12:02:00.000Z",
      scopeVersion: "authorized-child-scope.v1",
      child: { reference: CHILD_ID, displayName: "Luna" },
      capabilities: {
        channelVersion: "creciendo.channel.v1",
        eventVersion: "creciendo.channel-event.v1",
        widgetVersions: ["growth.summary.v1"],
        ndjson: true,
      },
    });
    expect(deps.authorizeChild.authorize).toHaveBeenCalledWith({
      guardian,
      requestedChildId: CHILD_ID,
      requiredPermissions: ["read"],
      requestId: "request-01",
      now: NOW,
    });
    expect(deps.tokens.issue).toHaveBeenCalledWith(scope, guardian, NOW);
    expect(JSON.stringify(payload)).not.toMatch(/care.?space|permission|authorization|country|timezone|birth|diagnos/i);
  });

  it("rejects unknown fields, malformed JSON and unsupported capabilities before authorization", async () => {
    const authorize = { authorize: vi.fn() };
    const deps = dependencies({ authorizeChild: authorize });
    const cases = [
      request(body({ authority: { childId: CHILD_ID } })),
      request(body({ capabilities: { ...body().capabilities as object, channelVersions: ["creciendo.channel.v2"] } })),
      new Request("https://agent.test/creciendo/v1/child-context", { method: "POST", body: "{" }),
    ];
    for (const candidate of cases) {
      const response = await handleChildContext(candidate, auth, deps);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: expect.stringMatching(/REQUEST_INVALID|VERSION_UNSUPPORTED/u) });
    }
    expect(authorize.authorize).not.toHaveBeenCalled();
  });

  it("makes missing, sibling, foreign-space and revoked authorization indistinguishable", async () => {
    for (const reason of ["missing", "sibling", "foreign", "revoked"] as const) {
      const deps = dependencies({
        authorizeChild: { authorize: vi.fn(async () => createAccessDenied(`internal-${reason}`)) },
      });
      const response = await handleChildContext(request(body({ nonce: `nonce.${reason}` })), auth, deps);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        version: "creciendo.error.v1",
        code: "ACCESS_DENIED",
        retryable: false,
        retryAfterSeconds: null,
        effectState: "none",
        resumable: false,
      });
    }
  });

  it("rejects replayed nonce before signing and safely handles summary/signing outages", async () => {
    const deps = dependencies();
    expect((await handleChildContext(request(), auth, deps)).status).toBe(200);
    const replay = await handleChildContext(request(), auth, deps);
    expect(replay.status).toBe(409);
    expect(deps.tokens.issue).toHaveBeenCalledTimes(1);

    for (const unavailable of [
      dependencies({ childSummary: { resolve: vi.fn(async () => null) } }),
      dependencies({ tokens: { issue: vi.fn(async () => { throw new Error("signing key details"); }), verify: vi.fn() } }),
    ]) {
      const response = await handleChildContext(request(body({ nonce: crypto.randomUUID() })), auth, unavailable);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toMatch(/signing|supabase|sql|token details/u);
    }
  });

  it("bounds nonce memory, actor isolation and expiry without serializing authority", () => {
    const store = createInMemoryChildContextNonceStore({ maxEntries: 2 });
    expect(store.consume({ actorKey: "a".repeat(64), nonce: "one", expiresAt: new Date(NOW.getTime() + 1_000), now: NOW })).toBe(true);
    expect(store.consume({ actorKey: "b".repeat(64), nonce: "one", expiresAt: new Date(NOW.getTime() + 1_000), now: NOW })).toBe(true);
    expect(store.consume({ actorKey: "c".repeat(64), nonce: "three", expiresAt: new Date(NOW.getTime() + 1_000), now: NOW })).toBe(false);
    expect(store.consume({ actorKey: "a".repeat(64), nonce: "one", expiresAt: new Date(NOW.getTime() + 2_000), now: new Date(NOW.getTime() + 1_000) })).toBe(true);
  });
});
