import { z } from "zod";

import {
  GROWTH_SUMMARY_TRUSTED_RESULT_SCHEMA,
  type GrowthSummaryTrustedResult,
} from "../../agent/tools/get_growth_summary";

const MAX_POINTS = 48;
const LOCALE_SCHEMA = z.enum(["es-CO", "en-US"]);
const SAFE_TEXT = z.string().min(1).max(8_000).refine(
  (value) => !/[<>]/u.test(value) && !/javascript:/iu.test(value),
  "unsafe_text",
);
const INSTANT = z.string().datetime({ offset: true });
const DECIMAL = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u).max(64);
const OPAQUE_CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const CITATION_HANDLE = z.string().regex(/^citation:v1:[a-f0-9]{64}$/u);
const MEASUREMENT_TYPE = z.enum(["weight", "recumbent_length", "standing_height", "head_circumference"]);
const INDICATOR = z.enum([
  "weight_for_age",
  "length_for_age",
  "height_for_age",
  "weight_for_length",
  "weight_for_height",
  "head_circumference_for_age",
  "bmi_for_age",
]);
const STATUS = z.enum(["calculated", "rule_unavailable", "insufficient_data", "excluded"]);
const AGE_BASIS = z.enum(["chronological", "corrected"]);
const INTERPRETATION = z.enum(["within_expected", "review_required", "urgent_review", "unavailable"]);
const WARNING = z.enum([
  "age_unavailable",
  "corrected_age_unavailable",
  "standard_unavailable",
  "dataset_unavailable",
  "numerical_instability",
  "insufficient_companion",
  "measurement_excluded",
  "transition_boundary",
  "precision_limited",
  "review_required",
]);

const PROVENANCE_SCHEMA = z.object({
  standardKey: OPAQUE_CODE,
  standardVersion: OPAQUE_CODE,
  referenceCode: OPAQUE_CODE,
  citationHandle: CITATION_HANDLE,
}).strict();

const DISPLAY_POINT_SCHEMA = z.object({
  id: z.string().regex(/^growth-point-[0-9]{3}$/u),
  occurredAt: INSTANT,
  measurementType: MEASUREMENT_TYPE,
  measurementLabel: SAFE_TEXT,
  value: DECIMAL,
  unit: z.enum(["kg", "cm"]),
  indicator: INDICATOR,
  indicatorLabel: SAFE_TEXT,
  status: STATUS,
  statusLabel: SAFE_TEXT,
  ageBasis: AGE_BASIS,
  ageBasisLabel: SAFE_TEXT,
  ageDays: z.number().int().nonnegative().max(10_000),
  zScore: DECIMAL.nullable(),
  percentile: DECIMAL.nullable(),
  interpretation: INTERPRETATION,
  interpretationLabel: SAFE_TEXT,
  warnings: z.array(WARNING).max(12),
  warningLabels: z.array(SAFE_TEXT).max(12),
  provenance: PROVENANCE_SCHEMA,
}).strict();

const STANDARD_SCHEMA = PROVENANCE_SCHEMA.omit({ citationHandle: true }).strict();
const CITATION_SCHEMA = z.object({
  citationHandle: CITATION_HANDLE,
  referenceCode: OPAQUE_CODE,
}).strict();
const TABLE_COLUMN_SCHEMA = z.object({
  key: z.enum(["occurredAt", "measurement", "indicator", "age", "zScore", "percentile", "status", "standard"]),
  label: SAFE_TEXT,
}).strict();
const PROFESSIONAL_REVIEW_SCHEMA = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not_present"), text: z.null() }).strict(),
  z.object({ state: z.literal("present"), text: SAFE_TEXT }).strict(),
]);

export const GROWTH_SUMMARY_WIDGET_SCHEMA = z.object({
  kind: z.literal("growth_summary"),
  version: z.literal("growth.summary.v1"),
  data: z.object({
    locale: LOCALE_SCHEMA,
    title: SAFE_TEXT,
    cutoffAt: INSTANT,
    trend: z.object({
      state: z.literal("not_assessed"),
      text: SAFE_TEXT,
    }).strict(),
    correctedAge: z.object({
      state: z.enum(["not_applicable", "chronological_only", "corrected_only", "mixed"]),
      chronologicalPointCount: z.number().int().nonnegative().max(MAX_POINTS),
      correctedPointCount: z.number().int().nonnegative().max(MAX_POINTS),
      text: SAFE_TEXT,
    }).strict(),
    chart: z.object({
      kind: z.literal("growth_series"),
      ariaLabel: SAFE_TEXT,
      points: z.array(DISPLAY_POINT_SCHEMA).max(MAX_POINTS),
    }).strict(),
    table: z.object({
      caption: SAFE_TEXT,
      columns: z.array(TABLE_COLUMN_SCHEMA).length(8),
      rows: z.array(DISPLAY_POINT_SCHEMA).max(MAX_POINTS),
    }).strict(),
    standards: z.array(STANDARD_SCHEMA).max(MAX_POINTS),
    citations: z.array(CITATION_SCHEMA).max(MAX_POINTS),
    professionalReview: PROFESSIONAL_REVIEW_SCHEMA,
    screenReaderSummary: SAFE_TEXT,
    fallbackText: SAFE_TEXT,
  }).strict(),
}).strict();

export type GrowthSummaryWidget = Readonly<z.infer<typeof GROWTH_SUMMARY_WIDGET_SCHEMA>>;
type Locale = z.infer<typeof LOCALE_SCHEMA>;
type TrustedPoint = GrowthSummaryTrustedResult["data"]["points"][number];

export class PresentationContractError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Presentation contract invalid");
    this.name = "PresentationContractError";
  }
}

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    title: "Resumen de crecimiento",
    chartLabel: "Serie de resultados de crecimiento",
    tableCaption: "Alternativa textual de la serie de crecimiento",
    trend: "No se calculó una tendencia.",
    empty: "No hay puntos de crecimiento disponibles en este resultado.",
    notAvailable: "no disponible",
    professional: "Este resultado incluye un estado de revisión profesional.",
    summary: (count: number) => `Resumen de crecimiento con ${count} ${count === 1 ? "punto" : "puntos"}.`,
    correctedAge: {
      not_applicable: "No hay puntos para divulgar una base de edad.",
      chronological_only: "La serie contiene únicamente edad cronológica ya provista.",
      corrected_only: "La serie contiene únicamente edad corregida ya provista.",
      mixed: "La serie contiene puntos con edad cronológica y edad corregida ya provistas.",
    },
    columns: ["Fecha", "Medición", "Indicador", "Edad", "Z-score", "Percentil", "Estado", "Estándar"],
    measurement: {
      weight: "Peso",
      recumbent_length: "Longitud acostada",
      standing_height: "Talla de pie",
      head_circumference: "Perímetro cefálico",
    },
    indicator: {
      weight_for_age: "Peso para la edad",
      length_for_age: "Longitud para la edad",
      height_for_age: "Talla para la edad",
      weight_for_length: "Peso para la longitud",
      weight_for_height: "Peso para la talla",
      head_circumference_for_age: "Perímetro cefálico para la edad",
      bmi_for_age: "IMC para la edad",
    },
    status: {
      calculated: "Calculado",
      rule_unavailable: "Regla no disponible",
      insufficient_data: "Datos insuficientes",
      excluded: "Excluido",
    },
    ageBasis: { chronological: "Edad cronológica", corrected: "Edad corregida" },
    interpretation: {
      within_expected: "Dentro del intervalo esperado",
      review_required: "Revisión requerida",
      urgent_review: "Revisión urgente registrada",
      unavailable: "Interpretación no disponible",
    },
    warning: {
      age_unavailable: "Edad no disponible",
      corrected_age_unavailable: "Edad corregida no disponible",
      standard_unavailable: "Estándar no disponible",
      dataset_unavailable: "Dataset no disponible",
      numerical_instability: "Inestabilidad numérica",
      insufficient_companion: "Medición complementaria insuficiente",
      measurement_excluded: "Medición excluida",
      transition_boundary: "Límite de transición",
      precision_limited: "Precisión limitada",
      review_required: "Revisión requerida",
    },
  }),
  "en-US": Object.freeze({
    title: "Growth summary",
    chartLabel: "Growth result series",
    tableCaption: "Text alternative for the growth series",
    trend: "No trend was calculated.",
    empty: "No growth points are available in this result.",
    notAvailable: "not available",
    professional: "This result includes a professional-review state.",
    summary: (count: number) => `Growth summary with ${count} ${count === 1 ? "point" : "points"}.`,
    correctedAge: {
      not_applicable: "There are no points for an age-basis disclosure.",
      chronological_only: "The series contains only the already-provided chronological age.",
      corrected_only: "The series contains only the already-provided corrected age.",
      mixed: "The series contains points with already-provided chronological and corrected age.",
    },
    columns: ["Date", "Measurement", "Indicator", "Age", "Z-score", "Percentile", "Status", "Standard"],
    measurement: {
      weight: "Weight",
      recumbent_length: "Recumbent length",
      standing_height: "Standing height",
      head_circumference: "Head circumference",
    },
    indicator: {
      weight_for_age: "Weight for age",
      length_for_age: "Length for age",
      height_for_age: "Height for age",
      weight_for_length: "Weight for length",
      weight_for_height: "Weight for height",
      head_circumference_for_age: "Head circumference for age",
      bmi_for_age: "BMI for age",
    },
    status: {
      calculated: "Calculated",
      rule_unavailable: "Rule not available",
      insufficient_data: "Insufficient data",
      excluded: "Excluded",
    },
    ageBasis: { chronological: "Chronological age", corrected: "Corrected age" },
    interpretation: {
      within_expected: "Within the expected interval",
      review_required: "Review required",
      urgent_review: "Urgent-review state recorded",
      unavailable: "Interpretation not available",
    },
    warning: {
      age_unavailable: "Age not available",
      corrected_age_unavailable: "Corrected age not available",
      standard_unavailable: "Standard not available",
      dataset_unavailable: "Dataset not available",
      numerical_instability: "Numerical instability",
      insufficient_companion: "Insufficient companion measurement",
      measurement_excluded: "Measurement excluded",
      transition_boundary: "Transition boundary",
      precision_limited: "Precision limited",
      review_required: "Review required",
    },
  }),
});

const COLUMN_KEYS = Object.freeze([
  "occurredAt",
  "measurement",
  "indicator",
  "age",
  "zScore",
  "percentile",
  "status",
  "standard",
] as const);

function displayPoint(point: TrustedPoint, index: number, locale: Locale) {
  const copy = COPY[locale];
  return {
    id: `growth-point-${String(index + 1).padStart(3, "0")}`,
    occurredAt: point.occurredAt,
    measurementType: point.measurementType,
    measurementLabel: copy.measurement[point.measurementType],
    value: point.value,
    unit: point.unit,
    indicator: point.indicator,
    indicatorLabel: copy.indicator[point.indicator],
    status: point.status,
    statusLabel: copy.status[point.status],
    ageBasis: point.ageBasis,
    ageBasisLabel: copy.ageBasis[point.ageBasis],
    ageDays: point.ageDays,
    zScore: point.zScore,
    percentile: point.percentile,
    interpretation: point.interpretation,
    interpretationLabel: copy.interpretation[point.interpretation],
    warnings: [...point.warnings],
    warningLabels: point.warnings.map((warning) => copy.warning[warning]),
    provenance: { ...point.provenance },
  };
}

function ageDisclosure(points: readonly TrustedPoint[], locale: Locale) {
  const chronologicalPointCount = points.filter(({ ageBasis }) => ageBasis === "chronological").length;
  const correctedPointCount = points.filter(({ ageBasis }) => ageBasis === "corrected").length;
  const state = points.length === 0
    ? "not_applicable" as const
    : correctedPointCount === 0
      ? "chronological_only" as const
      : chronologicalPointCount === 0
        ? "corrected_only" as const
        : "mixed" as const;
  return {
    state,
    chronologicalPointCount,
    correctedPointCount,
    text: COPY[locale].correctedAge[state],
  };
}

function fallbackLine(point: ReturnType<typeof displayPoint>, locale: Locale): string {
  const copy = COPY[locale];
  const zScore = point.zScore ?? copy.notAvailable;
  const percentile = point.percentile ?? copy.notAvailable;
  return locale === "es-CO"
    ? `${point.occurredAt}: ${point.measurementLabel} ${point.value} ${point.unit}; ${point.indicatorLabel}; ${point.ageBasisLabel} ${point.ageDays} días; Z ${zScore}; percentil ${percentile}; ${point.statusLabel}; ${point.interpretationLabel}; estándar ${point.provenance.standardKey} ${point.provenance.standardVersion}; referencia ${point.provenance.referenceCode}.`
    : `${point.occurredAt}: ${point.measurementLabel} ${point.value} ${point.unit}; ${point.indicatorLabel}; ${point.ageBasisLabel} ${point.ageDays} days; Z ${zScore}; percentile ${percentile}; ${point.statusLabel}; ${point.interpretationLabel}; standard ${point.provenance.standardKey} ${point.provenance.standardVersion}; reference ${point.provenance.referenceCode}.`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function presentGrowthSummary(raw: unknown, rawLocale: unknown): GrowthSummaryWidget {
  const parsedResult = GROWTH_SUMMARY_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  const parsedLocale = LOCALE_SCHEMA.safeParse(rawLocale);
  if (!parsedResult.success || !parsedLocale.success) throw new PresentationContractError();

  const { data } = parsedResult.data;
  const locale = parsedLocale.data;
  const copy = COPY[locale];
  const points = data.points.map((point, index) => displayPoint(point, index, locale));
  const standards = new Map<string, { standardKey: string; standardVersion: string; referenceCode: string }>();
  const citations = new Map<string, { citationHandle: string; referenceCode: string }>();
  for (const point of data.points) {
    const provenance = point.provenance;
    const standardId = `${provenance.standardKey}\u0000${provenance.standardVersion}\u0000${provenance.referenceCode}`;
    if (!standards.has(standardId)) standards.set(standardId, {
      standardKey: provenance.standardKey,
      standardVersion: provenance.standardVersion,
      referenceCode: provenance.referenceCode,
    });
    if (!citations.has(provenance.citationHandle)) citations.set(provenance.citationHandle, {
      citationHandle: provenance.citationHandle,
      referenceCode: provenance.referenceCode,
    });
  }
  const hasProfessionalReview = data.points.some((point) =>
    point.interpretation === "review_required"
    || point.interpretation === "urgent_review"
    || point.warnings.includes("review_required")
  );
  const summary = copy.summary(points.length);
  const candidate = {
    kind: "growth_summary" as const,
    version: "growth.summary.v1" as const,
    data: {
      locale,
      title: copy.title,
      cutoffAt: data.cutoffAt,
      trend: { state: "not_assessed" as const, text: copy.trend },
      correctedAge: ageDisclosure(data.points, locale),
      chart: { kind: "growth_series" as const, ariaLabel: copy.chartLabel, points },
      table: {
        caption: copy.tableCaption,
        columns: COLUMN_KEYS.map((key, index) => ({ key, label: copy.columns[index] as string })),
        rows: points,
      },
      standards: [...standards.values()],
      citations: [...citations.values()],
      professionalReview: hasProfessionalReview
        ? { state: "present" as const, text: copy.professional }
        : { state: "not_present" as const, text: null },
      screenReaderSummary: summary,
      fallbackText: points.length === 0
        ? copy.empty
        : [summary, ...points.map((point) => fallbackLine(point, locale))].join("\n"),
    },
  };
  const parsedWidget = GROWTH_SUMMARY_WIDGET_SCHEMA.safeParse(candidate);
  if (!parsedWidget.success) throw new PresentationContractError();
  return deepFreeze(parsedWidget.data);
}
