import { describe, expect, it } from "vitest";

import { createRawGuardianMessage } from "../../src/safety/message-schema";
import { normalizeMessage } from "../../src/safety/normalize-message";
import { compileRedFlagPack } from "../../src/safety/compile-red-flag-pack";
import { evaluateRedFlags } from "../../src/safety/red-flag-engine";
import type { RedFlagPackV1 } from "../../src/safety/red-flag-pack-types";
import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createTrustedSafetyContextFromAuthorizedScope } from "../../src/safety/safety-context";

const digest = "a".repeat(64);
const scope = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "11111111-1111-4111-8111-111111111111", careSpaceId: "22222222-2222-4222-8222-222222222222", childId: "33333333-3333-4333-8333-333333333333", permissions: ["read"], countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-08-16T00:00:00Z"), expiresAt: new Date("2026-08-16T00:05:00Z") });
const trusted = createTrustedSafetyContextFromAuthorizedScope(scope, { chronologicalAgeDays: 30, locale: "es-CO", timezone: "America/Bogota", referenceInstant: new Date("2026-08-16T00:01:00Z") });
const pack: RedFlagPackV1 = { schemaVersion: "emergency-pack-v1", packageId: "synthetic-co", jurisdiction: "CO", locale: "es-CO", version: "1.0.0", effectiveFrom: "2026-01-01T00:00:00Z", effectiveUntil: null, algorithm: { key: "synthetic-safety", version: "1.0.0", implementationSha256: digest }, sources: [{ id: "synthetic-source", digestSha256: digest }], copyKeys: ["emergency_department_es_co_v1"], approval: { status: "synthetic_test_only", artifactSha256: digest, approvalId: "synthetic-approval" }, concepts: [{ id: "breathing-danger", patterns: ["respirar"] }], rules: [{ code: "breathing", priority: 100, population: { country: "CO" }, predicate: { kind: "concept", conceptId: "breathing-danger", assertion: ["present"] }, ambiguityPolicy: "urgent", decision: "urgent", copyKey: "emergency_department_es_co_v1", sourceIds: ["synthetic-source"] }] };
const compiled = compileRedFlagPack({ pack, verification: "synthetic_test_only" });

function input(text: string) { return { message: normalizeMessage(createRawGuardianMessage({ text, locale: "es-CO", source: "guardian", requestId: "req-1" })), trustedContext: trusted, concepts: [{ conceptId: "breathing-danger", result: text.includes("respirar") ? "true" as const : "false" as const, spans: [] }] }; }

describe("pure deterministic red-flag engine", () => {
  it("returns urgent before any provider and exposes only rule evidence", () => {
    const result = evaluateRedFlags(input("Mi hijo no puede respirar"), compiled);
    expect(result).toMatchObject({ decision: "urgent", responseMode: "emergency_recommendation", copyKey: "emergency_department_es_co_v1", ruleCodes: ["breathing"] });
    expect(result.evidence[0]).not.toHaveProperty("rawText");
    expect(result).not.toHaveProperty("diagnosis");
  });

  it("is deterministic, urgent-dominant, and fail-closed on limits", () => {
    const first = evaluateRedFlags(input("No hay síntoma"), compiled);
    const second = evaluateRedFlags(input("No hay síntoma"), compiled);
    expect(first).toEqual(second);
    expect(first.decision).toBe("not_urgent");
    expect(evaluateRedFlags(input("Mi hijo respira"), compiled, { maxOperations: 0, maxRules: 256 }).decision).toBe("indeterminate");
  });
});
