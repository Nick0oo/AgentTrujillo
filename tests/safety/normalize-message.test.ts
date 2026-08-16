import { describe, expect, it } from "vitest";

import { createRawGuardianMessage } from "../../src/safety/message-schema";
import { normalizeMessage } from "../../src/safety/normalize-message";
import { tokenize } from "../../src/safety/tokenize";

describe("bilingual safety normalization", () => {
  it("preserves original Spanish text, accents, punctuation, and reversible token spans", () => {
    const raw = createRawGuardianMessage({ text: "¡Mi bebé tiene vómito, no fiebre!", locale: "es-CO", source: "guardian", requestId: "req-1" });
    const normalized = normalizeMessage(raw);
    expect(normalized.originalText).toBe(raw.text);
    expect(normalized.comparisonText).toBe("¡mi bebé tiene vómito, no fiebre!");
    expect(normalized.tokens.some((token) => token.text === "bebé")).toBe(true);
    const fever = normalized.lexiconMatches.find((match) => match.code === "variant.fever");
    expect(fever?.span.sourceStart).toBe(raw.text.indexOf("fiebre"));
    expect(fever?.span.sourceEnd).toBe(raw.text.indexOf("fiebre") + 6);
  });

  it("normalizes compatibility characters without erasing evidence", () => {
    const normalized = normalizeMessage("ＦＥＶＥＲ ３８．５°C", "en-US");
    expect(normalized.originalText).toBe("ＦＥＶＥＲ ３８．５°C");
    expect(normalized.comparisonText).toBe("fever 3.5°c".replace("3.5", "38.5"));
    expect(normalized.warnings).toContain("CONFUSABLE_CHARACTER");
    expect(normalized.tokens.some((token) => token.kind === "number")).toBe(true);
  });

  it("keeps punctuation and decimal separators rather than autocorrecting", () => {
    const normalized = normalizeMessage("Temperatura 38,5?", "es-CO");
    expect(normalized.comparisonText).toContain("38,5?");
    expect(normalized.tokens.find((token) => token.comparisonText === "38,5")?.kind).toBe("number");
  });

  it("marks mixed-language and missing punctuation without translating", () => {
    const normalized = normalizeMessage("Mi baby has fever", "es-CO");
    expect(normalized.comparisonText).toBe("mi baby has fever");
    expect(normalized.warnings).toContain("MIXED_LANGUAGE");
    expect(normalized.lexiconMatches.some((match) => match.locale === "en-US")).toBe(true);
  });

  it("handles emoji/combining marks and rejects unsupported controls", () => {
    const normalized = normalizeMessage("Niño 👶🏽", "es-CO");
    expect(normalized.originalText).toBe("Niño 👶🏽");
    expect(normalized.comparisonText).toContain("niño");
    expect(() => normalizeMessage("bad\u0000text", "es-CO")).toThrowError("INVALID_TEXT");
  });

  it("is deterministic and bounded", () => {
    const input = createRawGuardianMessage({ text: "fiebre ".repeat(20).trim(), locale: "es-CO", source: "guardian", requestId: "req-1" });
    expect(normalizeMessage(input)).toEqual(normalizeMessage(input));
    expect(() => normalizeMessage("word ".repeat(300), "en-US")).toThrowError("LIMIT_EXCEEDED");
    expect(tokenize({ originalText: "hola", comparisonText: "hola", codePointMap: [{ normalizedStart: 0, normalizedEnd: 4, sourceStart: 0, sourceEnd: 4 }] })).toHaveLength(1);
  });
});
