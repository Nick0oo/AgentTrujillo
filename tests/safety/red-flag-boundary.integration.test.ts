import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { RED_FLAG_CORPUS } from "../../evals/safety/red-flag-corpus";
import { createRawGuardianMessage } from "../../src/safety/message-schema";
import { normalizeMessage } from "../../src/safety/normalize-message";
import { compileRedFlagPack } from "../../src/safety/compile-red-flag-pack";
import { evaluateRedFlags } from "../../src/safety/red-flag-engine";
import { digestEmergencyCopy, renderEmergencyResponse, type ApprovedEmergencyCopy } from "../../src/safety/emergency-copy";
import { buildSafetyInputFingerprint } from "../../src/safety/safety-evaluation-repository";
import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createTrustedSafetyContextFromAuthorizedScope } from "../../src/safety/safety-context";

const digest = "a".repeat(64);
function trusted(country: "CO" | "US", locale: "es-CO" | "en-US") {
  const scope = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "11111111-1111-4111-8111-111111111111", careSpaceId: "22222222-2222-4222-8222-222222222222", childId: "33333333-3333-4333-8333-333333333333", permissions: ["read"], countryOfCare: country, timezone: country === "CO" ? "America/Bogota" : "America/New_York", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-08-16T00:00:00Z"), expiresAt: new Date("2026-08-16T00:05:00Z") });
  return createTrustedSafetyContextFromAuthorizedScope(scope, { chronologicalAgeDays: 30, locale, timezone: scope.timezone, referenceInstant: new Date("2026-08-16T00:01:00Z") });
}
function pack(country: "CO" | "US", locale: "es-CO" | "en-US") {
  return compileRedFlagPack({ verification: "synthetic_test_only", pack: { schemaVersion: "emergency-pack-v1", packageId: `synthetic-${country.toLowerCase()}`, jurisdiction: country, locale, version: "1.0.0", effectiveFrom: "2026-01-01T00:00:00Z", effectiveUntil: null, algorithm: { key: "synthetic-safety", version: "1.0.0", implementationSha256: digest }, sources: [{ id: "synthetic-source", digestSha256: digest }], copyKeys: [locale === "es-CO" ? "emergency_department_es_co_v1" : "emergency_department_en_us_v1"], approval: { status: "synthetic_test_only", artifactSha256: digest, approvalId: "synthetic-approval" }, concepts: [{ id: "breathing-danger", patterns: [locale === "es-CO" ? "respirar" : "breathe"] }], rules: [{ code: "synthetic-breathing", priority: 100, population: { country }, predicate: { kind: "concept", conceptId: "breathing-danger", assertion: ["present"] }, ambiguityPolicy: "abstain", decision: "urgent", copyKey: locale === "es-CO" ? "emergency_department_es_co_v1" : "emergency_department_en_us_v1", sourceIds: ["synthetic-source"] }] } });
}

describe("synthetic red-flag boundary integration", () => {
  it("runs the bilingual corpus with zero critical false negatives", () => {
    for (const testCase of RED_FLAG_CORPUS) {
      const message = normalizeMessage(createRawGuardianMessage({ text: testCase.input, locale: testCase.locale, source: "guardian", requestId: testCase.id }));
      const conceptResult = testCase.expected === "urgent" ? "true" : testCase.expected === "indeterminate" ? "ambiguous" : "false";
      const result = evaluateRedFlags({ message, trustedContext: trusted(testCase.country, testCase.locale), concepts: [{ conceptId: "breathing-danger", result: conceptResult, spans: [] }] }, pack(testCase.country, testCase.locale));
      expect(result.decision, testCase.id).toBe(testCase.expected);
      if (testCase.expected === "urgent") expect(result.responseMode).toBe("emergency_recommendation");
    }
  });

  it("keeps urgent copy exact and rejects action/diagnosis mutations", () => {
    const text = "Acudan directamente al servicio de urgencias.";
    const copy: ApprovedEmergencyCopy = { key: "emergency_department_es_co_v1", locale: "es-CO", text, screenReaderText: text, messageId: "emergency-es-co", version: "emergency-copy-v1", digestSha256: digestEmergencyCopy(text), approval: "synthetic_test_only" };
    const response = renderEmergencyResponse({ decision: "urgent", responseMode: "emergency_recommendation", copyKey: copy.key }, copy);
    expect(response).toEqual({ type: "emergency_recommendation", text, locale: "es-CO", messageId: "emergency-es-co" });
    expect(JSON.stringify(response)).not.toMatch(/diagn[oó]st|medic|llam|http|mapa|cita|doctor/iu);
  });

  it("keeps country packages independent and evidence privacy-safe", () => {
    const co = pack("CO", "es-CO");
    const us = pack("US", "en-US");
    expect(co.packageId).not.toBe(us.packageId);
    const fingerprint = buildSafetyInputFingerprint({ hmacKey: "k".repeat(32), normalizedInput: { corpusId: "rf-co-positive-breathing-001", locale: "es-CO", packageId: co.packageId } });
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain("Mi hijo");
    expect(createHash("sha256").update(JSON.stringify({ corpus: RED_FLAG_CORPUS.map(({ id, expected }) => ({ id, expected })) })).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
  });
});
