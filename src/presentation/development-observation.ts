import { z } from "zod";

import { CAREGIVER_MILESTONE_DISCLAIMER } from "../application/development/milestone-query";
import {
  attachmentReferenceSchema,
  developmentConcernSchema,
  developmentDomainSchema,
  developmentObservationDraftSchema,
} from "../clinical/development/types";

const LOCALE = z.enum(["es-CO", "en-US"]);
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const DATE = developmentObservationDraftSchema.shape.date;
const CONTROL_OR_INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const UNSAFE_CONTENT = /(?:[<>`]|\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\]|(?:ignore|forget|disregard|override|bypass|ignora|olvida|omite|anula|reemplaza).{0,80}(?:previous|prior|system|developer|assistant|instruction|prompt|policy|anterior(?:es)?|previ[oa]s?|sistema|desarrollador|asistente|instrucci[oó]n(?:es)?|pol[ií]tica))/iu;
const PROFESSIONAL_REFERENCE = /(?:ead[\s_-]*3|ead3|professional|instrument|screen(?:ing)?|tamiz|assessment|scor(?:e|ing)|puntaje|cut[- ]?off|classification|clasificaci[oó]n|diagnos|autis|examiner|evaluador)/iu;
const INTERPRETATION_CLAIM = /\b(?:achieved|attained|missed|pass(?:ed)?|fail(?:ed)?|logr[oó]|alcanz[oó]|cumpli[oó]|fall[oó]|retrasad[oa]|delayed|normal|normalidad|abnormal|anormal|on[- ]?track|advanced|avanzad[oa]|adelantad[oa])\b/iu;
const QUOTABLE_CLINICAL_LANGUAGE = /\b(?:diagnos(?:is|tic|tico|tica)|developmental\s+delay|retraso\s+del\s+desarrollo|autis(?:m|mo)|tdah|adhd|cerebral\s+palsy|par[aá]lisis\s+cerebral|trastorno\s+del\s+desarrollo)\b/iu;

function isSafeText(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL_OR_INVISIBLE.test(value)
    && !UNSAFE_CONTENT.test(value);
}

const SAFE_TEXT = z.string().min(1).max(8_000).refine(isSafeText, "unsafe_text");
function isProfessionalReference(value: string): boolean {
  if (PROFESSIONAL_REFERENCE.test(value)) return true;
  const tokens = value.match(/[A-Za-z0-9+/]{4,}={0,2}/gu) ?? [];
  return tokens.some((token) => {
    if (token.length % 4 !== 0) return false;
    try {
      const decoded = Buffer.from(token, "base64").toString("utf8");
      return /^[\x20-\x7e]+$/u.test(decoded) && PROFESSIONAL_REFERENCE.test(decoded);
    } catch {
      return false;
    }
  });
}

const CAREGIVER_REFERENCE = z.string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u)
  .refine((value) => !isProfessionalReference(value), "professional_reference_forbidden");
const OBSERVATION_TEXT = SAFE_TEXT.max(1_000);
const CONCERN_SCHEMA = developmentConcernSchema.extend({
  text: SAFE_TEXT.max(500),
}).strict();
const ATTACHMENT_SCHEMA = attachmentReferenceSchema.extend({
  state: z.enum(["pending", "clean", "extracted"]),
}).strict();
const DRAFT_SCHEMA = developmentObservationDraftSchema.extend({
  text: OBSERVATION_TEXT,
  source: z.literal("caregiver"),
  milestoneId: CAREGIVER_REFERENCE.nullable().optional(),
  concern: CONCERN_SCHEMA.nullable().optional(),
  attachments: z.array(ATTACHMENT_SCHEMA).max(10).readonly().optional(),
}).strict();
const WARNING = z.enum(["attachment_pending", "quoted_clinical_language_neutral"]);
const DOMAIN = developmentDomainSchema;

const PREVIEW_SCHEMA = z.object({
  draftId: HASH,
  draft: DRAFT_SCHEMA,
  confirmationDigest: HASH,
  warnings: z.array(WARNING).max(2).readonly(),
}).strict();

export const DEVELOPMENT_OBSERVATION_PREVIEW_DRAFT_SCHEMA = z.object({
  kind: z.literal("development_observation_preview_draft"),
  version: z.literal("development.observation-preview-input.v1"),
  confirmationDigest: HASH,
  preview: PREVIEW_SCHEMA,
}).strict();

const ATTACHMENT_OUTPUT_SCHEMA = z.object({
  index: z.number().int().min(1).max(10),
  mime: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  size: z.number().int().min(0).max(20_971_520),
  state: z.enum(["pending", "clean", "extracted"]),
  stateLabel: SAFE_TEXT.max(160),
  ariaLabel: SAFE_TEXT.max(280),
}).strict();

const MILESTONE_OUTPUT_SCHEMA = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("not_present"),
    kind: z.literal("caregiver_communication_reference"),
    referenceCode: z.null(),
    label: z.null(),
  }).strict(),
  z.object({
    state: z.literal("present"),
    kind: z.literal("caregiver_communication_reference"),
    referenceCode: CAREGIVER_REFERENCE,
    label: SAFE_TEXT.max(160),
  }).strict(),
]);

const CONCERN_OUTPUT_SCHEMA = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not_declared"), text: z.null() }).strict(),
  z.object({
    state: z.literal("declared"),
    kind: z.literal("caregiver_question"),
    label: SAFE_TEXT.max(160),
    text: SAFE_TEXT.max(500),
  }).strict(),
]);

const WARNING_OUTPUT_SCHEMA = z.object({
  code: WARNING,
  label: SAFE_TEXT.max(240),
}).strict();

const CONFIRMATION_SCHEMA = z.object({
  confirmationDigest: HASH,
  confirm: z.object({ semantic: z.literal("confirm"), label: SAFE_TEXT.max(120) }).strict(),
  cancel: z.object({ semantic: z.literal("cancel"), label: SAFE_TEXT.max(120) }).strict(),
}).strict();

export const DEVELOPMENT_OBSERVATION_PREVIEW_WIDGET_SCHEMA = z.object({
  kind: z.literal("development_observation_preview"),
  version: z.literal("development.observation-preview.v1"),
  data: z.object({
    locale: LOCALE,
    title: SAFE_TEXT.max(160),
    observation: z.object({
      source: z.literal("caregiver"),
      sourceLabel: SAFE_TEXT.max(120),
      date: DATE,
      dateLabel: SAFE_TEXT.max(120),
      domain: DOMAIN,
      domainLabel: SAFE_TEXT.max(120),
      text: z.object({
        kind: z.literal("caregiver_quote"),
        label: SAFE_TEXT.max(160),
        value: OBSERVATION_TEXT,
      }).strict(),
    }).strict(),
    milestoneReference: MILESTONE_OUTPUT_SCHEMA,
    concern: CONCERN_OUTPUT_SCHEMA,
    attachments: z.array(ATTACHMENT_OUTPUT_SCHEMA).max(10),
    warnings: z.array(WARNING_OUTPUT_SCHEMA).max(2),
    disclaimer: z.literal(CAREGIVER_MILESTONE_DISCLAIMER),
    confirmation: CONFIRMATION_SCHEMA,
    screenReaderSummary: SAFE_TEXT,
    fallbackText: SAFE_TEXT,
  }).strict(),
}).strict();

export type DevelopmentObservationPreviewDraft = Readonly<z.infer<typeof DEVELOPMENT_OBSERVATION_PREVIEW_DRAFT_SCHEMA>>;
export type DevelopmentObservationPreviewWidget = Readonly<z.infer<typeof DEVELOPMENT_OBSERVATION_PREVIEW_WIDGET_SCHEMA>>;
type Locale = z.infer<typeof LOCALE>;

export class DevelopmentObservationPresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Development observation presentation contract invalid");
    this.name = "DevelopmentObservationPresentationError";
  }
}

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    title: "Confirmación de observación del cuidador",
    source: "Cuidador",
    date: "Fecha observada",
    observation: "Relato del cuidador",
    concern: "Pregunta declarada por el cuidador",
    milestone: "Referencia de comunicación para cuidadores",
    confirm: "Confirmar observación",
    cancel: "Cancelar",
    domain: Object.freeze({
      gross_motor: "motricidad gruesa",
      fine_motor: "motricidad fina",
      language: "lenguaje",
      social: "área social",
      cognitive: "área cognitiva",
      adaptive: "área adaptativa",
      general: "desarrollo general",
    }),
    attachment: Object.freeze({
      pending: "Adjunto privado pendiente",
      clean: "Adjunto privado listo",
      extracted: "Adjunto privado procesado",
    }),
    warning: Object.freeze({
      attachment_pending: "El adjunto privado continúa pendiente",
      quoted_clinical_language_neutral: "Lenguaje clínico citado; se conserva únicamente como relato del cuidador",
    }),
    summary: (domain: string, count: number) => `Vista previa de una observación del cuidador en ${domain}, con ${count} ${count === 1 ? "adjunto privado" : "adjuntos privados"}.`,
  }),
  "en-US": Object.freeze({
    title: "Caregiver observation confirmation",
    source: "Caregiver",
    date: "Observed date",
    observation: "Caregiver account",
    concern: "Caregiver-declared question",
    milestone: "Caregiver communication reference",
    confirm: "Confirm observation",
    cancel: "Cancel",
    domain: Object.freeze({
      gross_motor: "gross motor",
      fine_motor: "fine motor",
      language: "language",
      social: "social",
      cognitive: "cognitive",
      adaptive: "adaptive",
      general: "general development",
    }),
    attachment: Object.freeze({
      pending: "Private attachment pending",
      clean: "Private attachment ready",
      extracted: "Private attachment processed",
    }),
    warning: Object.freeze({
      attachment_pending: "The private attachment remains pending",
      quoted_clinical_language_neutral: "Quoted clinical language is retained only as the caregiver's account",
    }),
    summary: (domain: string, count: number) => `Caregiver observation preview in ${domain}, with ${count} private ${count === 1 ? "attachment" : "attachments"}.`,
  }),
});

function fail(): never {
  throw new DevelopmentObservationPresentationError();
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

type Span = Readonly<{ start: number; end: number }>;

function quotedSpans(text: string): readonly Span[] {
  const spans: Span[] = [];
  let open: Readonly<{ mark: string; start: number }> | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const mark = text[index];
    if (mark === "\\") {
      index += 1;
      continue;
    }
    if (open === null && (mark === '"' || mark === "“" || mark === "‘")) {
      open = { mark, start: index };
      continue;
    }
    const closes = open !== null && ((open.mark === '"' && mark === '"') || (open.mark === "“" && mark === "”") || (open.mark === "‘" && mark === "’"));
    if (closes && open !== null) {
      spans.push({ start: open.start, end: index + 1 });
      open = null;
    }
  }
  return spans;
}

function hasCaregiverAttribution(text: string, span: Span): boolean {
  const surrounding = `${text.slice(Math.max(0, span.start - 140), span.start)} ${text.slice(span.end, span.end + 140)}`;
  return /\b(?:caregiver|guardian|parent|mother|father|tutor|cuidador|reported|reports|said|dijo|mencion[oó]|seg[uú]n|according\s+to|quoted|quote)\b/iu.test(surrounding);
}

function clinicalQuotationState(text: string): "neutral" | "quoted" | "invalid" {
  if (INTERPRETATION_CLAIM.test(text)) return "invalid";
  const match = QUOTABLE_CLINICAL_LANGUAGE.exec(text);
  if (match === null) return "neutral";
  const span = quotedSpans(text).find((candidate) => candidate.start <= match.index && candidate.end >= match.index + match[0].length);
  if (span === undefined || !hasCaregiverAttribution(text, span)) return "invalid";
  const outside = text.slice(0, span.start) + text.slice(span.end);
  return QUOTABLE_CLINICAL_LANGUAGE.test(outside) ? "invalid" : "quoted";
}

export function presentDevelopmentObservationPreview(raw: unknown, rawLocale: unknown): DevelopmentObservationPreviewWidget {
  const parsedInput = DEVELOPMENT_OBSERVATION_PREVIEW_DRAFT_SCHEMA.safeParse(raw);
  const parsedLocale = LOCALE.safeParse(rawLocale);
  if (!parsedInput.success || !parsedLocale.success) return fail();
  const input = parsedInput.data;
  const locale = parsedLocale.data;
  const preview = input.preview;
  if (input.confirmationDigest !== preview.confirmationDigest) return fail();
  const clinicalStates = [preview.draft.text, preview.draft.concern?.text]
    .filter((value): value is string => value !== undefined)
    .map(clinicalQuotationState);
  if (clinicalStates.includes("invalid")) return fail();
  if (preview.warnings.includes("quoted_clinical_language_neutral") !== clinicalStates.includes("quoted")) return fail();
  if (preview.warnings.includes("attachment_pending") !== (preview.draft.attachments ?? []).some(({ state }) => state === "pending")) return fail();
  if (new Set(preview.warnings).size !== preview.warnings.length) return fail();
  if (preview.warnings.join("\u0000") !== [...preview.warnings].sort().join("\u0000")) return fail();

  const copy = COPY[locale];
  const domainLabel = copy.domain[preview.draft.domain];
  const attachments = (preview.draft.attachments ?? []).map((attachment, index) => ({
    index: index + 1,
    mime: attachment.mime,
    size: attachment.size,
    state: attachment.state,
    stateLabel: copy.attachment[attachment.state],
    ariaLabel: locale === "es-CO"
      ? `Adjunto privado ${index + 1}: ${attachment.mime}, ${attachment.size} bytes, ${copy.attachment[attachment.state].toLocaleLowerCase(locale)}`
      : `Private attachment ${index + 1}: ${attachment.mime}, ${attachment.size} bytes, ${attachment.state === "clean" ? "ready" : attachment.state === "pending" ? "pending" : "processed"}`,
  }));
  const concern = preview.draft.concern === null || preview.draft.concern === undefined
    ? { state: "not_declared" as const, text: null }
    : {
        state: "declared" as const,
        kind: "caregiver_question" as const,
        label: copy.concern,
        text: preview.draft.concern.text,
      };
  const milestoneReference = preview.draft.milestoneId === null || preview.draft.milestoneId === undefined
    ? {
        state: "not_present" as const,
        kind: "caregiver_communication_reference" as const,
        referenceCode: null,
        label: null,
      }
    : {
        state: "present" as const,
        kind: "caregiver_communication_reference" as const,
        referenceCode: preview.draft.milestoneId,
        label: copy.milestone,
      };
  const warnings = preview.warnings.map((code) => ({ code, label: copy.warning[code] }));
  const summary = copy.summary(domainLabel, attachments.length);
  const fallbackParts = [
    summary,
    `${copy.date}: ${preview.draft.date}.`,
    `${copy.observation}: “${preview.draft.text}”.`,
    concern.state === "declared" ? `${copy.concern}: “${concern.text}”.` : "",
    milestoneReference.state === "present" ? `${copy.milestone}: ${milestoneReference.referenceCode}.` : "",
    ...attachments.map(({ ariaLabel }) => `${ariaLabel}.`),
    ...warnings.map(({ label }) => `${label}.`),
    CAREGIVER_MILESTONE_DISCLAIMER,
  ].filter((value) => value.length > 0).join(" ");

  const candidate = {
    kind: "development_observation_preview" as const,
    version: "development.observation-preview.v1" as const,
    data: {
      locale,
      title: copy.title,
      observation: {
        source: preview.draft.source,
        sourceLabel: copy.source,
        date: preview.draft.date,
        dateLabel: copy.date,
        domain: preview.draft.domain,
        domainLabel,
        text: { kind: "caregiver_quote" as const, label: copy.observation, value: preview.draft.text },
      },
      milestoneReference,
      concern,
      attachments,
      warnings,
      disclaimer: CAREGIVER_MILESTONE_DISCLAIMER,
      confirmation: {
        confirmationDigest: preview.confirmationDigest,
        confirm: { semantic: "confirm" as const, label: copy.confirm },
        cancel: { semantic: "cancel" as const, label: copy.cancel },
      },
      screenReaderSummary: summary,
      fallbackText: fallbackParts,
    },
  };
  const parsedWidget = DEVELOPMENT_OBSERVATION_PREVIEW_WIDGET_SCHEMA.safeParse(candidate);
  if (!parsedWidget.success) return fail();
  return deepFreeze(parsedWidget.data);
}
