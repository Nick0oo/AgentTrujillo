import { describe, expect, it } from "vitest";

import { ClinicalResponsePolicy } from "../../src/safety/clinical-response-policy";

const policy = new ClinicalResponsePolicy();
const notUrgent = { decision: "not_urgent", responseMode: "continue" } as const;

describe("clinical response boundaries", () => {
  it.each([
    ["diagnosis", "¿Qué diagnóstico tiene?"],
    ["prescription", "¿Qué le doy?"],
    ["medicine", "¿Puedo darle ibuprofen?"],
    ["dose", "Is this dose safe to give?"],
    ["reassurance", "Nothing to worry, it is safe"],
    ["operation", "Book an appointment with the doctor"],
  ])("abstains on %s requests", (_label, text) => {
    const result = policy.evaluateRequest({ text, locale: "es-CO", safetyDecision: notUrgent });
    expect(result).toMatchObject({ mode: "abstain", terminal: true });
    expect(result.text).toContain("No puedo");
  });

  it("lets only basic educational requests continue and terminal modes bypass generation", () => {
    expect(policy.evaluateRequest({ text: "¿Qué es la fiebre en general?", locale: "es-CO", safetyDecision: notUrgent })).toMatchObject({ mode: "educational", terminal: false });
    expect(policy.evaluateRequest({ text: "anything", locale: "es-CO", safetyDecision: { decision: "urgent", responseMode: "emergency_recommendation", ruleCodes: ["R"], copyKey: "emergency_department_es_co_v1" } })).toMatchObject({ mode: "approved_terminal", terminal: true });
  });

  it("discards prohibited or malformed generated output instead of repairing it", () => {
    expect(policy.validateGeneratedResponse({ kind: "educational", text: "Your child has pneumonia", sourceIds: [] }, "en-US")).toMatchObject({ ok: false, violation: { code: "DIAGNOSIS_ASSERTION" } });
    expect(policy.validateGeneratedResponse({ kind: "educational", text: "safe to give this dose", sourceIds: [] }, "en-US")).toMatchObject({ ok: false });
    expect(policy.validateGeneratedResponse({ kind: "educational", text: "General information only; discuss options with a pediatrician.", sourceIds: [] }, "en-US")).toMatchObject({ ok: true });
    expect(policy.validateGeneratedResponse({ kind: "educational", text: "ok", sourceIds: [], action: "call" }, "en-US")).toMatchObject({ ok: false, violation: { code: "INVALID_RESPONSE_CONTRACT" } });
  });
});
