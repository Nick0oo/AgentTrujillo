import { describe, expect, it } from "vitest";

import { createRawGuardianMessage } from "../../src/safety/message-schema";
import { normalizeMessage } from "../../src/safety/normalize-message";
import { parseSafetyMeasurements } from "../../src/safety/measurement-normalization";
import { compareExact, normalizeTemperature, parseExactDecimal } from "../../src/safety/temperature";

describe("conservative exact safety measurements", () => {
  it("normalizes 38 C and 100.4 F with exact rational arithmetic", () => {
    const celsius = normalizeTemperature("38", "celsius");
    const fahrenheit = normalizeTemperature("100.4", "fahrenheit");
    expect(compareExact(celsius.milliCelsius!, fahrenheit.milliCelsius!)).toBe(0);
  });

  it("preserves decimal comma, method, spans, and never guesses a unit", () => {
    const message = normalizeMessage(createRawGuardianMessage({ text: "Temperatura axilar 38,5 °C", locale: "es-CO", source: "guardian", requestId: "req-1" }));
    const measurements = parseSafetyMeasurements(message);
    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({ unit: "celsius", method: "axillary", ambiguity: "none", sourceText: "38,5 °C" });
    expect(parseSafetyMeasurements(normalizeMessage("Temperatura 38", "es-CO"))).toHaveLength(0);
  });

  it("marks approximate, range, conflicting, and implausible values conservatively", () => {
    const approximate = parseSafetyMeasurements(normalizeMessage("aproximadamente 38 °C", "es-CO"));
    expect(approximate[0].ambiguity).toBe("approximate");
    const range = parseSafetyMeasurements(normalizeMessage("38-39 °C", "es-CO"));
    expect(range[0].ambiguity).toBe("range");
    const conflicting = parseSafetyMeasurements(normalizeMessage("38 °C y 40 °C", "es-CO"));
    expect(conflicting.every((value) => value.ambiguity === "conflicting")).toBe(true);
    expect(normalizeTemperature("999999", "celsius").status).toBe("ambiguous");
  });

  it("compares exact decimals without IEEE-754 thresholds", () => {
    expect(compareExact(parseExactDecimal("0.1"), parseExactDecimal("0.10"))).toBe(0);
    expect(compareExact(parseExactDecimal("0.100001"), parseExactDecimal("0.1"))).toBe(1);
  });
});
