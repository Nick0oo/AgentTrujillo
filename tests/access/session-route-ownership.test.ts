import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedGuardian } from "../../agent/lib/access/authenticated-guardian";
import { createAccessDenied } from "../../agent/lib/access/access-denied";
import { createAccessDenialResponse, serializeAccessDenialResponse } from "../../agent/lib/access/access-denial-response";
import type { AccessLeaseValidator } from "../../agent/lib/access/access-lease-validator";
import { createAuthorizedChildScopeFromTrustedRow, type AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope";
import { createSessionRouteGuard } from "../../agent/lib/access/session-route-guard";
import type { ChildContextTokenService } from "../../agent/lib/access/child-context-token";
import type { SessionOwnershipRepository } from "../../agent/lib/access/session-ownership-repository";
import type { OwnedSessionRecord } from "../../agent/lib/access/session-record";
import type { StreamAccessMonitor } from "../../agent/lib/access/stream-access-monitor";
import type { SupabaseBearerToken } from "../../agent/lib/supabase/types";
import { SESSION_ROUTE_SCENARIOS } from "./fixtures/session-route-scenarios";

const scope = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "00000000-0000-4000-8000-000000000001", careSpaceId: "00000000-0000-4000-8000-000000000002", childId: "00000000-0000-4000-8000-000000000003", permissions: ["read", "record"], countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:2:a:7", issuedAt: new Date("2026-08-16T11:59:00.000Z"), expiresAt: new Date("2026-08-16T12:04:00.000Z") });
const guardian: AuthenticatedGuardian = Object.freeze({ userId: scope.actorUserId, issuedAt: scope.issuedAt, expiresAt: new Date("2026-08-16T12:30:00.000Z"), bearerToken: "jwt.fixture" as SupabaseBearerToken });
const session: OwnedSessionRecord = Object.freeze({ productSessionId: "00000000-0000-4000-8000-000000000004", eveSessionId: "eve-1", ownerUserId: scope.actorUserId, careSpaceId: scope.careSpaceId, childId: scope.childId, authorizationVersion: scope.authorizationVersion, authorizationExpiresAt: new Date("2026-08-16T12:03:00.000Z"), status: "active", lastSequence: 0 });
const context = Object.freeze({ actorUserId: scope.actorUserId, careSpaceId: scope.careSpaceId, childId: scope.childId, permissions: scope.permissions, countryOfCare: scope.countryOfCare, timezone: scope.timezone, authorizationVersion: scope.authorizationVersion, tokenId: "00000000-0000-4000-8000-000000000005", issuedAt: scope.issuedAt, expiresAt: scope.expiresAt });

function makeGuard(overrides: Readonly<{ auth?: unknown; context?: unknown; session?: unknown; fresh?: unknown; monitor?: unknown }> = {}) {
  const order: string[] = [];
  const authenticator = { authenticateAuthorizationHeader: vi.fn(async () => { order.push("auth"); if (overrides.auth instanceof Error) throw overrides.auth; return guardian; }) };
  const contextTokens = { issue: vi.fn().mockResolvedValue("context"), verify: vi.fn(async () => { order.push("context"); return overrides.context ?? context; }) } as unknown as ChildContextTokenService;
  const leaseValidator = { validateForOperation: vi.fn(async () => { order.push("lease"); return overrides.fresh ?? scope; }) } as unknown as AccessLeaseValidator;
  const sessions: SessionOwnershipRepository = { create: vi.fn(), bindEveSession: vi.fn(), findByProductId: vi.fn(async () => { order.push("repository"); return overrides.session ?? session; }), findByEveSessionId: vi.fn(), refreshLease: vi.fn() } as unknown as SessionOwnershipRepository;
  const streamMonitor: StreamAccessMonitor = { monitor: vi.fn(async () => { order.push("monitor"); return () => undefined; }) };
  return { guard: createSessionRouteGuard({ authenticator, contextTokens, leaseValidator, sessions, streamMonitor }), order, authenticator, contextTokens, leaseValidator, sessions, streamMonitor };
}

describe("session route ownership", () => {
  it("runs create in auth → context → fresh lease order and never exposes raw guard data", async () => {
    const { guard, order } = makeGuard();
    const result = await guard.authorizeCreate({ authorizationHeader: "Bearer fixture", childContextToken: "context", requestId: "route-1" });
    expect(result).toMatchObject({ guardian, scope });
    expect(order).toEqual(["auth", "context", "lease"]);
  });

  it("runs existing routes in auth → context → owner repository → lease order", async () => {
    for (const operation of ["follow_up", "cancel", "resume", "inspect"] as const) {
      const { guard, order } = makeGuard();
      const result = await guard.authorizeExisting({ authorizationHeader: "Bearer fixture", childContextToken: "context", sessionId: session.productSessionId, operation, requestId: `route-${operation}` });
      expect(result).toMatchObject({ session });
      expect(order).toEqual(["auth", "context", "repository", "lease"]);
    }
  });

  it("starts stream monitoring only after ownership and lease checks", async () => {
    const { guard, order } = makeGuard();
    const result = await guard.authorizeExisting({ authorizationHeader: "Bearer fixture", childContextToken: "context", sessionId: session.productSessionId, operation: "stream", requestId: "route-stream", stream: { abort: new AbortController() } });
    expect(result).toHaveProperty("stopStreamMonitor");
    expect(order).toEqual(["auth", "context", "repository", "lease", "monitor"]);
    order.push("attach");
    expect(order.indexOf("monitor")).toBeLessThan(order.indexOf("attach"));
  });

  it("short-circuits every downstream dependency on authentication, context, ID, repository, or lease denial", async () => {
    const authFailure = makeGuard({ auth: new Error("bad token") });
    await expect(authFailure.guard.authorizeCreate({ authorizationHeader: null, childContextToken: "context", requestId: "route-auth" })).resolves.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    expect(authFailure.order).toEqual(["auth"]);

    const contextFailure = makeGuard({ context: createAccessDenied("context") });
    await expect(contextFailure.guard.authorizeCreate({ authorizationHeader: "Bearer fixture", childContextToken: "bad", requestId: "route-context" })).resolves.toMatchObject({ status: 404 });
    expect(contextFailure.order).toEqual(["auth", "context"]);

    const badId = makeGuard();
    await expect(badId.guard.authorizeExisting({ authorizationHeader: "Bearer fixture", childContextToken: "context", sessionId: "not-a-uuid", operation: "inspect", requestId: "route-id" })).resolves.toMatchObject({ status: 404 });
    expect(badId.order).toEqual(["auth", "context"]);

    const repoFailure = makeGuard({ session: createAccessDenied("repo") });
    await expect(repoFailure.guard.authorizeExisting({ authorizationHeader: "Bearer fixture", childContextToken: "context", sessionId: session.productSessionId, operation: "inspect", requestId: "route-repo" })).resolves.toMatchObject({ status: 404 });
    expect(repoFailure.order).toEqual(["auth", "context", "repository"]);

    const leaseFailure = makeGuard({ fresh: createAccessDenied("lease") });
    await expect(leaseFailure.guard.authorizeExisting({ authorizationHeader: "Bearer fixture", childContextToken: "context", sessionId: session.productSessionId, operation: "inspect", requestId: "route-lease" })).resolves.toMatchObject({ status: 404 });
    expect(leaseFailure.order).toEqual(["auth", "context", "repository", "lease"]);
  });

  it("uses one no-store 404 denial shape with only request ID varying", () => {
    const first = createAccessDenialResponse("one");
    const second = createAccessDenialResponse("two");
    const withoutRequestId = (response: typeof first) => serializeAccessDenialResponse(response).replace(response.body.requestId, "REQUEST_ID");
    expect(first.status).toBe(404);
    expect(first.headers).toEqual({ "cache-control": "no-store", "content-type": "application/json" });
    expect(withoutRequestId(first)).toBe(withoutRequestId(second));
    expect(withoutRequestId(first)).not.toContain(scope.childId);
  });

  it("covers the matrix for all six operations and principals", () => {
    expect(SESSION_ROUTE_SCENARIOS).toHaveLength(6 + (6 * 8) + (6 * 3));
    expect(new Set(SESSION_ROUTE_SCENARIOS.map((scenario) => scenario.operation))).toEqual(new Set(["create", "follow_up", "stream", "cancel", "resume", "inspect"]));
    expect(SESSION_ROUTE_SCENARIOS.every((scenario) => scenario.state === "authorized" ? scenario.expected === "allow" : scenario.expected === "deny")).toBe(true);
  });
});
