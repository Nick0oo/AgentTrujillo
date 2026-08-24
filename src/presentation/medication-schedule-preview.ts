import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import { CREATE_MEDICATION_PLAN_INPUT_SCHEMA } from "../../agent/tools/create_medication_plan";
import {
  medicationCodingSystemSchema,
  medicationFormSchema,
  medicationRouteSchema,
  medicationUnitSchema,
} from "../clinical/medication/types";

const LOCALE = z.enum(["es-CO", "en-US"]);
const INSTANT = z.string().datetime({ offset: true });
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const CODE = z.string().min(1).max(120).regex(/^[A-Z][A-Z0-9_]*$/u);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const TIME_ZONE = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}, "invalid_time_zone");
const SAFE_TEXT = z.string().min(1).max(128_000).refine((value) => (
  value === value.normalize("NFKC")
    && !/[\u0000-\u001f\u007f<>`]/u.test(value)
    && !/(?:\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|(?:ignore|forget|ignora|olvida).{0,48}(?:previous|prior|anteriores?|system|sistema|instruction|instrucciones?))/iu.test(value)
), "unsafe_text");

const DECLARATION_SCHEMA = z.object({
  product: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.product,
  presentation: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.presentation,
  dose: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.dose,
  route: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.route,
  frequency: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.frequency,
  startsAt: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.startsAt,
  endsAt: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.endsAt,
  timeZone: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.timeZone,
}).strict();

const INGREDIENT_SCHEMA = z.object({
  ingredientCode: SAFE_TEXT.max(120),
  codingSystem: medicationCodingSystemSchema,
  name: SAFE_TEXT.max(200),
  salt: SAFE_TEXT.max(160).optional(),
  amount: z.string().regex(/^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/u).optional(),
  amountUnit: medicationUnitSchema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.amount === undefined) !== (value.amountUnit === undefined)) {
    context.addIssue({ code: "custom", path: ["amount"], message: "amount_unit_pair_required" });
  }
});

const RESOLVED_PRODUCT_SCHEMA = z.object({
  displayName: SAFE_TEXT.max(200),
  conceptCode: SAFE_TEXT.max(120),
  codingSystem: medicationCodingSystemSchema,
}).strict();

const RESOLVED_PRESENTATION_SCHEMA = z.object({
  form: medicationFormSchema,
  route: medicationRouteSchema,
  release: z.enum(["immediate", "extended", "delayed", "unknown"]),
  regulatoryIdentifier: SAFE_TEXT.max(240),
  concentration: CREATE_MEDICATION_PLAN_INPUT_SCHEMA.shape.presentation.shape.concentration,
  ingredients: z.array(INGREDIENT_SCHEMA).min(1).max(8),
}).strict();

const RESOLUTION_SCHEMA = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    product: RESOLVED_PRODUCT_SCHEMA,
    presentation: RESOLVED_PRESENTATION_SCHEMA,
    explanationCodes: z.array(CODE).min(1).max(12),
  }).strict(),
  z.object({
    status: z.enum(["ambiguous", "missing"]),
    product: RESOLVED_PRODUCT_SCHEMA.nullable(),
    presentation: z.null(),
    explanationCodes: z.array(CODE).min(1).max(12),
  }).strict(),
]);

const RESOLUTION_OUTPUT_SCHEMA = z.object({
  product: RESOLVED_PRODUCT_SCHEMA.nullable(),
  presentation: RESOLVED_PRESENTATION_SCHEMA.nullable(),
  explanationCodes: z.array(CODE).min(1).max(12),
}).strict();

const APPROVAL_ENTRY_SCHEMA = z.object({
  path: z.string().min(1).max(256),
  value: z.string().max(1_024),
}).strict();

const APPROVAL_PREVIEW_SCHEMA = z.object({
  kind: z.literal("tool_approval_preview"),
  version: z.literal("tool-approval-preview.v1"),
  toolId: z.literal("create_medication_plan"),
  schemaVersion: z.literal("create-medication-plan.v1"),
  effect: z.literal("mutating"),
  subject: z.literal("active_child"),
  locale: LOCALE,
  actionLabel: SAFE_TEXT.max(120),
  entries: z.array(APPROVAL_ENTRY_SCHEMA).min(1).max(128),
  expiresAt: INSTANT,
  approvalDigest: HASH,
}).strict();

export const MEDICATION_SCHEDULE_PREVIEW_DRAFT_SCHEMA = z.object({
  kind: z.literal("medication_schedule_preview_draft"),
  version: z.literal("medication.schedule-preview-input.v1"),
  approvalDigest: HASH,
  approvalPreview: APPROVAL_PREVIEW_SCHEMA,
  declaration: CREATE_MEDICATION_PLAN_INPUT_SCHEMA,
  resolution: RESOLUTION_SCHEMA,
}).strict();

const OCCURRENCE_INPUT_SCHEMA = z.object({
  occurrenceId: OPAQUE_ID,
  planId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  scheduledFor: INSTANT,
  localDate: DATE,
  timeZone: TIME_ZONE,
  source: z.enum(["interval", "times_of_day"]),
}).strict();

const OCCURRENCE_OUTPUT_SCHEMA = OCCURRENCE_INPUT_SCHEMA.pick({
  scheduledFor: true,
  localDate: true,
  timeZone: true,
  source: true,
});

const WIDGET_DATA_SCHEMA = z.object({
  locale: LOCALE,
  status: z.enum(["resolved", "ambiguous", "missing"]),
  title: SAFE_TEXT.max(160),
  notice: SAFE_TEXT.max(800),
  declared: DECLARATION_SCHEMA,
  resolved: RESOLUTION_OUTPUT_SCHEMA,
  occurrences: z.array(OCCURRENCE_OUTPUT_SCHEMA).max(64),
  dstDisclosure: z.object({
    crossesOffsetChange: z.boolean(),
    text: SAFE_TEXT.max(280),
  }).strict(),
  confirmation: z.object({
    toolId: z.literal("create_medication_plan"),
    schemaVersion: z.literal("create-medication-plan.v1"),
    actionLabel: SAFE_TEXT.max(120),
    approvalDigest: HASH,
    expiresAt: INSTANT,
  }).strict(),
  screenReaderSummary: SAFE_TEXT,
  fallbackText: SAFE_TEXT,
}).strict().superRefine((value, context) => {
  if (value.status === "resolved" && (value.resolved.product === null || value.resolved.presentation === null)) {
    context.addIssue({ code: "custom", path: ["resolved"], message: "resolved_data_required" });
  }
  if (value.status !== "resolved" && value.resolved.presentation !== null) {
    context.addIssue({ code: "custom", path: ["resolved", "presentation"], message: "unresolved_presentation_forbidden" });
  }
});

export const MEDICATION_SCHEDULE_PREVIEW_WIDGET_SCHEMA = z.object({
  kind: z.literal("medication_schedule_preview"),
  version: z.literal("medication.schedule-preview.v1"),
  data: WIDGET_DATA_SCHEMA,
}).strict();

export type MedicationSchedulePreviewDraft = Readonly<z.infer<typeof MEDICATION_SCHEDULE_PREVIEW_DRAFT_SCHEMA>>;
export type MedicationSchedulePreviewWidget = Readonly<z.infer<typeof MEDICATION_SCHEDULE_PREVIEW_WIDGET_SCHEMA>>;
type Locale = z.infer<typeof LOCALE>;
type Occurrence = z.infer<typeof OCCURRENCE_INPUT_SCHEMA>;

export class MedicationSchedulePreviewPresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Medication schedule preview presentation contract invalid");
    this.name = "MedicationSchedulePreviewPresentationError";
  }
}

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    title: "Vista previa del plan de medicamento declarado",
    notice: "Registra un plan de medicamento que el tutor declara que ya existe. No selecciona medicamento, no prescribe, no modifica dosis y no indica que administrar sea seguro.",
    status: Object.freeze({
      resolved: "Presentación resuelta",
      ambiguous: "La presentación declarada es ambigua",
      missing: "La presentación declarada no está disponible",
    }),
    declared: "Declarado por el tutor",
    resolved: "Resuelto",
    schedule: "Ocurrencias generadas",
    none: "Sin ocurrencias generadas",
    dst: Object.freeze({
      changed: "La vista previa cruza un cambio de desfase horario; conserva los instantes y las fechas locales generadas.",
      unchanged: "La vista previa no cruza un cambio de desfase horario entre las ocurrencias mostradas.",
    }),
  }),
  "en-US": Object.freeze({
    title: "Declared medication schedule preview",
    notice: "This module records caregiver-declared medication plans and intake facts, renders their schedules, summarizes factual adherence, and compares an already-declared dose against exact approved pediatric reference limits. It never selects a medicine, creates or changes a dose, prescribes, diagnoses, or states that administration is safe.",
    status: Object.freeze({
      resolved: "Presentation resolved",
      ambiguous: "The declared presentation is ambiguous",
      missing: "The declared presentation is unavailable",
    }),
    declared: "Caregiver-declared",
    resolved: "Resolved",
    schedule: "Generated occurrences",
    none: "No generated occurrences",
    dst: Object.freeze({
      changed: "The preview crosses a time-offset change and preserves the generated instants and local dates.",
      unchanged: "The preview does not cross a time-offset change among the displayed occurrences.",
    }),
  }),
});

const EXPECTED_ACTION_LABEL = Object.freeze({
  "es-CO": "Crear borrador de plan de medicamento",
  "en-US": "Create medication plan draft",
});

function fail(): never {
  throw new MedicationSchedulePreviewPresentationError();
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

function flatten(value: unknown, path = ""): readonly Readonly<{ path: string; value: string }>[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [Object.freeze({ path: path || "input", value: "[]" })];
    return value.flatMap((item, index) => flatten(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return [Object.freeze({ path: path || "input", value: "{}" })];
    return entries.flatMap(([key, item]) => flatten(item, path ? `${path}.${key}` : key));
  }
  const rendered = value === null ? "null" : typeof value === "string" ? value : String(value);
  return [Object.freeze({ path: path || "input", value: rendered })];
}

function epoch(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail();
  return parsed;
}

function localDateAt(instant: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(instant));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    const result = year && month && day ? `${year}-${month}-${day}` : "";
    if (!DATE.safeParse(result).success) fail();
    return result;
  } catch {
    return fail();
  }
}

function offsetMinutesAt(instant: string, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
    const result = Math.round((asUtc - epoch(instant)) / 60_000);
    if (!Number.isFinite(result)) fail();
    return result;
  } catch {
    return fail();
  }
}

function validateResolution(draft: MedicationSchedulePreviewDraft): void {
  const { declaration, resolution } = draft;
  if (resolution.product !== null && (
    resolution.product.conceptCode !== declaration.product.conceptCode
    || resolution.product.codingSystem !== declaration.product.codingSystem
  )) fail();
  if (resolution.status === "resolved") {
    if (!same({
      form: resolution.presentation.form,
      route: resolution.presentation.route,
      release: resolution.presentation.release,
      regulatoryIdentifier: resolution.presentation.regulatoryIdentifier,
      concentration: resolution.presentation.concentration,
    }, {
      form: declaration.presentation.form,
      route: declaration.route,
      release: declaration.presentation.release,
      regulatoryIdentifier: declaration.presentation.regulatoryIdentifier,
      concentration: declaration.presentation.concentration,
    })) fail();
  }
  const codes = resolution.explanationCodes;
  if (new Set(codes).size !== codes.length
    || codes.some((code, index) => index > 0 && codes[index - 1]! >= code)) fail();
}

function validateOccurrences(draft: MedicationSchedulePreviewDraft, occurrences: readonly Occurrence[]): void {
  if (draft.resolution.status !== "resolved" && occurrences.length !== 0) fail();
  if (draft.declaration.frequency.kind === "as_needed" && occurrences.length !== 0) fail();
  const expectedSource = draft.declaration.frequency.kind === "interval" ? "interval"
    : draft.declaration.frequency.kind === "times_of_day" ? "times_of_day" : null;
  const from = epoch(draft.declaration.startsAt);
  const declaredEnd = draft.declaration.endsAt === undefined ? Number.POSITIVE_INFINITY : epoch(draft.declaration.endsAt);
  const to = Math.min(declaredEnd, from + 7 * 24 * 60 * 60 * 1_000);
  const planId = occurrences[0]?.planId;
  const planVersion = occurrences[0]?.planVersion;
  const ids = new Set<string>();
  const instants = new Set<string>();
  let previousKey = "";
  for (const occurrence of occurrences) {
    const scheduled = epoch(occurrence.scheduledFor);
    const key = `${occurrence.scheduledFor}\u0000${occurrence.occurrenceId}`;
    if (occurrence.planId !== planId
      || occurrence.planVersion !== planVersion
      || occurrence.timeZone !== draft.declaration.timeZone
      || occurrence.source !== expectedSource
      || scheduled < from
      || scheduled >= to
      || occurrence.localDate !== localDateAt(occurrence.scheduledFor, occurrence.timeZone)
      || ids.has(occurrence.occurrenceId)
      || instants.has(occurrence.scheduledFor)
      || (previousKey !== "" && key <= previousKey)) fail();
    ids.add(occurrence.occurrenceId);
    instants.add(occurrence.scheduledFor);
    previousKey = key;
  }
}

function frequencyText(frequency: MedicationSchedulePreviewDraft["declaration"]["frequency"]): string {
  if (frequency.kind === "interval") return `${frequency.everyHours} h`;
  if (frequency.kind === "times_of_day") return frequency.times.join(", ");
  return frequency.label;
}

function fallbackText(
  draft: MedicationSchedulePreviewDraft,
  occurrences: readonly Occurrence[],
  locale: Locale,
  dstText: string,
): string {
  const copy = COPY[locale];
  const { declaration, resolution } = draft;
  const concentration = declaration.presentation.concentration;
  const declaredPresentation = concentration === null
    ? `${declaration.presentation.form}; ${declaration.presentation.release}; ${declaration.presentation.regulatoryIdentifier}`
    : `${declaration.presentation.form}; ${concentration.numerator} ${concentration.numeratorUnit}/${concentration.denominator} ${concentration.denominatorUnit}; ${declaration.presentation.release}; ${declaration.presentation.regulatoryIdentifier}`;
  const resolved = resolution.status === "resolved"
    ? `${resolution.product.displayName}; ${resolution.presentation.form}; ${resolution.presentation.regulatoryIdentifier}`
    : copy.status[resolution.status];
  const occurrenceList = occurrences.length === 0
    ? copy.none
    : occurrences.map((item, index) => `${index + 1}. ${item.scheduledFor}; ${item.localDate}; ${item.timeZone}; ${item.source}`).join(". ");
  return [
    `${copy.title}. ${copy.status[resolution.status]}.`,
    `${copy.declared}: ${declaration.product.displayName}; ${declaredPresentation}; ${declaration.dose.quantity} ${declaration.dose.unit}; ${declaration.route}; ${frequencyText(declaration.frequency)}; ${declaration.startsAt}; ${declaration.endsAt ?? "null"}; ${declaration.timeZone}.`,
    `${copy.resolved}: ${resolved}.`,
    `${copy.schedule}: ${occurrenceList}.`,
    dstText,
    copy.notice,
  ].join(" ");
}

export function presentMedicationSchedulePreview(
  rawDraft: unknown,
  rawOccurrences: unknown,
  rawLocale: unknown,
): MedicationSchedulePreviewWidget {
  const draftResult = MEDICATION_SCHEDULE_PREVIEW_DRAFT_SCHEMA.safeParse(rawDraft);
  const occurrenceResult = z.array(OCCURRENCE_INPUT_SCHEMA).max(64).safeParse(rawOccurrences);
  const localeResult = LOCALE.safeParse(rawLocale);
  if (!draftResult.success || !occurrenceResult.success || !localeResult.success) return fail();
  const draft = draftResult.data;
  const occurrences = occurrenceResult.data;
  const locale = localeResult.data;
  if (draft.approvalPreview.locale !== locale
    || draft.approvalPreview.actionLabel !== EXPECTED_ACTION_LABEL[locale]
    || draft.approvalDigest !== draft.approvalPreview.approvalDigest
    || !same(draft.approvalPreview.entries, flatten(draft.declaration))) fail();
  validateResolution(draft);
  validateOccurrences(draft, occurrences);

  const offsets = new Set(occurrences.map((item) => offsetMinutesAt(item.scheduledFor, item.timeZone)));
  const crossesOffsetChange = offsets.size > 1;
  const dstText = COPY[locale].dst[crossesOffsetChange ? "changed" : "unchanged"];
  const fallback = fallbackText(draft, occurrences, locale, dstText);
  const parsed = MEDICATION_SCHEDULE_PREVIEW_WIDGET_SCHEMA.safeParse({
    kind: "medication_schedule_preview",
    version: "medication.schedule-preview.v1",
    data: {
      locale,
      status: draft.resolution.status,
      title: COPY[locale].title,
      notice: COPY[locale].notice,
      declared: {
        product: draft.declaration.product,
        presentation: draft.declaration.presentation,
        dose: draft.declaration.dose,
        route: draft.declaration.route,
        frequency: draft.declaration.frequency,
        startsAt: draft.declaration.startsAt,
        endsAt: draft.declaration.endsAt,
        timeZone: draft.declaration.timeZone,
      },
      resolved: {
        product: draft.resolution.product,
        presentation: draft.resolution.presentation,
        explanationCodes: draft.resolution.explanationCodes,
      },
      occurrences: occurrences.map(({ scheduledFor, localDate, timeZone, source }) => ({
        scheduledFor,
        localDate,
        timeZone,
        source,
      })),
      dstDisclosure: { crossesOffsetChange, text: dstText },
      confirmation: {
        toolId: draft.approvalPreview.toolId,
        schemaVersion: draft.approvalPreview.schemaVersion,
        actionLabel: draft.approvalPreview.actionLabel,
        approvalDigest: draft.approvalDigest,
        expiresAt: draft.approvalPreview.expiresAt,
      },
      screenReaderSummary: `${COPY[locale].title}: ${COPY[locale].status[draft.resolution.status]}. ${occurrences.length} ${COPY[locale].schedule.toLocaleLowerCase(locale)}.`,
      fallbackText: fallback,
    },
  });
  if (!parsed.success) return fail();
  return deepFreeze(parsed.data) as MedicationSchedulePreviewWidget;
}
