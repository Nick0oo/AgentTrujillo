import { describe, expect, it, vi } from "vitest";

import { SafetyPreflight } from "../../src/safety/preflight";
import type { CompiledRedFlagPack } from "../../src/safety/red-flag-pack-types";
import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createTrustedSafetyContextFromAuthorizedScope } from "../../src/safety/safety-context";
import { createRawGuardianMessage } from "../../src/safety/message-schema";

const scope = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "11111111-1111-4111-8111-111111111111", careSpaceId: "22222222-2222-4222-8222-222222222222", childId: "33333333-3333-4333-8333-333333333333", permissions: ["read"], countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-08-16T00:00:00Z"), expiresAt: new Date("2026-08-16T00:05:00Z") });
const trusted = createTrustedSafetyContextFromAuthorizedScope(scope, { chronologicalAgeDays: 30, locale: "es-CO", timezone: "America/Bogota", referenceInstant: new Date("2026-08-16T00:01:00Z") });
const pack = { packageId: "synthetic", jurisdiction: "CO", locale: "es-CO", version: "1.0.0", algorithm: { key: "synthetic", version: "1.0.0", implementationSha256: "a".repeat(64) }, activation: "synthetic_test_only", copyKeys: ["emergency_department_es_co_v1"], concepts: new Map(), rules: [] } as unknown as CompiledRedFlagPack;

function input(overrides: Partial<Parameters<SafetyPreflight["evaluate"]>[0]> = {}) {
  const access = { validate: vi.fn().mockResolvedValue(true) };
  return { requestId: "req-1", sessionId: "session-1", rawMessage: createRawGuardianMessage({ text: "Hola", locale: "es-CO", source: "guardian", requestId: "req-1" }), trustedContext: trusted, access, packages: { resolve: vi.fn().mockResolvedValue(pack) }, ...overrides };
}

describe("pre-LLM safety preflight", () => {
  it("validates access first and denies before package/normalization effects", async () => {
    const packages = { resolve: vi.fn() };
    const result = await new SafetyPreflight().evaluate(input({ access: { validate: vi.fn().mockResolvedValue(false) }, packages }));
    expect(result).toEqual({ kind: "denied", code: "ACCESS_DENIED" });
    expect(packages.resolve).not.toHaveBeenCalled();
  });

  it("fails closed when the package is missing and recorder failure cannot change terminal behavior", async () => {
    const result = await new SafetyPreflight().evaluate(input({ packages: { resolve: vi.fn().mockResolvedValue(null) }, recorder: { recordOnce: vi.fn().mockRejectedValue(new Error("cloud outage")) } }));
    expect(result).toMatchObject({ kind: "terminal", response: { type: "abstain", decision: { decision: "indeterminate" } } });
  });

  it("creates a one-shot continue permit and revalidates the lease on consume", async () => {
    const preflight = new SafetyPreflight();
    const result = await preflight.evaluate(input());
    expect(result.kind).toBe("continue");
    if (result.kind !== "continue") return;
    const access = { validate: vi.fn().mockResolvedValue(true) };
    await expect(preflight.consumePermit({ permit: result.permit, authorization: { requestId: "req-1", sessionId: "session-1" }, scopeFingerprint: trusted.scopeFingerprint, access })).resolves.toEqual({ requestId: "req-1", sessionId: "session-1" });
    await expect(preflight.consumePermit({ permit: result.permit, authorization: { requestId: "req-1", sessionId: "session-1" }, scopeFingerprint: trusted.scopeFingerprint, access })).rejects.toThrow("CONTINUE_PERMIT_INVALID");
    expect(access.validate).toHaveBeenCalledTimes(2);
  });

  it("blocks a clinically prohibited request before issuing a continue permit", async () => {
    const result = await new SafetyPreflight().evaluate(input({ rawMessage: createRawGuardianMessage({ text: "¿Qué diagnóstico tiene?", locale: "es-CO", source: "guardian", requestId: "req-1" }) }));
    expect(result).toMatchObject({ kind: "terminal", response: { type: "abstain", decision: { reasonCode: "DIAGNOSIS_REQUEST" } } });
  });
});
