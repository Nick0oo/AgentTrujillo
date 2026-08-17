import { deepFreeze, type NormalizedToken, type TextSpan } from "./message-types";

export type NormalizedCodePointMap = Readonly<{
  normalizedStart: number;
  normalizedEnd: number;
  sourceStart: number;
  sourceEnd: number;
}>;

export type TokenizationInput = Readonly<{
  originalText: string;
  comparisonText: string;
  codePointMap: readonly NormalizedCodePointMap[];
}>;

function classify(segment: string, isWordLike: boolean): NormalizedToken["kind"] {
  if (/^\s+$/u.test(segment)) return "whitespace";
  if (isWordLike && /^\p{N}([\p{N}\p{M}]|[.,])*$/u.test(segment)) return "number";
  if (isWordLike) return "word";
  if (/^[\p{P}\p{S}]+$/u.test(segment)) return "punctuation";
  return "other";
}

function spanFor(start: number, end: number, map: readonly NormalizedCodePointMap[]): TextSpan {
  const covered = map.filter((entry) => entry.normalizedEnd > start && entry.normalizedStart < end);
  if (covered.length === 0) throw new Error("INVALID_SPAN");
  return deepFreeze({
    sourceStart: covered[0].sourceStart,
    sourceEnd: covered[covered.length - 1].sourceEnd,
    normalizedStart: start,
    normalizedEnd: end,
  });
}

export function tokenize(input: TokenizationInput): readonly NormalizedToken[] {
  const segmenter = new Intl.Segmenter("und", { granularity: "word" });
  const tokens: NormalizedToken[] = [];
  for (const segment of segmenter.segment(input.comparisonText)) {
    const start = [...input.comparisonText.slice(0, segment.index)].length;
    const end = start + [...segment.segment].length;
    const span = spanFor(start, end, input.codePointMap);
    const sourceText = [...input.originalText].slice(span.sourceStart, span.sourceEnd).join("");
    tokens.push(deepFreeze({
      text: sourceText,
      comparisonText: segment.segment,
      kind: classify(segment.segment, Boolean(segment.isWordLike)),
      span,
    }));
  }
  return deepFreeze(tokens);
}
