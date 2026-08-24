import type { ToolContext } from "eve/tools";
import { describe, expect, it } from "vitest";

import type { AuthenticatedGuardian } from "../../../agent/lib/access/authenticated-guardian";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type ChildPermission,
} from "../../../agent/lib/access/authorized-child-scope";
import type { GuardedSession } from "../../../agent/lib/access/session-route-guard";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import type { SupabaseBearerToken } from "../../../agent/lib/supabase/types";
import {
  installTrustedToolContextFactory,
  resolveTrustedToolContextForEve,
  type TrustedToolContextFactory,
  type TrustedToolInvocation,
} from "../../../agent/lib/runtime/eve-tool-context";
import {
  createTrustedToolContext,
  TrustedToolContextError,
} from "../../../agent/lib/runtime/trusted-tool-context";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const ALL_PERMISSIONS: readonly ChildPermission[] = [
  "read", "record", "manage_documents", "manage_medication", "manage_guardians",
];

function trustedContext(overrides: Readonly<{
  actor?: string;
  eveSessionId?: string;
  toolCallId?: string;
  controller?: AbortController;
}> = {}) {
  const actor = overrides.actor ?? ACTOR;
  const eveSessionId = overrides.eveSessionId ?? "eve-session-fixture";
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: actor,
    careSpaceId: SPACE,
    childId: CHILD,
    permissions: ALL_PERMISSIONS,
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:2:a:7",
    issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: new Date("2026-08-23T12:04:00.000Z"),
  });
  const guardian: AuthenticatedGuardian = Object.freeze({
    userId: scope.actorUserId,
    issuedAt: new Date("2026-08-23T11:55:00.000Z"),
    expiresAt: new Date("2026-08-23T13:00:00.000Z"),
    bearerToken: "synthetic-bearer" as SupabaseBearerToken,
  });
  const session: OwnedSessionRecord = Object.freeze({
    productSessionId: PRODUCT_SESSION,
    eveSessionId,
    ownerUserId: scope.actorUserId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    authorizationVersion: scope.authorizationVersion,
    authorizationExpiresAt: scope.expiresAt,
    status: "active",
    lastSequence: 1,
  });
  const guarded: GuardedSession = Object.freeze({ guardian, scope, session });
  const controller = overrides.controller ?? new AbortController();
  return createTrustedToolContext({
    guarded,
    runtimeSessionId: eveSessionId,
    locale: "es-CO",
    entitlements: {
      careSpaceId: SPACE,
      revision: "entitlements:v1",
      capabilities: ["advanced_ai"],
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: new Date("2026-08-23T12:03:00.000Z"),
    },
    trace: {
      requestId: "request-1",
      traceId: "trace-1",
      toolCallId: overrides.toolCallId ?? "tool-call-1",
    },
    abortSignal: controller.signal,
    services: { toolIdempotency: Object.freeze({ now: () => new Date(NOW) }) },
    now: NOW,
  });
}

function eveContext(overrides: Readonly<{
  actor?: string | null;
  eveSessionId?: string;
  toolCallId?: string;
  toolName?: string;
  controller?: AbortController;
  parent?: boolean;
}> = {}): ToolContext {
  const actor = overrides.actor === undefined ? ACTOR : overrides.actor;
  const auth = actor === null ? null : Object.freeze({
    attributes: Object.freeze({ role: "guardian" }),
    authenticator: "synthetic-test",
    principalId: actor,
    principalType: "user",
  });
  return Object.freeze({
    abortSignal: (overrides.controller ?? new AbortController()).signal,
    callId: overrides.toolCallId ?? "tool-call-1",
    toolName: overrides.toolName ?? "get_growth_summary",
    session: Object.freeze({
      id: overrides.eveSessionId ?? "eve-session-fixture",
      auth: Object.freeze({ current: auth, initiator: auth }),
      turn: Object.freeze({ id: "turn-1", sequence: 2 }),
      ...(overrides.parent ? {
        parent: Object.freeze({
          callId: "parent-call",
          rootSessionId: "root-session",
          sessionId: "parent-session",
          turn: Object.freeze({ id: "parent-turn", sequence: 1 }),
        }),
      } : {}),
    }),
    getSandbox: async () => { throw new Error("not available"); },
    getSkill: () => { throw new Error("not available"); },
    getToken: async () => ({ status: "unauthorized" as const }),
    requireAuth: () => { throw new Error("not available"); },
  }) as unknown as ToolContext;
}

describe("Eve trusted tool context bridge", () => {
  it("fails closed until one immutable application factory is installed", async () => {
    await expect(resolveTrustedToolContextForEve(eveContext(), "get_growth_summary"))
      .rejects.toEqual(new TrustedToolContextError("TRUSTED_TOOL_CONTEXT_INVALID"));

    const captured: TrustedToolInvocation[] = [];
    const controller = new AbortController();
    const contexts = new Map<string, ReturnType<typeof trustedContext>>([
      ["tool-call-1", trustedContext({ controller })],
    ]);
    const factory: TrustedToolContextFactory = Object.freeze({
      async resolve(invocation: TrustedToolInvocation) {
        captured.push(invocation);
        const context = contexts.get(invocation.toolCallId);
        if (!context) throw new Error("missing synthetic context");
        return context;
      },
    });
    installTrustedToolContextFactory(factory);

    const resolved = await resolveTrustedToolContextForEve(
      eveContext({ controller }),
      "get_growth_summary",
    );
    expect(resolved).toBe(contexts.get("tool-call-1"));
    expect(captured).toEqual([{
      toolId: "get_growth_summary",
      eveSessionId: "eve-session-fixture",
      turnId: "turn-1",
      turnSequence: 2,
      toolCallId: "tool-call-1",
      principalId: ACTOR,
      authenticator: "synthetic-test",
      abortSignal: expect.any(AbortSignal),
    }]);
    expect(Object.isFrozen(captured[0])).toBe(true);
    expect(Object.keys(captured[0] ?? {})).not.toContain("attributes");
    expect(() => installTrustedToolContextFactory(Object.freeze({ resolve: factory.resolve })))
      .toThrowError("TRUSTED_TOOL_CONTEXT_FACTORY_ALREADY_INSTALLED");
  });

  it.each([
    ["wrong tool", { toolName: "evaluate_vaccination_schedule" }],
    ["missing authentication", { actor: null }],
    ["wrong actor", { actor: "00000000-0000-4000-8000-000000000009" }],
    ["wrong session", { eveSessionId: "eve-session-other" }],
    ["wrong call", { toolCallId: "tool-call-other" }],
    ["delegated execution", { parent: true }],
  ])("rejects %s without returning a context", async (_label, overrides) => {
    await expect(resolveTrustedToolContextForEve(
      eveContext(overrides),
      "get_growth_summary",
    )).rejects.toEqual(new TrustedToolContextError("TRUSTED_TOOL_CONTEXT_INVALID"));
  });

  it("propagates cancellation before factory resolution", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(resolveTrustedToolContextForEve(
      eveContext({ controller }),
      "get_growth_summary",
    )).rejects.toEqual(new TrustedToolContextError("TOOL_CONTEXT_CANCELLED"));
  });
});
