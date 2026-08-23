import { describe, expect, it } from "vitest";

import type { AuthenticatedGuardian } from "../../../agent/lib/access/authenticated-guardian";
import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope";
import type { ChildPermission } from "../../../agent/lib/access/authorized-child-scope";
import type { GuardedSession } from "../../../agent/lib/access/session-route-guard";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import type { SupabaseBearerToken } from "../../../agent/lib/supabase/types";
import { createTrustedToolContext } from "../../../agent/lib/runtime/trusted-tool-context";
import {
  REGISTERED_TOOL_IDS,
  TOOL_PERMISSION_POLICY,
  authorizeToolInvocation,
} from "../../../agent/lib/runtime/tool-permission-policy";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const ALL_PERMISSIONS: readonly ChildPermission[] = [
  "read", "record", "manage_documents", "manage_medication", "manage_guardians",
];
const ALL_CAPABILITIES = ["advanced_ai", "multi_child", "reports", "reminders"] as const;

function context(overrides: Readonly<{
  permissions?: readonly ChildPermission[];
  capabilities?: readonly string[];
  country?: "CO" | "US";
  scopeExpiresAt?: Date;
  entitlementExpiresAt?: Date;
  controller?: AbortController;
}> = {}) {
  const country = overrides.country ?? "CO";
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR, careSpaceId: SPACE, childId: CHILD,
    permissions: overrides.permissions ?? ALL_PERMISSIONS,
    countryOfCare: country, timezone: country === "CO" ? "America/Bogota" : "America/New_York",
    authorizationVersion: "m:2:a:7", issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: overrides.scopeExpiresAt ?? new Date("2026-08-23T12:04:00.000Z"),
  });
  const guardian: AuthenticatedGuardian = Object.freeze({
    userId: ACTOR, issuedAt: new Date("2026-08-23T11:55:00.000Z"),
    expiresAt: new Date("2026-08-23T13:00:00.000Z"), authSessionId: "auth-session-fixture",
    bearerToken: "synthetic-bearer" as SupabaseBearerToken,
  });
  const session: OwnedSessionRecord = Object.freeze({
    productSessionId: PRODUCT_SESSION, eveSessionId: "eve-session-fixture",
    ownerUserId: scope.actorUserId, careSpaceId: scope.careSpaceId, childId: scope.childId,
    authorizationVersion: scope.authorizationVersion, authorizationExpiresAt: scope.expiresAt,
    status: "active", lastSequence: 1,
  });
  const guarded: GuardedSession = Object.freeze({ guardian, scope, session });
  const controller = overrides.controller ?? new AbortController();
  return createTrustedToolContext({
    guarded, runtimeSessionId: "eve-session-fixture", locale: country === "CO" ? "es-CO" : "en-US",
    entitlements: {
      careSpaceId: SPACE, revision: "entitlements:v1",
      capabilities: overrides.capabilities ?? ALL_CAPABILITIES,
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: overrides.entitlementExpiresAt ?? new Date("2026-08-23T12:03:00.000Z"),
    },
    trace: { requestId: "request-1", traceId: "trace-1", toolCallId: "tool-call-1" },
    abortSignal: controller.signal, services: {}, now: NOW,
  });
}

const EXPECTED_POLICY = {
  evaluate_vaccination_schedule: ["read", "advanced_ai"],
  get_growth_summary: ["read", "advanced_ai"],
  suggest_pediatric_nutrition: ["read", "advanced_ai"],
  validate_declared_pediatric_dose: ["manage_medication", "advanced_ai"],
  register_anthropometry: ["record", "advanced_ai"],
  record_vaccine_administration: ["record", "advanced_ai"],
  create_medication_plan: ["manage_medication", "advanced_ai"],
  record_medication_intake: ["manage_medication", "advanced_ai"],
  record_development_observation: ["record", "advanced_ai"],
  capture_clinical_memory_candidate: ["record", "advanced_ai"],
  search_child_clinical_memory: ["read", "advanced_ai"],
  prepare_private_document_upload: ["manage_documents", "advanced_ai"],
  generate_vaccination_card: ["manage_documents", "reports"],
} as const;

describe("tool permission and entitlement policy", () => {
  it("registers exactly the thirteen intended tools with an exhaustive frozen policy", () => {
    expect(REGISTERED_TOOL_IDS).toEqual(Object.keys(EXPECTED_POLICY));
    expect(Object.isFrozen(REGISTERED_TOOL_IDS)).toBe(true);
    expect(Object.isFrozen(TOOL_PERMISSION_POLICY)).toBe(true);
    expect(Object.keys(TOOL_PERMISSION_POLICY)).toEqual(REGISTERED_TOOL_IDS);
    for (const toolId of REGISTERED_TOOL_IDS) {
      expect([TOOL_PERMISSION_POLICY[toolId].permission, TOOL_PERMISSION_POLICY[toolId].capability])
        .toEqual(EXPECTED_POLICY[toolId]);
      expect(TOOL_PERMISSION_POLICY[toolId].countries).toEqual(["CO"]);
    }
  });

  it.each(Object.entries(EXPECTED_POLICY))(
    "allows %s only from current trusted permission/capability state",
    (toolId, [permission, capability]) => {
      expect(authorizeToolInvocation(context(), toolId, NOW)).toEqual({
        allowed: true, policyVersion: "tool-permission.v1", toolId,
        permission, capability, country: "CO", entitlementRevision: "entitlements:v1",
      });
    },
  );

  it.each([
    "evaluate_red_flags", "trigger_red_flag_alert", "bash", "filesystem", "web", "agent",
    "clinician_contact", "unknown_tool",
  ])("denies unregistered or prohibited tool %s", (toolId) => {
    expect(authorizeToolInvocation(context(), toolId, NOW)).toEqual({
      allowed: false, policyVersion: "tool-permission.v1", code: "TOOL_INVOCATION_DENIED",
    });
  });

  it("denies missing permission, missing capability, wrong country, and forged tool IDs identically", () => {
    const denied = {
      allowed: false, policyVersion: "tool-permission.v1", code: "TOOL_INVOCATION_DENIED",
    };
    expect(authorizeToolInvocation(context({ permissions: ["read"] }), "register_anthropometry", NOW))
      .toEqual(denied);
    expect(authorizeToolInvocation(context({ capabilities: [] }), "get_growth_summary", NOW))
      .toEqual(denied);
    expect(authorizeToolInvocation(context({ country: "US" }), "get_growth_summary", NOW))
      .toEqual(denied);
    expect(authorizeToolInvocation(context(), { toolId: "get_growth_summary", childId: CHILD } as never, NOW))
      .toEqual(denied);
  });

  it("reauthorizes expiry and cancellation before policy lookup", () => {
    const stale = context({ entitlementExpiresAt: new Date("2026-08-23T12:01:00.000Z") });
    expect(authorizeToolInvocation(stale, "get_growth_summary", new Date("2026-08-23T12:01:00.000Z")))
      .toMatchObject({ allowed: false, code: "TOOL_INVOCATION_DENIED" });

    const controller = new AbortController();
    const cancelled = context({ controller });
    controller.abort();
    expect(authorizeToolInvocation(cancelled, "get_growth_summary", NOW))
      .toMatchObject({ allowed: false, code: "TOOL_INVOCATION_DENIED" });
  });

  it("does not cache paid access across a freshly downgraded trusted context", () => {
    expect(authorizeToolInvocation(context(), "get_growth_summary", NOW)).toMatchObject({ allowed: true });
    expect(authorizeToolInvocation(context({ capabilities: [] }), "get_growth_summary", NOW))
      .toMatchObject({ allowed: false, code: "TOOL_INVOCATION_DENIED" });
  });

  it("returns no authority, provider, product, safety copy, or effect-bearing fields", () => {
    const decision = authorizeToolInvocation(context(), "get_growth_summary", NOW);
    expect(JSON.stringify(decision)).not.toMatch(
      /actor|guardian|careSpace|childId|provider|product|price|token|emergency|urgenc|contact|schedule/i,
    );
  });
});
