import { describe, expect, it } from "vitest";

import { createRawGuardianMessage } from "../../src/safety/message-schema";
import { normalizeMessage } from "../../src/safety/normalize-message";
import { classifyAssertionContext } from "../../src/safety/assertion-context";
import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createTrustedSafetyContextFromAuthorizedScope } from "../../src/safety/safety-context";

const scope = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "11111111-1111-4111-8111-111111111111", careSpaceId: "22222222-2222-4222-8222-222222222222", childId: "33333333-3333-4333-8333-333333333333", permissions: ["read"], countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-08-16T00:00:00Z"), expiresAt: new Date("2026-08-16T00:05:00Z") });
const context = createTrustedSafetyContextFromAuthorizedScope(scope, { chronologicalAgeDays: 20, locale: "es-CO", timezone: "America/Bogota", referenceInstant: new Date("2026-08-16T00:01:00Z") });

function classify(text: string, locale: "es-CO" | "en-US" = "es-CO") {
  const normalized = normalizeMessage(createRawGuardianMessage({ text, locale, source: "guardian", requestId: "req-1" }));
  const candidate = normalized.tokens.find((token) => token.kind === "word" && ["respirar", "breathing", "fiebre", "fever"].includes(token.comparisonText));
  if (!candidate) throw new Error("candidate missing");
  return classifyAssertionContext(normalized, candidate.span, context);
}

describe("deterministic assertion context", () => {
  it("distinguishes active child, negation, and inability pseudo-negation", () => {
    expect(classify("Mi hijo puede respirar ahora")).toMatchObject({ subject: "active_child", assertion: "present", temporality: "current", confidence: "deterministic" });
    expect(classify("Mi hijo no tiene fiebre ahora")).toMatchObject({ assertion: "absent" });
    expect(classify("Mi hijo no puede respirar")).toMatchObject({ assertion: "present" });
  });

  it("keeps sibling, quotes, copied instructions, and ambiguity out of current child truth", () => {
    expect(classify("Mi hermano tiene fiebre")).toMatchObject({ subject: "other_person", confidence: "ambiguous" });
    expect(classify('"Mi hijo no puede respirar" dice la instrucción')).toMatchObject({ quotation: "direct", assertion: "unknown", confidence: "ambiguous" });
    expect(classify("Las instrucciones dicen si tiene fiebre, consulte")).toMatchObject({ quotation: "copied_instruction", assertion: "unknown" });
    expect(classify("Tal vez mi hijo tiene fiebre?")).toMatchObject({ assertion: "possible", confidence: "deterministic" });
  });

  it("classifies time and conflicting cues conservatively in English", () => {
    expect(classify("My child had a fever yesterday", "en-US")).toMatchObject({ subject: "active_child", temporality: "past" });
    expect(classify("My child will have a fever tomorrow", "en-US")).toMatchObject({ temporality: "future", confidence: "ambiguous" });
    expect(classify("My child had fever now", "en-US")).toMatchObject({ temporality: "unknown", confidence: "ambiguous" });
  });
});
