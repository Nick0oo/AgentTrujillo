import type { NormalizedMessage, NormalizedMeasurement, TextSpan } from "./message-types";
import { MEASUREMENT_METHODS, TEMPERATURE_UNITS, type MeasurementMethod } from "./measurement-units";
import { normalizeTemperature, type TemperatureMeasurement } from "./temperature";

export type MeasurementAmbiguity = "missing_unit" | "approximate" | "range" | "conflicting" | "invalid" | "none";
export type SafetyMeasurement = Readonly<TemperatureMeasurement & { span: TextSpan; sourceText: string; ambiguity: MeasurementAmbiguity }>;

function unitAt(tokens: NormalizedMessage["tokens"], index: number): { unit: "celsius" | "fahrenheit"; end: number } | undefined {
  let cursor = index;
  while (tokens[cursor]?.kind === "whitespace") cursor += 1;
  const current = tokens[cursor]?.comparisonText.replace(/\s+/gu, "");
  const next = tokens[cursor + 1]?.comparisonText.replace(/\s+/gu, "");
  const candidate = current === "°" || current === "º" ? `${current}${next ?? ""}` : current;
  const unit = TEMPERATURE_UNITS.get(candidate);
  if (unit) return { unit, end: current === "°" || current === "º" ? cursor + 1 : cursor };
  return undefined;
}

function methodAround(tokens: NormalizedMessage["tokens"], index: number): MeasurementMethod {
  for (const token of tokens.slice(Math.max(0, index - 3), index + 4)) {
    const method = MEASUREMENT_METHODS.get(token.comparisonText);
    if (method) return method;
  }
  return "unknown";
}

export function parseSafetyMeasurements(message: NormalizedMessage): readonly SafetyMeasurement[] {
  const measurements: SafetyMeasurement[] = [];
  for (let index = 0; index < message.tokens.length; index += 1) {
    const token = message.tokens[index];
    if (token.kind !== "number") continue;
    const unit = unitAt(message.tokens, index + 1);
    if (!unit) continue;
    const sourceText = [...message.originalText].slice(token.span.sourceStart, message.tokens[unit.end].span.sourceEnd).join("");
    const approximate = /\b(?:about|around|aprox(?:imadamente)?|casi|más o menos)\b/iu.test(message.comparisonText.slice(0, token.span.normalizedStart));
    const range = /\d\s*(?:-|–|a|to)\s*\d/iu.test(message.comparisonText.slice(Math.max(0, token.span.normalizedStart - 4), token.span.normalizedEnd + 8));
    try {
      const normalized = normalizeTemperature(token.comparisonText, unit.unit, methodAround(message.tokens, index));
      measurements.push(Object.freeze({ ...normalized, span: Object.freeze({ sourceStart: token.span.sourceStart, sourceEnd: message.tokens[unit.end].span.sourceEnd, normalizedStart: token.span.normalizedStart, normalizedEnd: message.tokens[unit.end].span.normalizedEnd }), sourceText, ambiguity: approximate ? "approximate" : range ? "range" : normalized.status === "ambiguous" ? "invalid" : "none" }));
    } catch {
      measurements.push(Object.freeze({ status: "invalid", original: token.comparisonText, unit: unit.unit, milliCelsius: null, method: methodAround(message.tokens, index), ambiguity: "invalid", span: token.span, sourceText }));
    }
  }
  if (measurements.length > 1 && measurements.some((measurement, _, all) => all[0].milliCelsius && measurement.milliCelsius && measurement.milliCelsius.numerator !== all[0].milliCelsius.numerator)) {
    return Object.freeze(measurements.map((measurement) => Object.freeze({ ...measurement, status: "ambiguous", ambiguity: "conflicting" as const })));
  }
  return Object.freeze(measurements);
}
