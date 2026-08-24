import { z } from "zod";

import {
  EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA,
  type EvaluateVaccinationScheduleTrustedResult,
} from "../../agent/tools/evaluate_vaccination_schedule";
import {
  GENERIC_PROFESSIONAL_REVIEW_COPIES,
  validateProfessionalReviewCopy,
} from "../safety/professional-review-copy";

const MAX_ROWS = 48;
const LOCALE = z.enum(["es-CO", "en-US"]);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "calendar_date");
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const CITATION_HANDLE = z.string().regex(/^citation:v1:[a-f0-9]{64}$/u);
const FACT_HANDLE = z.string().regex(/^fact:v1:[a-f0-9]{64}$/u);
const SAFE_TEXT = z.string().min(1).max(8_000).refine((value) => (
  value === value.normalize("NFKC")
    && !/[\u0000-\u001f\u007f<>`]/u.test(value)
    && !/(?:\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|(?:ignore|forget|ignora|olvida).{0,48}(?:previous|prior|anteriores?|system|sistema|instruction|instrucciones?))/iu.test(value)
), "unsafe_text");
const STATUS = z.enum([
  "applied",
  "upcoming",
  "due",
  "overdue",
  "not_applicable",
  "review_required",
]);
const ICON = z.enum([
  "status_applied",
  "status_upcoming",
  "status_due",
  "status_overdue",
  "status_not_applicable",
  "status_review_required",
]);

const SOURCE_SCHEMA = z.object({
  label: SAFE_TEXT.max(160),
  referenceCode: CODE,
  citationHandle: CITATION_HANDLE,
}).strict();

const DUE_WINDOW_SCHEMA = z.object({
  state: z.enum(["closed", "from_only", "until_only", "not_provided"]),
  from: DATE.nullable(),
  to: DATE.nullable(),
  inclusive: z.literal(true),
  text: SAFE_TEXT,
}).strict();

const DISPLAY_ROW_SCHEMA = z.object({
  id: z.string().regex(/^vaccination-status-[0-9]{3}$/u),
  ruleCode: CODE,
  seriesCode: CODE,
  doseCode: CODE,
  doseNumber: z.number().int().min(1).max(20),
  status: STATUS,
  statusLabel: SAFE_TEXT,
  statusIcon: ICON,
  reasonCode: CODE,
  dueWindow: DUE_WINDOW_SCHEMA,
  evidence: z.object({
    matchedFactCount: z.number().int().nonnegative().max(48),
    matchedFactHandles: z.array(FACT_HANDLE).max(48),
  }).strict(),
  sources: z.array(SOURCE_SCHEMA).min(1).max(16),
}).strict();

const TABLE_COLUMN_SCHEMA = z.object({
  key: z.enum(["series", "dose", "status", "reason", "window", "evidence", "source"]),
  label: SAFE_TEXT,
}).strict();

const PROFESSIONAL_REVIEW_SCHEMA = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not_present"), messageId: z.null(), text: z.null() }).strict(),
  z.object({ state: z.literal("present"), messageId: CODE, text: SAFE_TEXT.max(280) }).strict(),
]);

export const VACCINATION_STATUS_WIDGET_SCHEMA = z.object({
  kind: z.literal("vaccination_status"),
  version: z.literal("vaccination.status.v1"),
  data: z.object({
    locale: LOCALE,
    title: SAFE_TEXT,
    asOfDate: DATE,
    country: z.enum(["CO", "US"]),
    countryLabel: SAFE_TEXT,
    package: z.object({
      id: CODE,
      version: CODE,
      algorithmId: CODE,
    }).strict(),
    timeline: z.object({
      ariaLabel: SAFE_TEXT,
      rows: z.array(DISPLAY_ROW_SCHEMA).max(MAX_ROWS),
    }).strict(),
    table: z.object({
      caption: SAFE_TEXT,
      columns: z.array(TABLE_COLUMN_SCHEMA).length(7),
      rows: z.array(DISPLAY_ROW_SCHEMA).max(MAX_ROWS),
    }).strict(),
    citations: z.array(SOURCE_SCHEMA).max(MAX_ROWS * 16),
    professionalReview: PROFESSIONAL_REVIEW_SCHEMA,
    screenReaderSummary: SAFE_TEXT,
    fallbackText: SAFE_TEXT,
  }).strict(),
}).strict();

export type VaccinationStatusWidget = Readonly<z.infer<typeof VACCINATION_STATUS_WIDGET_SCHEMA>>;
type Locale = z.infer<typeof LOCALE>;
type TrustedAssessment = EvaluateVaccinationScheduleTrustedResult["data"]["assessments"][number];

export class VaccinationStatusPresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Vaccination status presentation contract invalid");
    this.name = "VaccinationStatusPresentationError";
  }
}

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    title: "Estado de vacunación",
    timeline: "Estados deterministas del esquema de vacunación",
    table: "Alternativa textual de los estados de vacunación",
    empty: "No hay estados de vacunación disponibles en este resultado.",
    summary: (count: number, country: string, packageVersion: string) =>
      `Resultado de vacunación con ${count} ${count === 1 ? "estado" : "estados"}; país ${country}; paquete ${packageVersion}.`,
    country: { CO: "Colombia", US: "Estados Unidos" },
    status: {
      applied: "Aplicada",
      upcoming: "Próxima",
      due: "Corresponde",
      overdue: "Fuera de la ventana registrada",
      not_applicable: "No aplica",
      review_required: "Revisión profesional",
    },
    window: {
      closed: (from: string, to: string) => `Desde ${from} hasta ${to}, ambas fechas incluidas.`,
      from_only: (from: string) => `Desde ${from}, fecha incluida; sin fecha final registrada.`,
      until_only: (to: string) => `Hasta ${to}, fecha incluida; sin fecha inicial registrada.`,
      not_provided: "No se registró una ventana de fechas en este resultado.",
    },
    columns: ["Serie", "Dosis", "Estado", "Razón", "Ventana", "Evidencia", "Fuente"],
    row: (row: z.infer<typeof DISPLAY_ROW_SCHEMA>) =>
      `Serie ${row.seriesCode}; dosis ${row.doseCode} número ${row.doseNumber}; estado ${row.status}; razón ${row.reasonCode}; ${row.dueWindow.text} Hechos coincidentes ${row.evidence.matchedFactCount}; fuentes ${row.sources.map((source) => `${source.label} ${source.referenceCode}`).join(", ")}.`,
  }),
  "en-US": Object.freeze({
    title: "Vaccination status",
    timeline: "Deterministic vaccination schedule statuses",
    table: "Text alternative for vaccination statuses",
    empty: "No vaccination statuses are available in this result.",
    summary: (count: number, country: string, packageVersion: string) =>
      `Vaccination result with ${count} ${count === 1 ? "status" : "statuses"}; country ${country}; package ${packageVersion}.`,
    country: { CO: "Colombia", US: "United States" },
    status: {
      applied: "Applied",
      upcoming: "Upcoming",
      due: "Due",
      overdue: "Outside the recorded window",
      not_applicable: "Not applicable",
      review_required: "Professional review",
    },
    window: {
      closed: (from: string, to: string) => `From ${from} through ${to}, both dates inclusive.`,
      from_only: (from: string) => `From ${from}, inclusive; no end date was recorded.`,
      until_only: (to: string) => `Through ${to}, inclusive; no start date was recorded.`,
      not_provided: "No date window was recorded in this result.",
    },
    columns: ["Series", "Dose", "Status", "Reason", "Window", "Evidence", "Source"],
    row: (row: z.infer<typeof DISPLAY_ROW_SCHEMA>) =>
      `Series ${row.seriesCode}; dose ${row.doseCode} number ${row.doseNumber}; status ${row.status}; reason ${row.reasonCode}; ${row.dueWindow.text} Matched facts ${row.evidence.matchedFactCount}; sources ${row.sources.map((source) => `${source.label} ${source.referenceCode}`).join(", ")}.`,
  }),
});

const STATUS_ICONS = Object.freeze({
  applied: "status_applied",
  upcoming: "status_upcoming",
  due: "status_due",
  overdue: "status_overdue",
  not_applicable: "status_not_applicable",
  review_required: "status_review_required",
} as const);

const COLUMN_KEYS = Object.freeze([
  "series",
  "dose",
  "status",
  "reason",
  "window",
  "evidence",
  "source",
] as const);

function dueWindow(assessment: TrustedAssessment, locale: Locale): z.infer<typeof DUE_WINDOW_SCHEMA> {
  const { dueFrom: from, dueUntil: to } = assessment;
  const copy = COPY[locale].window;
  if (from !== null && to !== null) {
    return { state: "closed", from, to, inclusive: true, text: copy.closed(from, to) };
  }
  if (from !== null) {
    return { state: "from_only", from, to: null, inclusive: true, text: copy.from_only(from) };
  }
  if (to !== null) {
    return { state: "until_only", from: null, to, inclusive: true, text: copy.until_only(to) };
  }
  return { state: "not_provided", from: null, to: null, inclusive: true, text: copy.not_provided };
}

function row(assessment: TrustedAssessment, index: number, locale: Locale): z.infer<typeof DISPLAY_ROW_SCHEMA> {
  if (assessment.evidence.matchedFactCount !== assessment.evidence.matchedFactHandles.length) {
    throw new VaccinationStatusPresentationError();
  }
  return {
    id: `vaccination-status-${String(index + 1).padStart(3, "0")}`,
    ruleCode: assessment.ruleCode,
    seriesCode: assessment.seriesCode,
    doseCode: assessment.doseCode,
    doseNumber: assessment.doseNumber,
    status: assessment.status,
    statusLabel: COPY[locale].status[assessment.status],
    statusIcon: STATUS_ICONS[assessment.status],
    reasonCode: assessment.reasonCode,
    dueWindow: dueWindow(assessment, locale),
    evidence: {
      matchedFactCount: assessment.evidence.matchedFactCount,
      matchedFactHandles: [...assessment.evidence.matchedFactHandles],
    },
    sources: assessment.provenance.sources.map((source) => ({ ...source })),
  };
}

function citationKey(source: z.infer<typeof SOURCE_SCHEMA>): string {
  return `${source.citationHandle}\u0000${source.referenceCode}\u0000${source.label}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function presentVaccinationStatus(raw: unknown, rawLocale: unknown): VaccinationStatusWidget {
  const parsedResult = EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  const parsedLocale = LOCALE.safeParse(rawLocale);
  if (!parsedResult.success || !parsedLocale.success) throw new VaccinationStatusPresentationError();

  const { data } = parsedResult.data;
  const locale = parsedLocale.data;
  const displayRows = data.assessments.map((assessment, index) => row(assessment, index, locale));
  const identities = new Set<string>();
  const citations = new Map<string, z.infer<typeof SOURCE_SCHEMA>>();
  for (const displayRow of displayRows) {
    const identity = `${displayRow.ruleCode}\u0000${displayRow.seriesCode}\u0000${displayRow.doseCode}\u0000${displayRow.doseNumber}`;
    if (identities.has(identity)) throw new VaccinationStatusPresentationError();
    identities.add(identity);
    for (const source of displayRow.sources) {
      const existing = citations.get(source.citationHandle);
      if (existing && citationKey(existing) !== citationKey(source)) throw new VaccinationStatusPresentationError();
      if (!existing) citations.set(source.citationHandle, { ...source });
    }
  }

  const hasReview = displayRows.some(({ status }) => status === "review_required");
  const reviewCopy = hasReview
    ? validateProfessionalReviewCopy(GENERIC_PROFESSIONAL_REVIEW_COPIES[locale])
    : null;
  const summary = COPY[locale].summary(displayRows.length, data.country, data.package.version);
  const candidate = {
    kind: "vaccination_status" as const,
    version: "vaccination.status.v1" as const,
    data: {
      locale,
      title: COPY[locale].title,
      asOfDate: data.asOfDate,
      country: data.country,
      countryLabel: COPY[locale].country[data.country],
      package: { ...data.package },
      timeline: { ariaLabel: COPY[locale].timeline, rows: displayRows },
      table: {
        caption: COPY[locale].table,
        columns: COLUMN_KEYS.map((key, index) => ({ key, label: COPY[locale].columns[index] as string })),
        rows: displayRows,
      },
      citations: [...citations.values()],
      professionalReview: reviewCopy
        ? { state: "present" as const, messageId: reviewCopy.messageId, text: reviewCopy.text }
        : { state: "not_present" as const, messageId: null, text: null },
      screenReaderSummary: summary,
      fallbackText: displayRows.length === 0
        ? COPY[locale].empty
        : [summary, ...displayRows.map((displayRow) => COPY[locale].row(displayRow))].join(" "),
    },
  };
  const parsedWidget = VACCINATION_STATUS_WIDGET_SCHEMA.safeParse(candidate);
  if (!parsedWidget.success) throw new VaccinationStatusPresentationError();
  return deepFreeze(parsedWidget.data);
}
