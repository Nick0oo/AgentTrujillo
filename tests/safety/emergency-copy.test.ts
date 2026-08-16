import { describe, expect, it } from "vitest";

import { digestEmergencyCopy, EmergencyCopyError, renderEmergencyResponse, resolveEmergencyCopy, validateEmergencyCopy, type ApprovedEmergencyCopy } from "../../src/safety/emergency-copy";

function copy(locale: "es-CO" | "en-US"): ApprovedEmergencyCopy {
  const text = locale === "es-CO" ? "Acudan directamente al servicio de urgencias." : "Go directly to the emergency department.";
  return {
    key: locale === "es-CO" ? "emergency_department_es_co_v1" : "emergency_department_en_us_v1",
    locale,
    text,
    screenReaderText: text,
    messageId: `emergency-${locale.toLowerCase()}`,
    version: "emergency-copy-v1",
    digestSha256: digestEmergencyCopy(text),
    approval: "synthetic_test_only",
  };
}

describe("immutable emergency-department-only copy", () => {
  it("renders the exact synthetic bilingual copy into a strict public shape", () => {
    const es = copy("es-CO");
    expect(validateEmergencyCopy(es).text).toBe("Acudan directamente al servicio de urgencias.");
    const response = renderEmergencyResponse({ decision: "urgent", responseMode: "emergency_recommendation", copyKey: es.key }, es);
    expect(response).toEqual({ type: "emergency_recommendation", text: es.text, locale: "es-CO", messageId: "emergency-es-co" });
    expect(Object.keys(response)).toEqual(["type", "text", "locale", "messageId"]);
  });

  it("resolves only exact key/locale and never translates", () => {
    const es = copy("es-CO");
    const en = copy("en-US");
    expect(resolveEmergencyCopy({ copies: [es, en], approval: "synthetic_test_only" }, en.key, "en-US").text).toBe(en.text);
    expect(() => resolveEmergencyCopy({ copies: [es], approval: "synthetic_test_only" }, es.key, "en-US")).toThrowError(EmergencyCopyError);
  });

  it.each([
    ["URL", "Acudan directamente al servicio de urgencias. https://example.invalid"],
    ["contact", "Llame al médico y acudan directamente al servicio de urgencias."],
    ["diagnosis", "El diagnóstico es grave; acudan directamente al servicio de urgencias."],
    ["treatment", "Administre medicina y acudan directamente al servicio de urgencias."],
    ["extra paragraph", "Acudan directamente al servicio de urgencias. Espere en casa."],
  ])("rejects %s or action-bearing mutations", (_label, text) => {
    expect(() => validateEmergencyCopy({ ...copy("es-CO"), text, screenReaderText: text, digestSha256: digestEmergencyCopy(text) })).toThrowError(EmergencyCopyError);
  });

  it("rejects altered bytes, extra fields, wrong key, and non-urgent decisions", () => {
    const es = copy("es-CO");
    expect(() => validateEmergencyCopy({ ...es, text: `${es.text} `, digestSha256: digestEmergencyCopy(`${es.text} `) })).toThrowError("COPY_INVALID");
    expect(() => validateEmergencyCopy({ ...es, digestSha256: "b".repeat(64) })).toThrowError("COPY_DIGEST_MISMATCH");
    expect(() => renderEmergencyResponse({ decision: "urgent", responseMode: "emergency_recommendation", copyKey: "emergency_department_en_us_v1" }, es)).toThrowError("COPY_INVALID");
  });
});
