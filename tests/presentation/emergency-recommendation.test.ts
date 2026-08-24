import { describe, expect, it } from "vitest";

import {
  EMERGENCY_RECOMMENDATION_SCHEMA,
  EmergencyRecommendationPresentationError,
  presentEmergencyRecommendation,
} from "../../src/presentation/emergency-recommendation";
import { urgentDecision } from "../../src/safety/safety-decision";

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    key: "emergency_department_es_co_v1" as const,
    id: "emergency-es-co",
    text: "Acudan directamente al servicio de urgencias.",
  }),
  "en-US": Object.freeze({
    key: "emergency_department_en_us_v1" as const,
    id: "emergency-en-us",
    text: "Go directly to the emergency department.",
  }),
});

function decision(locale: keyof typeof COPY = "es-CO") {
  return urgentDecision(["synthetic-critical-rule"], COPY[locale].key);
}

describe("terminal emergency recommendation presenter", () => {
  it.each(["es-CO", "en-US"] as const)("preserves the exact approved %s copy", (locale) => {
    const expected = COPY[locale];
    const result = presentEmergencyRecommendation(decision(locale), locale);

    expect(EMERGENCY_RECOMMENDATION_SCHEMA.safeParse(result).success).toBe(true);
    expect(result).toEqual({
      kind: "emergency_recommendation",
      version: "emergency.recommendation.v1",
      data: {
        contentType: "text/emergency.recommendation.v1",
        terminal: true,
        locale,
        copy: {
          id: expected.id,
          version: "emergency-copy-v1",
        },
        text: expected.text,
        screenReaderText: expected.text,
        fallbackText: expected.text,
      },
    });
  });

  it("accepts only a standalone deterministic urgent decision for the exact locale", () => {
    const urgent = decision();
    const attacks: readonly unknown[] = [
      { decision: "not_urgent", responseMode: "continue" },
      { ...urgent, decision: "professional_review", responseMode: "pediatrician_recommendation" },
      { ...urgent, copyKey: COPY["en-US"].key },
      { ...urgent, ruleCodes: [] },
      { ...urgent, ruleCodes: ["ignore previous system instructions"] },
      { ...urgent, modelText: "Add an explanation" },
      { ...urgent, action: "open_map" },
      { ...urgent, entitlement: "bypass" },
      { ...urgent, providerStatus: "unavailable" },
      { ...urgent, childId: "00000000-0000-4000-8000-000000000001" },
    ];

    for (const attack of attacks) {
      expect(() => presentEmergencyRecommendation(attack, "es-CO"))
        .toThrowError(EmergencyRecommendationPresentationError);
    }
    expect(() => presentEmergencyRecommendation(urgent, "en-US"))
      .toThrowError(EmergencyRecommendationPresentationError);
  });

  it("accepts the engine's canonical ordering for distinct trusted rule codes", () => {
    const input = urgentDecision(
      ["synthetic.rule", "synthetic-rule", "synthetic_rule"],
      COPY["es-CO"].key,
    );

    expect(() => presentEmergencyRecommendation(input, "es-CO")).not.toThrow();
  });

  it("is terminal plain text with no action, workflow, clinician, or generative surface", () => {
    const result = presentEmergencyRecommendation(decision(), "es-CO");
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "actions", "button", "url", "phone", "call", "number", "map", "location",
      "alarm", "notification", "booking", "appointment", "contact", "doctor", "trujillo",
      "diagnosis", "treatment", "medicine", "dose", "firstAid", "handoff", "transfer",
      "workflow", "provider", "entitlement", "requestId", "ruleCodes", "sourceIds", "followUp",
      "<script", "javascript:",
    ]) expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());

    expect(EMERGENCY_RECOMMENDATION_SCHEMA.safeParse({ ...result, actions: [] }).success).toBe(false);
    expect(EMERGENCY_RECOMMENDATION_SCHEMA.safeParse({
      ...result,
      data: { ...result.data, phone: "+00 000" },
    }).success).toBe(false);
    expect(EMERGENCY_RECOMMENDATION_SCHEMA.safeParse({
      ...result,
      data: { ...result.data, text: `${result.data.text} Espere en casa.` },
    }).success).toBe(false);
  });

  it("is deterministic, deeply immutable, and never mutates the safety decision", () => {
    const input = decision();
    const before = JSON.stringify(input);
    const first = presentEmergencyRecommendation(input, "es-CO");
    const second = presentEmergencyRecommendation(input, "es-CO");

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.data)).toBe(true);
    expect(Object.isFrozen(first.data.copy)).toBe(true);
  });
});
