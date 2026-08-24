import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA,
  type ValidateDeclaredPediatricDoseTrustedResult,
} from "../../agent/tools/validate_declared_pediatric_dose";
import {
  GENERIC_PROFESSIONAL_REVIEW_COPIES,
  validateProfessionalReviewCopy,
} from "../safety/professional-review-copy";

const TRUSTED_DATA_SCHEMA = VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA.shape.data;
const DECLARED_SCHEMA = TRUSTED_DATA_SCHEMA.shape.declared;
const RESOLVED_SCHEMA = TRUSTED_DATA_SCHEMA.shape.resolved;
const COMPUTED_SCHEMA = TRUSTED_DATA_SCHEMA.shape.computed;
const SOURCES_SCHEMA = RESOLVED_SCHEMA.shape.sources;
const REASON_CODES_SCHEMA = TRUSTED_DATA_SCHEMA.shape.reasonCodes;
const LOCALE = z.enum(["es-CO", "en-US"]);
const SAFE_TEXT = z.string().min(1).max(128_000).refine((value) => (
  value === value.normalize("NFKC")
    && !/[\u0000-\u001f\u007f<>`]/u.test(value)
    && !/(?:\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|(?:ignore|forget|ignora|olvida).{0,48}(?:previous|prior|anteriores?|system|sistema|instruction|instrucciones?))/iu.test(value)
), "unsafe_text");
const OUTCOME = z.enum([
  "within_reference_limits",
  "outside_reference_limits",
  "insufficient_data",
  "requires_professional_review",
]);

const PROFESSIONAL_REVIEW_SCHEMA = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not_present"), messageId: z.null(), text: z.null() }).strict(),
  z.object({
    state: z.literal("present"),
    messageId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
    text: SAFE_TEXT.max(280),
  }).strict(),
]);

const EVIDENCE_DATES_SCHEMA = z.object({
  packageEffectiveFrom: z.string().datetime({ offset: true }),
  packageEffectiveUntil: z.string().datetime({ offset: true }).nullable(),
  ageReferenceAt: z.string().datetime({ offset: true }).nullable(),
  ageObservedAt: z.string().datetime({ offset: true }).nullable(),
  weightMeasuredAt: z.string().datetime({ offset: true }).nullable(),
  weightConfirmedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const DOSE_VALIDATION_WIDGET_SCHEMA = z.object({
  kind: z.literal("dose_validation"),
  version: z.literal("medication.dose-validation.v1"),
  data: z.object({
    locale: LOCALE,
    outcome: OUTCOME,
    title: SAFE_TEXT.max(160),
    outcomeLabel: SAFE_TEXT.max(160),
    notice: SAFE_TEXT.max(600),
    declared: DECLARED_SCHEMA,
    resolved: RESOLVED_SCHEMA,
    computed: COMPUTED_SCHEMA,
    reasons: z.object({
      all: REASON_CODES_SCHEMA,
      missing: TRUSTED_DATA_SCHEMA.shape.missingReasonCodes,
      review: TRUSTED_DATA_SCHEMA.shape.reviewReasonCodes,
    }).strict(),
    citations: SOURCES_SCHEMA,
    evidenceDates: EVIDENCE_DATES_SCHEMA,
    professionalReview: PROFESSIONAL_REVIEW_SCHEMA,
    screenReaderSummary: SAFE_TEXT,
    fallbackText: SAFE_TEXT,
  }).strict(),
}).strict();

export type DoseValidationWidget = Readonly<z.infer<typeof DOSE_VALIDATION_WIDGET_SCHEMA>>;
type Locale = z.infer<typeof LOCALE>;
type TrustedData = ValidateDeclaredPediatricDoseTrustedResult["data"];
type Outcome = TrustedData["outcome"];

export class DoseValidationPresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Dose validation presentation contract invalid");
    this.name = "DoseValidationPresentationError";
  }
}

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    title: "Comparación de dosis declarada",
    outcome: {
      within_reference_limits: "Dentro de los límites de referencia",
      outside_reference_limits: "Fuera de los límites de referencia",
      insufficient_data: "Datos insuficientes",
      requires_professional_review: "Revisión profesional requerida",
    },
    notice: "validate_declared_pediatric_dose solo contrasta una dosis ingresada por el tutor contra un formulario aprobado. El resultado nunca se expresa como “seguro”, no autoriza administrar y no genera una dosis alternativa.",
    summary: (label: string) => `Comparación de dosis declarada: ${label}.`,
    declared: "Declarado",
    resolved: "Resuelto",
    computed: "Calculado",
    reasons: "Razones",
  }),
  "en-US": Object.freeze({
    title: "Declared-dose comparison",
    outcome: {
      within_reference_limits: "Within reference limits",
      outside_reference_limits: "Outside reference limits",
      insufficient_data: "Insufficient data",
      requires_professional_review: "Professional review required",
    },
    notice: "The dose validator only compares the exact regimen already declared by the caregiver. within_reference_limits is not approval, a prescription, proof of appropriateness, or an instruction to administer.",
    summary: (label: string) => `Declared-dose comparison: ${label}.`,
    declared: "Declared",
    resolved: "Resolved",
    computed: "Computed",
    reasons: "Reasons",
  }),
});

function fail(): never {
  throw new DoseValidationPresentationError();
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function same(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function sortedUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function epoch(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) fail();
  return result;
}

function validateReasons(data: TrustedData): void {
  if (!sortedUnique(data.reasonCodes)
    || !sortedUnique(data.missingReasonCodes)
    || !sortedUnique(data.reviewReasonCodes)) fail();

  if (data.outcome === "insufficient_data") {
    if (!same(data.reasonCodes, data.missingReasonCodes) || data.reviewReasonCodes.length !== 0) fail();
    return;
  }
  if (data.outcome === "requires_professional_review") {
    if (!same(data.reasonCodes, data.reviewReasonCodes) || data.missingReasonCodes.length !== 0) fail();
    return;
  }
  if (data.missingReasonCodes.length !== 0 || data.reviewReasonCodes.length !== 0) fail();
}

function validateResolved(data: TrustedData): void {
  const { declared, resolved } = data;
  if (resolved.product !== null && (
    resolved.product.conceptCode !== declared.product.conceptCode
    || resolved.product.codingSystem !== declared.product.codingSystem
  )) fail();
  if (resolved.presentation !== null && !same({
    form: resolved.presentation.form,
    route: resolved.presentation.route,
    release: resolved.presentation.release,
    concentration: resolved.presentation.concentration,
  }, {
    form: declared.label.form,
    route: declared.route,
    release: declared.label.release,
    concentration: declared.label.concentration,
  })) fail();
  if (resolved.rule !== null && resolved.rule.route !== declared.route) fail();

  const packageFrom = epoch(resolved.package.effectiveFrom);
  const packageUntil = resolved.package.effectiveUntil === null ? null : epoch(resolved.package.effectiveUntil);
  if (packageUntil !== null && packageUntil <= packageFrom) fail();

  if (resolved.age !== null) {
    const ageReference = epoch(resolved.age.referenceAt);
    const ageObserved = epoch(resolved.age.observedAt);
    if (ageObserved > ageReference
      || packageFrom > ageReference
      || (packageUntil !== null && ageReference >= packageUntil)) fail();
  }

  if (resolved.weight !== null) {
    const measured = epoch(resolved.weight.measuredAt);
    const confirmed = epoch(resolved.weight.confirmedAt);
    if (measured > confirmed
      || (resolved.age !== null && confirmed > epoch(resolved.age.referenceAt))) fail();
  }

  const handles = resolved.sources.map(({ citationHandle }) => citationHandle);
  const labels = resolved.sources.map(({ label }) => label);
  if (new Set(handles).size !== handles.length || new Set(labels).size !== labels.length) fail();

  if (data.outcome === "within_reference_limits" || data.outcome === "outside_reference_limits") {
    if (resolved.product === null || resolved.presentation === null || resolved.rule === null
      || resolved.age === null || resolved.weight === null) fail();
  }
}

function ingredientLabels(entries: readonly Readonly<{ ingredientLabel: string }>[]): readonly string[] {
  return entries.map(({ ingredientLabel }) => ingredientLabel).sort();
}

function validateComputed(data: TrustedData): void {
  const { conversions, perDose, daily } = data.computed;
  const conversionLabels = ingredientLabels(conversions);
  const perDoseLabels = ingredientLabels(perDose);
  const dailyLabels = ingredientLabels(daily);
  if (new Set(conversionLabels).size !== conversionLabels.length
    || new Set(perDoseLabels).size !== perDoseLabels.length
    || new Set(dailyLabels).size !== dailyLabels.length) fail();

  if (conversions.length > 0 || perDose.length > 0 || daily.length > 0) {
    if (!same(conversionLabels, perDoseLabels) || !same(conversionLabels, dailyLabels)) fail();
  }
  const conversionByIngredient = new Map(conversions.map((item) => [item.ingredientLabel, item]));
  for (const item of perDose) {
    const conversion = conversionByIngredient.get(item.ingredientLabel);
    if (!conversion || item.amount !== conversion.amount || item.unit !== conversion.unit) fail();
  }
  for (const item of daily) {
    const conversion = conversionByIngredient.get(item.ingredientLabel);
    if (!conversion || (item.unit !== null && item.unit !== conversion.unit)) fail();
  }

  const statuses = [...perDose, ...daily].map(({ status }) => status);
  if (data.outcome === "within_reference_limits") {
    if (conversions.length === 0 || perDose.length === 0 || daily.length === 0
      || statuses.some((status) => status !== "within")) fail();
  } else if (data.outcome === "outside_reference_limits") {
    if (conversions.length === 0 || !statuses.includes("outside")
      || statuses.some((status) => status === "insufficient_data" || status === "requires_professional_review")) fail();
  } else if (data.outcome === "insufficient_data") {
    if (statuses.includes("requires_professional_review")) fail();
  } else if (statuses.length > 0 && !statuses.includes("requires_professional_review")) fail();
}

function dates(data: TrustedData): z.infer<typeof EVIDENCE_DATES_SCHEMA> {
  return {
    packageEffectiveFrom: data.resolved.package.effectiveFrom,
    packageEffectiveUntil: data.resolved.package.effectiveUntil,
    ageReferenceAt: data.resolved.age?.referenceAt ?? null,
    ageObservedAt: data.resolved.age?.observedAt ?? null,
    weightMeasuredAt: data.resolved.weight?.measuredAt ?? null,
    weightConfirmedAt: data.resolved.weight?.confirmedAt ?? null,
  };
}

function serialize(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) fail();
  return result;
}

function finalize(candidate: unknown): DoseValidationWidget {
  const parsed = DOSE_VALIDATION_WIDGET_SCHEMA.safeParse(candidate);
  if (!parsed.success) fail();
  return deepFreeze(parsed.data);
}

function professionalReview(outcome: Outcome, locale: Locale): z.infer<typeof PROFESSIONAL_REVIEW_SCHEMA> {
  if (outcome === "within_reference_limits") {
    return { state: "not_present", messageId: null, text: null };
  }
  const copy = validateProfessionalReviewCopy(GENERIC_PROFESSIONAL_REVIEW_COPIES[locale]);
  return { state: "present", messageId: copy.messageId, text: copy.text };
}

export function presentDoseValidation(raw: unknown, rawLocale: unknown): DoseValidationWidget {
  const parsed = VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  const locale = LOCALE.safeParse(rawLocale);
  if (!parsed.success || !locale.success) fail();
  const data = parsed.data.data;
  validateReasons(data);
  validateResolved(data);
  validateComputed(data);

  const copy = COPY[locale.data];
  const label = copy.outcome[data.outcome];
  const review = professionalReview(data.outcome, locale.data);
  const summary = `${copy.summary(label)} ${copy.notice}${review.state === "present" ? ` ${review.text}` : ""}`;
  const traceDetails = [
    ...data.computed.conversions.map((item) => `${item.ingredientLabel}: ${item.amount} ${item.unit}.`),
    ...data.computed.perDose.map((item) => `${item.ingredientLabel}: ${item.status}; ${item.amount ?? "null"} ${item.unit ?? "null"}; ${item.referenceLower ?? "null"}–${item.referenceUpper ?? "null"}.`),
    ...data.computed.daily.map((item) => `${item.ingredientLabel}: ${item.status}; ${item.dailyAmount ?? "null"} ${item.unit ?? "null"}; ${item.expectedDoses ?? "null"}.`),
  ];
  const fallback = [
    summary,
    `${copy.declared}: ${serialize(data.declared)}.`,
    `${copy.resolved}: ${serialize(data.resolved)}.`,
    `${copy.computed}: ${serialize(data.computed)}.`,
    ...traceDetails,
    `${copy.reasons}: ${data.reasonCodes.join(", ")}.`,
  ].join(" ");

  return finalize({
    kind: "dose_validation",
    version: "medication.dose-validation.v1",
    data: {
      locale: locale.data,
      outcome: data.outcome,
      title: copy.title,
      outcomeLabel: label,
      notice: copy.notice,
      declared: data.declared,
      resolved: data.resolved,
      computed: data.computed,
      reasons: {
        all: [...data.reasonCodes],
        missing: [...data.missingReasonCodes],
        review: [...data.reviewReasonCodes],
      },
      citations: data.resolved.sources,
      evidenceDates: dates(data),
      professionalReview: review,
      screenReaderSummary: summary,
      fallbackText: fallback,
    },
  });
}
