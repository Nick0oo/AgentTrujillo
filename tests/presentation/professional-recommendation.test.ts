import { describe, expect, it } from "vitest";

import {
  renderProfessionalReview,
  type ProfessionalReviewReason,
} from "../../src/safety/professional-review-policy";
import {
  PROFESSIONAL_RECOMMENDATION_SCHEMA,
  ProfessionalRecommendationPresentationError,
  presentProfessionalRecommendation,
} from "../../src/presentation/professional-recommendation";

const REASONS: readonly ProfessionalReviewReason[] = [
  "rule_unavailable",
  "needs_examination",
  "persistent_or_worsening",
  "outside_basic_scope",
  "uncertain_nonurgent",
];

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    id: "pediatrician-review-es-co",
    text: "Consulte con un pediatra para revisar esta situación.",
  }),
  "en-US": Object.freeze({
    id: "pediatrician-review-en-us",
    text: "Consult a pediatrician to review this situation.",
  }),
});

describe("plain professional recommendation presenter", () => {
  it.each(REASONS)("preserves the exact approved Spanish copy for %s", (reasonCode) => {
    const input = renderProfessionalReview(reasonCode, "es-CO");
    const result = presentProfessionalRecommendation(input, "es-CO");

    expect(PROFESSIONAL_RECOMMENDATION_SCHEMA.safeParse(result).success).toBe(true);
    expect(result).toEqual({
      kind: "professional_recommendation",
      version: "professional.recommendation.v1",
      data: {
        contentType: "text/professional.recommendation.v1",
        locale: "es-CO",
        reasonCode,
        copy: {
          id: COPY["es-CO"].id,
          version: "professional-review-copy.v1",
        },
        text: COPY["es-CO"].text,
        screenReaderText: COPY["es-CO"].text,
        fallbackText: COPY["es-CO"].text,
      },
    });
  });

  it.each(REASONS)("preserves the exact approved English copy for %s", (reasonCode) => {
    const input = renderProfessionalReview(reasonCode, "en-US");
    const result = presentProfessionalRecommendation(input, "en-US");

    expect(result.data.locale).toBe("en-US");
    expect(result.data.reasonCode).toBe(reasonCode);
    expect(result.data.copy).toEqual({
      id: COPY["en-US"].id,
      version: "professional-review-copy.v1",
    });
    expect(result.data.text).toBe(COPY["en-US"].text);
    expect(result.data.fallbackText).toBe(COPY["en-US"].text);
  });

  it("rejects urgent precedence instead of decorating a terminal emergency", () => {
    expect(() => presentProfessionalRecommendation({ mode: "urgent_precedence" }, "es-CO"))
      .toThrowError(ProfessionalRecommendationPresentationError);
  });

  it("rejects unknown reasons, locale drift and any copy ID or text drift", () => {
    const valid = renderProfessionalReview("needs_examination", "es-CO");
    if (valid.mode !== "pediatrician_recommendation") throw new Error("expected professional recommendation");
    const attacks: unknown[] = [
      { ...valid, reasonCode: "diagnosis_required" },
      { ...valid, publicResponse: { ...valid.publicResponse, locale: "en-US" } },
      { ...valid, publicResponse: { ...valid.publicResponse, messageId: "doctor-reviewed" } },
      { ...valid, publicResponse: { ...valid.publicResponse, text: "El Dr. Trujillo ya revisó el caso." } },
      { ...valid, publicResponse: { ...valid.publicResponse, text: "Agenda una cita con el pediatra." } },
      { ...valid, publicResponse: { ...valid.publicResponse, url: "https://example.invalid" } },
      { ...valid, action: "book" },
    ];

    for (const attack of attacks) {
      expect(() => presentProfessionalRecommendation(attack, "es-CO"))
        .toThrowError(ProfessionalRecommendationPresentationError);
    }
    expect(() => presentProfessionalRecommendation(valid, "en-US"))
      .toThrowError(ProfessionalRecommendationPresentationError);
  });

  it("is text-only and structurally forbids professional operations", () => {
    const result = presentProfessionalRecommendation(
      renderProfessionalReview("outside_basic_scope", "es-CO"),
      "es-CO",
    );
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "actions", "button", "url", "phone", "email", "address", "location", "calendar",
      "appointment", "availability", "notification", "alert", "handoff", "transfer", "caseId",
      "doctor reviewed", "Dr. Trujillo", "diagnosis", "treatment", "prescription", "<script", "javascript:",
    ]) expect(serialized).not.toContain(forbidden);

    expect(PROFESSIONAL_RECOMMENDATION_SCHEMA.safeParse({ ...result, actions: [] }).success).toBe(false);
    expect(PROFESSIONAL_RECOMMENDATION_SCHEMA.safeParse({
      ...result,
      data: { ...result.data, phone: "+57 000" },
    }).success).toBe(false);
  });

  it("is deterministic, deeply immutable and does not mutate the trusted policy result", () => {
    const input = renderProfessionalReview("rule_unavailable", "es-CO");
    const before = JSON.stringify(input);
    const first = presentProfessionalRecommendation(input, "es-CO");
    const second = presentProfessionalRecommendation(input, "es-CO");

    expect(first).toEqual(second);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.data)).toBe(true);
    expect(Object.isFrozen(first.data.copy)).toBe(true);
  });
});
