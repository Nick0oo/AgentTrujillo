import { describe, expect, it } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createRawGuardianMessage, rawGuardianMessageSchema } from "../../src/safety/message-schema";
import {
  SAFETY_MESSAGE_LIMITS,
  SafetyInputError,
  assertTextSpan,
  type SafetyDecision,
} from "../../src/safety/message-types";
import { createTrustedSafetyContextFromAuthorizedScope } from "../../src/safety/safety-context";

const NOW = new Date("2026-08-16T12:00:00.000Z");
const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: "11111111-1111-4111-8111-111111111111",
  careSpaceId: "22222222-2222-4222-8222-222222222222",
  childId: "33333333-3333-4333-8333-333333333333",
  permissions: ["read"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:3:a:7",
  issuedAt: new Date("2026-08-16T11:59:00.000Z"),
  expiresAt: new Date("2026-08-16T12:04:00.000Z"),
});

describe("normalized safety message contracts", () => {
  it("keeps raw input strict and rejects authority/tool fields", () => {
    expect(rawGuardianMessageSchema.safeParse({
      text: "Mi hijo tiene fiebre",
      locale: "es-CO",
      source: "guardian",
      requestId: "req-1",
      childId: "33333333-3333-4333-8333-333333333333",
    }).success).toBe(false);
  });

  it("accepts the exact Unicode/UTF-8 boundaries and rejects oversize without truncation", () => {
    const nearLimit = "a".repeat(SAFETY_MESSAGE_LIMITS.maxCodePoints);
    expect(createRawGuardianMessage({ text: nearLimit, locale: "es-CO", source: "guardian", requestId: "req-1" }).text).toHaveLength(nearLimit.length);
    expect(() => createRawGuardianMessage({ text: `${nearLimit}a`, locale: "es-CO", source: "guardian", requestId: "req-1" })).toThrowError(new SafetyInputError("LIMIT_EXCEEDED"));
    expect(() => createRawGuardianMessage({ text: "\ud800", locale: "es-CO", source: "guardian", requestId: "req-1" })).toThrowError(new SafetyInputError("INVALID_ENCODING"));
    expect(() => createRawGuardianMessage({ text: "ok\u0000", locale: "es-CO", source: "guardian", requestId: "req-1" })).toThrowError(new SafetyInputError("INVALID_TEXT"));
  });

  it("deep-freezes the raw message and trusted context", () => {
    const raw = createRawGuardianMessage({ text: "Hola 👶🏽", locale: "es-CO", source: "guardian", requestId: "req-1" });
    expect(Object.isFrozen(raw)).toBe(true);
    const context = createTrustedSafetyContextFromAuthorizedScope(scope, {
      chronologicalAgeDays: 180,
      correctedAgeDays: null,
      locale: "es-CO",
      timezone: "America/Bogota",
      referenceInstant: NOW,
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(context).not.toHaveProperty("childId");
    expect(context.scopeFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(() => createTrustedSafetyContextFromAuthorizedScope(scope, { chronologicalAgeDays: 1, locale: "es-CO", timezone: "UTC", referenceInstant: new Date("2026-08-16T12:05:00.000Z") })).toThrowError("STALE_CONTEXT");
  });

  it("uses code-point spans and does not allow malformed spans", () => {
    expect(() => assertTextSpan({ sourceStart: 0, sourceEnd: 2, normalizedStart: 0, normalizedEnd: 2 }, 2, 2)).not.toThrow();
    expect(() => assertTextSpan({ sourceStart: 2, sourceEnd: 2, normalizedStart: 0, normalizedEnd: 1 }, 2, 2)).toThrowError("INVALID_SPAN");
  });

  it("keeps urgent decisions action-free by construction", () => {
    const urgent: SafetyDecision = {
      decision: "urgent",
      responseMode: "emergency_recommendation",
      ruleCodes: ["SYNTHETIC_RULE"],
      copyKey: "emergency_department_es_co_v1",
    };
    expect(urgent).not.toHaveProperty("url");
    expect(urgent).not.toHaveProperty("phone");
    expect(urgent).not.toHaveProperty("diagnosis");
  });
});
