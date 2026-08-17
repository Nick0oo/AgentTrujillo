import type { AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope";

export const SAFETY_MESSAGE_LIMITS = Object.freeze({
  maxCodePoints: 8_000,
  maxUtf8Bytes: 32 * 1024,
  maxSpans: 256,
});

export const SUPPORTED_SAFETY_LOCALES = ["es-CO", "en-US"] as const;
export type SafetyLocale = (typeof SUPPORTED_SAFETY_LOCALES)[number];
export type MessageSource = "guardian" | "guardian_follow_up";

export type TextSpan = Readonly<{
  sourceStart: number;
  sourceEnd: number;
  normalizedStart: number;
  normalizedEnd: number;
}>;

export type AssertionSubject = "child" | "guardian" | "other" | "unknown";
export type Temporality = "current" | "past" | "future" | "unknown";
export type Certainty = "certain" | "uncertain" | "unknown";
export type AssertionState = "present" | "absent" | "possible" | "historical" | "quoted" | "instruction" | "unknown";

export type NormalizedMeasurement = Readonly<{
  kind: "temperature" | "weight" | "length" | "unknown";
  value: number;
  unit: string;
  span: TextSpan;
  sourceText: string;
}>;

export type NormalizedAgeMention = Readonly<{
  value: number;
  unit: "days" | "weeks" | "months" | "years";
  span: TextSpan;
  sourceText: string;
}>;

export type AssertionContext = Readonly<{
  subject: AssertionSubject;
  temporality: Temporality;
  certainty: Certainty;
  state: AssertionState;
  span: TextSpan;
}>;

export type NormalizedToken = Readonly<{
  text: string;
  comparisonText: string;
  kind: "word" | "number" | "punctuation" | "whitespace" | "other";
  span: TextSpan;
}>;

export type LexiconMatch = Readonly<{
  code: string;
  canonicalToken: string;
  locale: SafetyLocale;
  reviewSourceId: string;
  span: TextSpan;
}>;

export type RawGuardianMessage = Readonly<{
  text: string;
  locale: SafetyLocale;
  source: MessageSource;
  requestId: string;
}>;

export type NormalizationWarning =
  | "MIXED_LANGUAGE"
  | "UNKNOWN_VARIANT"
  | "CONFUSABLE_CHARACTER"
  | "PUNCTUATION_MISSING"
  | "WHITESPACE_NORMALIZED";

export type NormalizedMessage = Readonly<{
  originalText: string;
  comparisonText: string;
  locale: SafetyLocale;
  source: MessageSource;
  requestId: string;
  tokens: readonly NormalizedToken[];
  spans: readonly TextSpan[];
  lexiconMatches: readonly LexiconMatch[];
  warnings: readonly NormalizationWarning[];
  version: "safety-normalization-v1";
}>;

export type TrustedSafetyContext = Readonly<{
  scopeFingerprint: string;
  authorizationVersion: string;
  chronologicalAgeDays: number;
  correctedAgeDays: number | null;
  countryOfCare: "CO" | "US";
  locale: SafetyLocale;
  timezone: string;
  referenceInstant: Date;
}>;

export type ApprovedEmergencyCopyKey = "emergency_department_es_co_v1" | "emergency_department_en_us_v1";
export type ApprovedClarification = "clarify_subject_or_timing_v1" | "clarify_temperature_unit_v1";

export type SafetyDecision =
  | Readonly<{ decision: "urgent"; responseMode: "emergency_recommendation"; ruleCodes: readonly string[]; copyKey: ApprovedEmergencyCopyKey }>
  | Readonly<{ decision: "clarification_required"; responseMode: "clarify"; question: ApprovedClarification }>
  | Readonly<{ decision: "professional_review"; responseMode: "pediatrician_recommendation"; reasonCode: string }>
  | Readonly<{ decision: "not_urgent"; responseMode: "continue" }>
  | Readonly<{ decision: "indeterminate"; responseMode: "abstain"; reasonCode: string }>;

export type SafetyInputErrorCode =
  | "INVALID_TEXT"
  | "INVALID_ENCODING"
  | "LIMIT_EXCEEDED"
  | "UNSUPPORTED_LOCALE"
  | "INVALID_REQUEST_ID"
  | "INVALID_SPAN"
  | "INVALID_CONTEXT"
  | "STALE_CONTEXT"
  | "INVALID_DECISION";

export class SafetyInputError extends Error {
  readonly code: SafetyInputErrorCode;

  constructor(code: SafetyInputErrorCode) {
    super(code);
    this.name = "SafetyInputError";
    this.code = code;
  }
}

export function isSafetyLocale(value: unknown): value is SafetyLocale {
  return typeof value === "string" && (SUPPORTED_SAFETY_LOCALES as readonly string[]).includes(value);
}

export function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function codePointLength(value: string): number {
  return [...value].length;
}

export function isSafeControlText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) return false;
    if (codePoint >= 0x7f && codePoint <= 0x9f) return false;
  }
  return true;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function assertTextLimits(value: string): void {
  if (!isWellFormedUnicode(value)) throw new SafetyInputError("INVALID_ENCODING");
  if (!isSafeControlText(value)) throw new SafetyInputError("INVALID_TEXT");
  if (codePointLength(value) > SAFETY_MESSAGE_LIMITS.maxCodePoints) throw new SafetyInputError("LIMIT_EXCEEDED");
  if (new TextEncoder().encode(value).byteLength > SAFETY_MESSAGE_LIMITS.maxUtf8Bytes) throw new SafetyInputError("LIMIT_EXCEEDED");
}

export function assertTextSpan(span: TextSpan, sourceLength: number, normalizedLength: number): void {
  if (!Number.isInteger(span.sourceStart) || !Number.isInteger(span.sourceEnd)
    || !Number.isInteger(span.normalizedStart) || !Number.isInteger(span.normalizedEnd)
    || span.sourceStart < 0 || span.sourceStart >= span.sourceEnd || span.sourceEnd > sourceLength
    || span.normalizedStart < 0 || span.normalizedStart >= span.normalizedEnd || span.normalizedEnd > normalizedLength) {
    throw new SafetyInputError("INVALID_SPAN");
  }
}

export type AuthorizedScopeForSafety = Pick<AuthorizedChildScope, "actorUserId" | "careSpaceId" | "childId" | "countryOfCare" | "authorizationVersion" | "expiresAt">;
