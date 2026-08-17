import { describe, expect, it } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createRawGuardianMessage } from "../../src/safety/message-schema";
import { normalizeMessage } from "../../src/safety/normalize-message";
import { extractAgeExpressions } from "../../src/safety/age-expression";
import { buildSafetyAgeContext, SafetyAgeContextError } from "../../src/safety/safety-age-context";

const scope = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "11111111-1111-4111-8111-111111111111", careSpaceId: "22222222-2222-4222-8222-222222222222", childId: "33333333-3333-4333-8333-333333333333", permissions: ["read"], countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-08-16T00:00:00Z"), expiresAt: new Date("2026-08-16T00:05:00Z") });
const reference = new Date("2026-08-16T00:01:00Z");

describe("trusted pediatric age context", () => {
  it("extracts exact, approximate, range, and label expressions as non-authoritative", () => {
    const message = normalizeMessage(createRawGuardianMessage({ text: "Tiene 7 semanas, casi 2 meses; es un bebé", locale: "es-CO", source: "guardian", requestId: "req-1" }));
    const expressions = extractAgeExpressions(message);
    expect(expressions).toHaveLength(3);
    expect(expressions[0]).toMatchObject({ value: 7, unit: "weeks", qualifier: "exact", authoritative: false });
    expect(expressions[1]).toMatchObject({ value: 2, unit: "months", qualifier: "approximate" });
    expect(expressions[2]).toMatchObject({ value: null, qualifier: "label_ambiguous" });
  });

  it("binds exact trusted age to the active scope and reference timezone", () => {
    const result = buildSafetyAgeContext(scope, reference, {
      calculateChronologicalAge: () => ({ ageDays: 49, dobEvidenceVersion: "dob-v1" }),
      calculateCorrectedAge: () => ({ ageDays: 35, evidenceVersion: "corrected-v1" }),
    });
    expect(result).toMatchObject({ chronologicalAgeDays: 49, correctedAgeDays: 35, referenceCalendarDate: "2026-08-15", countryOfCare: "CO" });
    expect(result.scopeFingerprint).not.toContain(scope.childId);
  });

  it("rejects stale scope, invalid engine age, and never accepts message age as authority", () => {
    expect(() => buildSafetyAgeContext(scope, new Date("2026-08-16T00:06:00Z"), { calculateChronologicalAge: () => ({ ageDays: 1, dobEvidenceVersion: "x" }) })).toThrowError(SafetyAgeContextError);
    expect(() => buildSafetyAgeContext(scope, reference, { calculateChronologicalAge: () => ({ ageDays: -1, dobEvidenceVersion: "x" }) })).toThrowError("INVALID_AGE");
  });
});
