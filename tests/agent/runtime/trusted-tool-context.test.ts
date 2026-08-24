import { describe, expect, it } from "vitest";

import type { AuthenticatedGuardian } from "../../../agent/lib/access/authenticated-guardian";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope";
import type { GuardedSession } from "../../../agent/lib/access/session-route-guard";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import type { SupabaseBearerToken } from "../../../agent/lib/supabase/types";
import {
  TrustedToolContextError,
  createTrustedToolContext,
  getTrustedToolAbortSignal,
  getTrustedToolActor,
  getTrustedToolEntitlements,
  getTrustedToolLocale,
  getTrustedToolServices,
  getTrustedToolSession,
  getTrustedToolTrace,
  requireActiveChildScope,
} from "../../../agent/lib/runtime/trusted-tool-context";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const EVE_SESSION = "eve-session-fixture";

function scope(overrides: Partial<{
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  countryOfCare: "CO" | "US";
  timezone: string;
  issuedAt: Date;
  expiresAt: Date;
}> = {}): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR,
    careSpaceId: SPACE,
    childId: CHILD,
    permissions: ["read", "record"],
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:2:a:7",
    issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: new Date("2026-08-23T12:04:00.000Z"),
    ...overrides,
  });
}

function guarded(overrides: Partial<{
  guardianUserId: string;
  guardianExpiresAt: Date;
  scope: AuthorizedChildScope;
  sessionOwnerUserId: string;
  sessionCareSpaceId: string;
  sessionChildId: string;
  sessionEveId: string | null;
  sessionStatus: OwnedSessionRecord["status"];
  sessionExpiresAt: Date;
}> = {}): GuardedSession {
  const authorizedScope = overrides.scope ?? scope();
  const guardian: AuthenticatedGuardian = Object.freeze({
    userId: overrides.guardianUserId ?? authorizedScope.actorUserId,
    issuedAt: new Date("2026-08-23T11:00:00.000Z"),
    expiresAt: overrides.guardianExpiresAt ?? new Date("2026-08-23T13:00:00.000Z"),
    authSessionId: "auth-session-fixture",
    bearerToken: "sensitive.jwt.fixture" as SupabaseBearerToken,
  });
  const session: OwnedSessionRecord = Object.freeze({
    productSessionId: PRODUCT_SESSION,
    eveSessionId: overrides.sessionEveId === undefined ? EVE_SESSION : overrides.sessionEveId,
    ownerUserId: (overrides.sessionOwnerUserId ?? authorizedScope.actorUserId) as OwnedSessionRecord["ownerUserId"],
    careSpaceId: (overrides.sessionCareSpaceId ?? authorizedScope.careSpaceId) as OwnedSessionRecord["careSpaceId"],
    childId: (overrides.sessionChildId ?? authorizedScope.childId) as OwnedSessionRecord["childId"],
    authorizationVersion: authorizedScope.authorizationVersion,
    authorizationExpiresAt: overrides.sessionExpiresAt ?? new Date("2026-08-23T12:03:00.000Z"),
    status: overrides.sessionStatus ?? "active",
    lastSequence: 4,
  });
  return Object.freeze({ guardian, scope: authorizedScope, session });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    guarded: guarded(),
    runtimeSessionId: EVE_SESSION,
    locale: "es-CO" as const,
    entitlements: {
      careSpaceId: SPACE,
      revision: "entitlements:v1",
      capabilities: ["reports", "advanced_ai"],
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: new Date("2026-08-23T12:02:00.000Z"),
    },
    trace: {
      requestId: "request-1",
      traceId: "trace-1",
      toolCallId: "tool-call-1",
    },
    abortSignal: new AbortController().signal,
    services: { growth: Object.freeze({ getSummary: () => "summary" }) },
    now: NOW,
    ...overrides,
  };
}

describe("trusted tool context", () => {
  it("keeps trusted request state isolated, immutable, sanitized, and non-serializable", () => {
    const contextInput = input();
    const context = createTrustedToolContext(contextInput);

    expect(getTrustedToolActor(context)).toEqual({
      userId: ACTOR,
      authSessionId: "auth-session-fixture",
      expiresAt: "2026-08-23T13:00:00.000Z",
    });
    expect(getTrustedToolSession(context)).toEqual({
      productSessionId: PRODUCT_SESSION,
      eveSessionId: EVE_SESSION,
      authorizationVersion: "m:2:a:7",
      authorizationExpiresAt: "2026-08-23T12:03:00.000Z",
      status: "active",
      lastSequence: 4,
    });
    expect(getTrustedToolEntitlements(context)).toEqual({
      careSpaceId: SPACE,
      revision: "entitlements:v1",
      capabilities: ["advanced_ai", "reports"],
      evaluatedAt: "2026-08-23T11:59:30.000Z",
      expiresAt: "2026-08-23T12:02:00.000Z",
    });
    expect(getTrustedToolTrace(context)).toEqual({
      requestId: "request-1",
      traceId: "trace-1",
      toolCallId: "tool-call-1",
    });
    expect(getTrustedToolLocale(context)).toBe("es-CO");
    expect(getTrustedToolAbortSignal(context)).toBe(contextInput.abortSignal);
    expect(getTrustedToolServices(context).growth.getSummary()).toBe("summary");
    expect(Object.isFrozen(getTrustedToolEntitlements(context).capabilities)).toBe(true);
    expect(Object.keys(context)).toEqual([]);
    expect(Object.getOwnPropertySymbols(context).map((key) => Reflect.get(context, key))).toEqual([true]);
    expect(() => JSON.stringify(context)).toThrowError("TRUSTED_TOOL_CONTEXT_NOT_SERIALIZABLE");
    expect(JSON.stringify(getTrustedToolActor(context))).not.toMatch(/bearer|jwt|token/i);
  });

  it("returns a defensive active scope without sharing mutable Date state", () => {
    const context = createTrustedToolContext(input());
    const first = requireActiveChildScope(context, NOW);
    first.expiresAt.setTime(0);
    const second = requireActiveChildScope(context, NOW);

    expect(second.childId).toBe(CHILD);
    expect(second.expiresAt.toISOString()).toBe("2026-08-23T12:04:00.000Z");
  });

  it.each([
    ["guardian mismatch", { guarded: guarded({ guardianUserId: "00000000-0000-4000-8000-000000000009" }) }],
    ["session owner mismatch", { guarded: guarded({ sessionOwnerUserId: "00000000-0000-4000-8000-000000000009" }) }],
    ["session child mismatch", { guarded: guarded({ sessionChildId: "00000000-0000-4000-8000-000000000009" }) }],
    ["runtime session mismatch", { runtimeSessionId: "another-eve-session" }],
    ["unbound Eve session", { guarded: guarded({ sessionEveId: null }) }],
    ["terminal session", { guarded: guarded({ sessionStatus: "completed" }) }],
    ["locale-country mismatch", { locale: "en-US" }],
    ["entitlement-space mismatch", { entitlements: { ...input().entitlements, careSpaceId: "00000000-0000-4000-8000-000000000009" } }],
    ["duplicate capability", { entitlements: { ...input().entitlements, capabilities: ["reports", "reports"] } }],
    ["expired snapshot", { entitlements: { ...input().entitlements, expiresAt: NOW } }],
  ])("rejects %s before a tool can run", (_name, override) => {
    expect(() => createTrustedToolContext(input(override))).toThrowError(TrustedToolContextError);
  });

  it("rejects unknown or incomplete trust-boundary fields with one safe error", () => {
    expect(() => createTrustedToolContext({
      ...input(),
      childId: "00000000-0000-4000-8000-000000000009",
    } as never)).toThrowError(TrustedToolContextError);
    expect(() => createTrustedToolContext({
      runtimeSessionId: EVE_SESSION,
      locale: "es-CO",
    } as never)).toThrowError(TrustedToolContextError);
    expect(() => createTrustedToolContext({
      ...input(),
      guarded: { scope: scope() },
    } as never)).toThrowError(TrustedToolContextError);
  });

  it("fails closed after cancellation or any trusted lease expiry", () => {
    const controller = new AbortController();
    const cancelled = createTrustedToolContext(input({ abortSignal: controller.signal }));
    controller.abort();
    expect(() => requireActiveChildScope(cancelled, NOW)).toThrowError("TOOL_CONTEXT_CANCELLED");

    const expired = createTrustedToolContext(input());
    expect(() => requireActiveChildScope(expired, new Date("2026-08-23T12:02:00.000Z"))).toThrowError("TOOL_CONTEXT_EXPIRED");
  });

  it("does not leak services or authority across concurrent request contexts", async () => {
    const siblingScope = scope({ childId: "00000000-0000-4000-8000-000000000008" });
    const first = createTrustedToolContext(input());
    const second = createTrustedToolContext(input({
      guarded: guarded({ scope: siblingScope }),
      services: { growth: Object.freeze({ getSummary: () => "sibling-summary" }) },
    }));

    const [firstChild, secondChild] = await Promise.all([
      Promise.resolve(requireActiveChildScope(first, NOW).childId),
      Promise.resolve(requireActiveChildScope(second, NOW).childId),
    ]);
    expect(firstChild).toBe(CHILD);
    expect(secondChild).toBe(siblingScope.childId);
    expect(getTrustedToolServices(first).growth.getSummary()).toBe("summary");
    expect(getTrustedToolServices(second).growth.getSummary()).toBe("sibling-summary");
  });
});
