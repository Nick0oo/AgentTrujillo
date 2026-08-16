import type { NormalizedMessage, TextSpan } from "./message-types";

export type AgeUnit = "days" | "weeks" | "months" | "years";
export type AgeQualifier = "exact" | "approximate" | "range" | "label_ambiguous";
export type AgeExpression = Readonly<{
  value: number | null;
  unit: AgeUnit | null;
  qualifier: AgeQualifier;
  span: TextSpan;
  sourceText: string;
  authoritative: false;
}>;

const units: ReadonlyMap<string, AgeUnit> = new Map([
  ["día", "days"], ["días", "days"], ["day", "days"], ["days", "days"],
  ["semana", "weeks"], ["semanas", "weeks"], ["week", "weeks"], ["weeks", "weeks"],
  ["mes", "months"], ["meses", "months"], ["month", "months"], ["months", "months"],
  ["año", "years"], ["años", "years"], ["year", "years"], ["years", "years"],
]);

const labels: ReadonlyMap<string, AgeQualifier> = new Map([
  ["recién nacido", "label_ambiguous"], ["newborn", "label_ambiguous"], ["infant", "label_ambiguous"], ["bebé", "label_ambiguous"],
]);

export function extractAgeExpressions(message: NormalizedMessage): readonly AgeExpression[] {
  const expressions: AgeExpression[] = [];
  const tokens = message.tokens;
  for (let index = 0; index < tokens.length; index += 1) {
    const number = tokens[index];
    if (number.kind !== "number" || !/^\d{1,4}$/u.test(number.comparisonText)) continue;
    let unitIndex = index + 1;
    while (tokens[unitIndex]?.kind === "whitespace") unitIndex += 1;
    const unit = units.get(tokens[unitIndex]?.comparisonText ?? "");
    if (!unit) continue;
    const prefix = message.comparisonText.slice(Math.max(0, number.span.normalizedStart - 20), number.span.normalizedStart);
    const qualifier: AgeQualifier = /\b(?:casi|aprox(?:imadamente)?|más o menos|almost|about|approximately)\b/iu.test(prefix)
      ? "approximate"
      : /(?:-|–|\ba\b|\bto\b)\s*$/iu.test(prefix) || /^(?:-|–|\ba\b|\bto\b)/iu.test(tokens[unitIndex + 1]?.comparisonText ?? "")
        ? "range"
        : "exact";
    const endToken = tokens[unitIndex];
    expressions.push(Object.freeze({ value: Number(number.comparisonText), unit, qualifier, span: Object.freeze({ sourceStart: number.span.sourceStart, sourceEnd: endToken.span.sourceEnd, normalizedStart: number.span.normalizedStart, normalizedEnd: endToken.span.normalizedEnd }), sourceText: [...message.originalText].slice(number.span.sourceStart, endToken.span.sourceEnd).join(""), authoritative: false }));
  }
  for (const [label, qualifier] of labels) {
    const index = message.comparisonText.indexOf(label);
    if (index < 0) continue;
    const start = [...message.comparisonText.slice(0, index)].length;
    const end = start + [...label].length;
    const token = tokens.find((candidate) => candidate.span.normalizedStart <= start && candidate.span.normalizedEnd >= end);
    if (token) expressions.push(Object.freeze({ value: null, unit: null, qualifier, span: token.span, sourceText: token.text, authoritative: false }));
  }
  return Object.freeze(expressions);
}

export type AgeConflict = Readonly<{ kind: "message_age_conflict" | "ambiguous_expression"; expression: AgeExpression }>;
