import type { AssertionContext, NormalizedMessage, TextSpan, TrustedSafetyContext } from "./message-types";
import { ASSERTION_EN_US_V1 } from "./lexicons/assertion-en-US.v1";
import { ASSERTION_ES_CO_V1 } from "./lexicons/assertion-es-CO.v1";

export type AssertionRuleCode =
  | "ASSERTION_NEGATED"
  | "ASSERTION_PRESENT"
  | "ASSERTION_POSSIBLE"
  | "ASSERTION_UNKNOWN"
  | "SUBJECT_ACTIVE_CHILD"
  | "SUBJECT_OTHER_PERSON"
  | "SUBJECT_UNKNOWN"
  | "TEMPORAL_CURRENT"
  | "TEMPORAL_PAST"
  | "TEMPORAL_FUTURE"
  | "TEMPORAL_UNKNOWN"
  | "QUOTED_CONTENT"
  | "COPIED_INSTRUCTION"
  | "CUE_CONFLICT";

export type AssertionLexiconVersion = "assertion-es-CO-v1" | "assertion-en-US-v1";
export type AssertionSubject = "active_child" | "other_person" | "unknown";
export type AssertionValue = "present" | "absent" | "possible" | "unknown";
export type AssertionTemporality = "current" | "past" | "future" | "unknown";
export type QuotationKind = "none" | "direct" | "copied_instruction";

export type AssertionContextResult = Readonly<{
  subject: AssertionSubject;
  assertion: AssertionValue;
  temporality: AssertionTemporality;
  quotation: QuotationKind;
  confidence: "deterministic" | "ambiguous";
  evidenceSpans: readonly TextSpan[];
  ruleCodes: readonly AssertionRuleCode[];
  lexiconVersion: AssertionLexiconVersion;
}>;

type CueSet = typeof ASSERTION_ES_CO_V1 | typeof ASSERTION_EN_US_V1;

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];
const lower = (message: NormalizedMessage): string => message.comparisonText;

function containsCue(text: string, cue: string): boolean {
  return cue.includes(" ") ? text.includes(cue) : new RegExp(`(?:^|[^\\p{L}\\p{N}])${cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

function firstCueSpan(message: NormalizedMessage, cues: readonly string[]): TextSpan | undefined {
  for (const token of message.tokens) if (token.kind === "word" && cues.includes(token.comparisonText)) return token.span;
  return undefined;
}

function quotedKind(text: string, cues: CueSet): QuotationKind {
  if ((text.includes("\"") && text.split("\"").length >= 3) || (text.includes("“") && text.includes("”"))) return "direct";
  return cues.instruction.some((cue) => containsCue(text, cue)) ? "copied_instruction" : "none";
}

export function classifyAssertionContext(
  message: NormalizedMessage,
  candidateSpan: TextSpan,
  _context: TrustedSafetyContext,
): AssertionContextResult {
  const cues = message.locale === "es-CO" ? ASSERTION_ES_CO_V1 : ASSERTION_EN_US_V1;
  const text = lower(message);
  const ruleCodes: AssertionRuleCode[] = [];
  const evidenceSpans: TextSpan[] = [candidateSpan];
  const quotation = quotedKind(text, cues);
  if (quotation === "direct") ruleCodes.push("QUOTED_CONTENT");
  if (quotation === "copied_instruction") ruleCodes.push("COPIED_INSTRUCTION");

  const active = cues.activeChild.some((cue) => containsCue(text, cue));
  const other = cues.otherPerson.some((cue) => containsCue(text, cue));
  let subject: AssertionSubject = active && !other ? "active_child" : other && !active ? "other_person" : "unknown";
  if (subject === "active_child") ruleCodes.push("SUBJECT_ACTIVE_CHILD");
  else if (subject === "other_person") ruleCodes.push("SUBJECT_OTHER_PERSON");
  else ruleCodes.push("SUBJECT_UNKNOWN");

  const past = cues.past.some((cue) => containsCue(text, cue));
  const future = cues.future.some((cue) => containsCue(text, cue));
  const current = cues.present.some((cue) => containsCue(text, cue));
  const temporality: AssertionTemporality = past && future || past && current || future && current ? "unknown" : past ? "past" : future ? "future" : current ? "current" : "unknown";
  ruleCodes.push(temporality === "past" ? "TEMPORAL_PAST" : temporality === "future" ? "TEMPORAL_FUTURE" : temporality === "current" ? "TEMPORAL_CURRENT" : "TEMPORAL_UNKNOWN");

  const candidateIndex = message.tokens.findIndex((token) => token.span.sourceStart === candidateSpan.sourceStart && token.span.sourceEnd === candidateSpan.sourceEnd);
  const before = candidateIndex < 0 ? [] : message.tokens.slice(Math.max(0, candidateIndex - 4), candidateIndex).map((token) => token.comparisonText);
  const negations = before.filter((token) => cues.negation.includes(token as never));
  const pseudoNegated = before.includes(message.locale === "es-CO" ? "puede" : "can");
  const uncertain = cues.uncertainty.some((cue) => containsCue(text, cue)) || text.includes("?");
  const doubleNegation = negations.length > 1;
  let assertion: AssertionValue = "unknown";
  if (doubleNegation || quotation !== "none") assertion = "unknown";
  else if (pseudoNegated) assertion = "present";
  else if (negations.length > 0) assertion = "absent";
  else if (uncertain) assertion = "possible";
  else if (subject === "active_child" && temporality === "current") assertion = "present";
  if (assertion === "absent") ruleCodes.push("ASSERTION_NEGATED");
  else if (assertion === "present") ruleCodes.push("ASSERTION_PRESENT");
  else if (assertion === "possible") ruleCodes.push("ASSERTION_POSSIBLE");
  else ruleCodes.push("ASSERTION_UNKNOWN");
  if (doubleNegation || (active && other) || (past && future)) ruleCodes.push("CUE_CONFLICT");
  return Object.freeze({
    subject,
    assertion,
    temporality,
    quotation,
    confidence: assertion === "unknown" || subject === "unknown" || temporality === "unknown" ? "ambiguous" : "deterministic",
    evidenceSpans: Object.freeze(evidenceSpans),
    ruleCodes: Object.freeze(unique(ruleCodes)),
    lexiconVersion: cues.version,
  });
}
