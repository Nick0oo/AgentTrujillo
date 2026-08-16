import {
  codePointLength,
  deepFreeze,
  SafetyInputError,
  type LexiconMatch,
  type NormalizedMessage,
  type RawGuardianMessage,
  type SafetyLocale,
  type TextSpan,
} from "./message-types";
import { createRawGuardianMessage } from "./message-schema";
import { EN_US_LEXICON_V1 } from "./lexicons/en-US.v1";
import { ES_CO_LEXICON_V1 } from "./lexicons/es-CO.v1";
import { tokenize, type NormalizedCodePointMap } from "./tokenize";

export const NORMALIZATION_VERSION = "safety-normalization-v1" as const;

function normalizeCodePoint(value: string): string {
  if (value === "\r") return "\n";
  if (value === "\t") return " ";
  return value.normalize("NFKC");
}

function toCodePoints(value: string): string[] {
  return [...value];
}

function buildComparison(raw: string, locale: SafetyLocale): Readonly<{ comparisonText: string; map: readonly NormalizedCodePointMap[]; warnings: readonly NormalizedMessage["warnings"][number][] }> {
  const comparison: string[] = [];
  const map: NormalizedCodePointMap[] = [];
  const warnings = new Set<NormalizedMessage["warnings"][number]>();
  let normalizedOffset = 0;
  for (const [sourceIndex, sourceCodePoint] of toCodePoints(raw).entries()) {
    const normalized = normalizeCodePoint(sourceCodePoint).toLocaleLowerCase(locale);
    if (normalized !== sourceCodePoint) {
      if (sourceCodePoint === "\r" || sourceCodePoint === "\t") warnings.add("WHITESPACE_NORMALIZED");
      if (sourceCodePoint.normalize("NFKC") !== sourceCodePoint) warnings.add("CONFUSABLE_CHARACTER");
    }
    comparison.push(normalized);
    const normalizedLength = codePointLength(normalized);
    map.push({ normalizedStart: normalizedOffset, normalizedEnd: normalizedOffset + normalizedLength, sourceStart: sourceIndex, sourceEnd: sourceIndex + 1 });
    normalizedOffset += normalizedLength;
  }
  if (locale === "es-CO" && /\b(?:the|my|baby|child)\b/iu.test(comparison.join(""))) warnings.add("MIXED_LANGUAGE");
  if (locale === "en-US" && /\b(?:el|la|mi|hijo|niña|niño)\b/iu.test(comparison.join(""))) warnings.add("MIXED_LANGUAGE");
  return { comparisonText: comparison.join(""), map: deepFreeze(map), warnings: deepFreeze([...warnings]) };
}

function findLexiconMatches(tokens: readonly ReturnType<typeof tokenize>[number][], locale: SafetyLocale): readonly LexiconMatch[] {
  const selected = locale === "es-CO" ? ES_CO_LEXICON_V1 : EN_US_LEXICON_V1;
  const other = locale === "es-CO" ? EN_US_LEXICON_V1 : ES_CO_LEXICON_V1;
  const matches: LexiconMatch[] = [];
  for (const token of tokens) {
    if (token.kind !== "word") continue;
    const entry = selected.find((candidate) => candidate.variants.includes(token.comparisonText));
    if (entry) {
      matches.push(deepFreeze({ code: entry.code, canonicalToken: entry.canonicalToken, locale: entry.locale, reviewSourceId: entry.reviewSourceId, span: token.span }));
      continue;
    }
    if (other.some((candidate) => candidate.variants.includes(token.comparisonText))) {
      matches.push(deepFreeze({ code: "mixed-language.variant", canonicalToken: token.comparisonText, locale: locale === "es-CO" ? "en-US" : "es-CO", reviewSourceId: "synthetic-mixed-language-v1", span: token.span }));
    }
  }
  return deepFreeze(matches);
}

function makeRaw(text: string, locale: SafetyLocale): RawGuardianMessage {
  return createRawGuardianMessage({ text, locale, source: "guardian", requestId: "normalization-only" });
}

export function normalizeMessage(raw: RawGuardianMessage): NormalizedMessage;
export function normalizeMessage(text: string, locale: SafetyLocale): NormalizedMessage;
export function normalizeMessage(rawOrText: RawGuardianMessage | string, locale?: SafetyLocale): NormalizedMessage {
  const raw = typeof rawOrText === "string"
    ? makeRaw(rawOrText, locale ?? (() => { throw new SafetyInputError("UNSUPPORTED_LOCALE"); })())
    : rawOrText;
  const built = buildComparison(raw.text, raw.locale);
  const tokens = tokenize({ originalText: raw.text, comparisonText: built.comparisonText, codePointMap: built.map });
  const spans: TextSpan[] = tokens.filter((token) => token.kind !== "whitespace").map((token) => token.span);
  if (spans.length > 256) throw new SafetyInputError("LIMIT_EXCEEDED");
  const warnings = new Set(built.warnings);
  if (built.comparisonText.length > 0 && !/[.!?。！？]$/u.test(built.comparisonText.trim())) warnings.add("PUNCTUATION_MISSING");
  const lexiconMatches = findLexiconMatches(tokens, raw.locale);
  if (lexiconMatches.some((match) => match.locale !== raw.locale)) warnings.add("MIXED_LANGUAGE");
  return deepFreeze({
    originalText: raw.text,
    comparisonText: built.comparisonText,
    locale: raw.locale,
    source: raw.source,
    requestId: raw.requestId,
    tokens,
    spans: deepFreeze(spans),
    lexiconMatches,
    warnings: deepFreeze([...warnings]),
    version: NORMALIZATION_VERSION,
  });
}
