import { describe, expect, it } from "vitest";

import { renderProfessionalReview, shouldRecommendPediatrician, type ProfessionalReviewReason } from "../../src/safety/professional-review-policy";

const reasons: readonly ProfessionalReviewReason[] = ["rule_unavailable", "needs_examination", "persistent_or_worsening", "outside_basic_scope", "uncertain_nonurgent"];

describe("non-operational pediatrician recommendation", () => {
  it.each(reasons)("renders only approved plain text for %s", (reasonCode) => {
    const result = renderProfessionalReview(reasonCode, "es-CO");
    expect(result).toMatchObject({ mode: "pediatrician_recommendation", reasonCode, publicResponse: { type: "pediatrician_recommendation", locale: "es-CO" } });
    expect(result).not.toHaveProperty("url");
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("booking");
    if (result.mode === "pediatrician_recommendation") expect(result.publicResponse.text).not.toMatch(/llamar|contactar|cita|agenda|notific/iu);
  });

  it("keeps English separate and urgent always wins", () => {
    const english = renderProfessionalReview("needs_examination", "en-US");
    expect(english.mode === "pediatrician_recommendation" && english.publicResponse.text).toBe("Consult a pediatrician to review this situation.");
    const urgent = { decision: "urgent", responseMode: "emergency_recommendation", ruleCodes: ["R"], copyKey: "emergency_department_es_co_v1" } as const;
    expect(shouldRecommendPediatrician({ reasonCode: "needs_examination", locale: "es-CO", safetyDecision: urgent })).toBe(false);
    expect(renderProfessionalReview("needs_examination", "es-CO", urgent)).toEqual({ mode: "urgent_precedence" });
  });

  it("rejects provider operations, identity, and review claims", () => {
    expect(() => renderProfessionalReview("needs_examination", "es-CO", undefined, { displayName: "Dr. Trujillo" })).toThrow("UNAPPROVED_PROVIDER_REFERENCE");
    expect(() => renderProfessionalReview("needs_examination", "es-CO", undefined, { phone: "123" } as never)).toThrow("UNAPPROVED_PROVIDER_REFERENCE");
  });
});
