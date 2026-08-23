import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { mapToolError } from "../lib/runtime/safe-tool-errors";
import {
  createCitationHandle,
  projectToolResult,
  TOOL_SAFE_RESULT_SCHEMAS,
  type ToolSafeProjectionMap,
} from "../lib/runtime/safe-to-model";
import { withToolAudit } from "../lib/runtime/tool-audit";
import {
  withToolIdempotency,
} from "../lib/runtime/tool-idempotency";
import {
  getTrustedToolAbortSignal,
  getTrustedToolLocale,
  getTrustedToolServices,
  getTrustedToolTrace,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import type { GrowthSeriesPoint } from "../../src/clinical/anthropometry/growth-series";
import type { GrowthSeriesRepository } from "../../src/clinical/anthropometry/growth-series-repository";
import type { AnthropometryRepository } from "../../src/clinical/anthropometry/repository";
import type {
  ConfirmedMeasurement,
  GrowthIndicator,
  GrowthWarning,
} from "../../src/clinical/anthropometry/types";

const TOOL_ID = "get_growth_summary" as const;
const TOOL_SCHEMA_VERSION = "get-growth-summary.v1" as const;
const MAX_POINTS = 48;
const DEFAULT_POINTS = 24;
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const OPAQUE_CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const GROWTH_INDICATOR = z.enum([
  "weight_for_age",
  "length_for_age",
  "height_for_age",
  "weight_for_length",
  "weight_for_height",
  "head_circumference_for_age",
  "bmi_for_age",
]);
const GROWTH_WARNING = z.enum([
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

const WINDOW_SCHEMA = z.object({
  from: INSTANT.optional(),
  to: INSTANT.optional(),
  limit: z.number().int().min(1).max(MAX_POINTS).optional(),
}).strict().superRefine((window, context) => {
  if (window.from && window.to && Date.parse(window.from) > Date.parse(window.to)) {
    context.addIssue({ code: "custom", message: "window_order" });
  }
});

export const GET_GROWTH_SUMMARY_INPUT_SCHEMA = z.object({
  metric: GROWTH_INDICATOR.optional(),
  window: WINDOW_SCHEMA.optional(),
}).strict();

const PACKAGE_DATASET_SCHEMA = z.object({
  standardKey: OPAQUE_CODE,
  standardVersion: OPAQUE_CODE,
  datasetDigest: HASH,
  referenceCode: OPAQUE_CODE,
}).strict();
const PACKAGE_RESULT_SCHEMA = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    algorithmId: OPAQUE_CODE,
    datasets: z.array(PACKAGE_DATASET_SCHEMA).min(1).max(16),
  }).strict(),
  z.object({
    ok: z.literal(false),
    code: z.literal("RULE_UNAVAILABLE"),
    reason: z.enum([
      "NO_CANDIDATE",
      "AMBIGUOUS_CANDIDATE",
      "IDENTITY_MISMATCH",
      "SOURCE_UNAVAILABLE",
      "APPROVAL_UNAVAILABLE",
      "RELEASE_UNAVAILABLE",
      "ALGORITHM_UNAVAILABLE",
      "ARTIFACT_UNAVAILABLE",
      "CANCELLED",
    ]),
  }).strict(),
]);

type GrowthSummaryPackageDataset = Readonly<z.infer<typeof PACKAGE_DATASET_SCHEMA>>;
export type GrowthSummaryPackageResolution =
  | Readonly<{
    ok: true;
    algorithmId: string;
    datasets: readonly GrowthSummaryPackageDataset[];
  }>
  | Readonly<{
    ok: false;
    code: "RULE_UNAVAILABLE";
    reason: z.infer<typeof PACKAGE_RESULT_SCHEMA> extends infer T
      ? T extends Readonly<{ ok: false; reason: infer R }> ? R : never
      : never;
  }>;
export type GrowthSummaryPackageRequest = Readonly<{
  scope: AuthorizedChildScope;
  locale: "es-CO" | "en-US";
  cutoffAt: string;
  signal: AbortSignal;
}>;
export interface GrowthSummaryPackagePort {
  resolve(request: GrowthSummaryPackageRequest): Promise<GrowthSummaryPackageResolution>;
}

type GrowthSummaryResult = ToolSafeProjectionMap[typeof TOOL_ID];
export const GET_GROWTH_SUMMARY_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.literal("no_effect"),
  result: TOOL_SAFE_RESULT_SCHEMAS.get_growth_summary,
  idempotencyKey: z.null(),
  requestSha256: HASH,
  approvalSha256: z.null(),
}).strict();
type GrowthSummaryExecution = z.infer<typeof GET_GROWTH_SUMMARY_OUTPUT_SCHEMA>;

type GrowthSummaryServices = Readonly<Record<string, object> & {
  growthPackages: GrowthSummaryPackagePort;
  growthSeries: GrowthSeriesRepository;
  anthropometry: AnthropometryRepository;
}>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "read_only" as const,
  operation: "no_effect",
  inputSchema: GET_GROWTH_SUMMARY_INPUT_SCHEMA,
  resultSchema: TOOL_SAFE_RESULT_SCHEMAS.get_growth_summary,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "read_only" as const,
  operation: "no_effect",
});

function safeFailure(code: string): never {
  throw mapToolError(Object.freeze({ code }), { effectState: "none" });
}

function packageIdentity(
  standardKey: string,
  standardVersion: string,
  datasetDigest: string,
): string {
  return `${standardKey}\u0000${standardVersion}\u0000${datasetDigest}`;
}

function packageMap(raw: unknown): ReadonlyMap<string, GrowthSummaryPackageDataset> {
  const parsed = PACKAGE_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("RULE_UNAVAILABLE");
  if (!parsed.data.ok) {
    if (parsed.data.reason === "CANCELLED") return safeFailure("CANCELLED");
    return safeFailure("RULE_UNAVAILABLE");
  }
  const entries = new Map<string, GrowthSummaryPackageDataset>();
  for (const dataset of parsed.data.datasets) {
    const key = packageIdentity(dataset.standardKey, dataset.standardVersion, dataset.datasetDigest);
    if (entries.has(key)) return safeFailure("RULE_UNAVAILABLE");
    entries.set(key, Object.freeze({ ...dataset }));
  }
  return entries;
}

function ageDays(point: GrowthSeriesPoint): number {
  const value = point.ageBasis === "corrected"
    ? point.correctedAgeDays
    : point.ageBasis === "chronological" ? point.chronologicalAgeDays : null;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000) {
    return safeFailure("RULE_UNAVAILABLE");
  }
  return value as number;
}

function expectedUnit(measurementType: GrowthSeriesPoint["measurementType"]): "kg" | "cm" {
  return measurementType === "weight" ? "kg" : "cm";
}

function accessDenied(value: unknown): boolean {
  return Boolean(value && typeof value === "object"
    && (value as Readonly<Record<string, unknown>>).ok === false
    && (value as Readonly<Record<string, unknown>>).code === "ACCESS_DENIED");
}

function exactMeasurement(
  value: unknown,
  point: GrowthSeriesPoint,
  scope: AuthorizedChildScope,
): value is ConfirmedMeasurement {
  if (!value || typeof value !== "object" || accessDenied(value)) return false;
  const measurement = value as ConfirmedMeasurement;
  try {
    return measurement.id === point.measurementId
      && measurement.careSpaceId === scope.careSpaceId
      && measurement.childId === scope.childId
      && measurement.measurementType === point.measurementType
      && measurement.measurementMethod === point.measurementMethod
      && measurement.occurredAt === point.occurredAt
      && measurement.validationStatus === "confirmed"
      && measurement.value.normalizedUnit === expectedUnit(point.measurementType)
      && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(measurement.value.normalized.canonical);
  } catch {
    return false;
  }
}

function validPoint(
  point: GrowthSeriesPoint,
  datasets: ReadonlyMap<string, z.infer<typeof PACKAGE_DATASET_SCHEMA>>,
  cutoffMs: number,
): GrowthSummaryPackageDataset {
  const occurredAt = Date.parse(point.occurredAt);
  const dataset = point.standardVersion && point.datasetDigest
    ? datasets.get(packageIdentity(point.standardKey, point.standardVersion, point.datasetDigest))
    : undefined;
  if (!dataset
    || point.validationStatus !== "confirmed"
    || point.supersededByMeasurementId !== null
    || !Number.isFinite(occurredAt) || occurredAt > cutoffMs
    || point.ageBasis === null
    || point.interpretation === null
    || !["within_expected", "review_required", "urgent_review", "unavailable"].includes(point.interpretation)
    || !GROWTH_INDICATOR.safeParse(point.indicator).success
    || point.warnings.some((warning) => !GROWTH_WARNING.safeParse(warning).success)
    || (point.resultStatus === "calculated") !== (point.zScore !== null && point.percentile !== null)) {
    return safeFailure("RULE_UNAVAILABLE");
  }
  return dataset;
}

function seriesOrderKey(point: GrowthSeriesPoint): string {
  return [point.occurredAt, point.measurementId, point.assessedAt, point.assessmentId].join("\u0000");
}

function validateSeriesContract(
  points: readonly GrowthSeriesPoint[],
  input: z.infer<typeof GET_GROWTH_SUMMARY_INPUT_SCHEMA>,
  cutoffAt: string,
): void {
  const lower = input.window?.from ? Date.parse(input.window.from) : -Infinity;
  const upper = Date.parse(input.window?.to ?? cutoffAt);
  const limit = input.window?.limit ?? DEFAULT_POINTS;
  let previous = "";
  if (points.length > limit) return safeFailure("PERSISTENCE_UNAVAILABLE");
  for (const point of points) {
    const occurred = Date.parse(point.occurredAt);
    const key = seriesOrderKey(point);
    if (!Number.isFinite(occurred) || occurred < lower || occurred > upper
      || (input.metric !== undefined && point.indicator !== input.metric)
      || (previous !== "" && key <= previous)) return safeFailure("PERSISTENCE_UNAVAILABLE");
    previous = key;
  }
}

function modelPoint(
  point: GrowthSeriesPoint,
  measurement: ConfirmedMeasurement,
  dataset: GrowthSummaryPackageDataset,
): GrowthSummaryResult["data"]["points"][number] {
  const common = {
    occurredAt: point.occurredAt,
    measurementType: point.measurementType,
    value: measurement.value.normalized.canonical,
    unit: measurement.value.normalizedUnit,
    indicator: point.indicator,
    ageBasis: point.ageBasis as "chronological" | "corrected",
    ageDays: ageDays(point),
    interpretation: point.interpretation as "within_expected" | "review_required" | "urgent_review" | "unavailable",
    warnings: [...point.warnings] as GrowthWarning[],
    citationHandles: [createCitationHandle(TOOL_ID, {
      sourceDigest: dataset.datasetDigest,
      referenceCode: dataset.referenceCode,
    })],
  };
  return point.resultStatus === "calculated"
    ? Object.freeze({
      ...common,
      status: "calculated" as const,
      zScore: point.zScore as string,
      percentile: point.percentile as string,
    })
    : Object.freeze({
      ...common,
      status: point.resultStatus,
      zScore: null,
      percentile: null,
    });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, input) => {
    const services = getTrustedToolServices(
      runtime.trustedContext as TrustedToolContext<GrowthSummaryServices>,
    );
    const signal = getTrustedToolAbortSignal(runtime.trustedContext);
    const clock = services.toolIdempotency as Readonly<{ now(): Date }>;
    let cutoff: Date;
    try {
      cutoff = clock.now();
    } catch {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    if (signal.aborted) return safeFailure("CANCELLED");
    const cutoffAt = cutoff.toISOString();
    const requestedTo = input.window?.to;
    if (requestedTo && Date.parse(requestedTo) > cutoff.getTime()) return safeFailure("INPUT_INVALID");

    let packageResolution: unknown;
    try {
      packageResolution = await services.growthPackages.resolve(Object.freeze({
        scope: runtime.scope,
        locale: getTrustedToolLocale(runtime.trustedContext),
        cutoffAt,
        signal,
      }));
    } catch {
      if (signal.aborted) return safeFailure("CANCELLED");
      return safeFailure("RULE_UNAVAILABLE");
    }
    const datasets = packageMap(packageResolution);
    if (signal.aborted) return safeFailure("CANCELLED");

    let series;
    try {
      series = await services.growthSeries.list(Object.freeze({
        scope: runtime.scope,
        ...(input.metric ? { indicator: input.metric as GrowthIndicator } : {}),
        ...(input.window?.from ? { from: input.window.from } : {}),
        to: requestedTo ?? cutoffAt,
        pageSize: input.window?.limit ?? DEFAULT_POINTS,
      }), signal);
    } catch {
      if (signal.aborted) return safeFailure("CANCELLED");
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    if (!series || !Array.isArray(series.points) || series.points.length > MAX_POINTS) {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    validateSeriesContract(series.points, input, cutoffAt);

    const projected = [] as GrowthSummaryResult["data"]["points"][number][];
    for (const point of series.points) {
      const dataset = validPoint(point, datasets, cutoff.getTime());
      let stored: unknown;
      try {
        stored = await services.anthropometry.getConfirmed(
          runtime.scope,
          point.measurementId,
          getTrustedToolTrace(runtime.trustedContext).requestId,
          signal,
        );
      } catch {
        if (signal.aborted) return safeFailure("CANCELLED");
        return safeFailure("PERSISTENCE_UNAVAILABLE");
      }
      if (!exactMeasurement(stored, point, runtime.scope)) return safeFailure("ACCESS_DENIED");
      projected.push(modelPoint(point, stored, dataset));
    }

    const result = projectToolResult(TOOL_ID, {
      kind: "tool_result",
      toolId: TOOL_ID,
      schemaVersion: `${TOOL_ID}.model.v1`,
      data: { cutoffAt, points: projected },
    });
    return Object.freeze({ status: "no_effect" as const, result });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (context: TrustedToolContext, input: z.infer<typeof GET_GROWTH_SUMMARY_INPUT_SCHEMA>) => {
    const result = await invokeIdempotently(context, input, null);
    if ("allowed" in result) return safeFailure("CONFIRMATION_INVALID");
    return result;
  },
);

export async function executeGetGrowthSummary(
  context: TrustedToolContext,
  input: z.infer<typeof GET_GROWTH_SUMMARY_INPUT_SCHEMA>,
): Promise<GrowthSummaryExecution> {
  try {
    const raw = await invokeWithAudit(context, input);
    if (!GET_GROWTH_SUMMARY_OUTPUT_SCHEMA.safeParse(raw).success) {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    return raw as GrowthSummaryExecution;
  } catch (error) {
    throw mapToolError(error, { effectState: "none" });
  }
}

export default defineTool({
  description: "Obtiene una serie antropométrica confirmada y sus evaluaciones de crecimiento ya calculadas. No diagnostica ni recalcula resultados clínicos.",
  inputSchema: GET_GROWTH_SUMMARY_INPUT_SCHEMA,
  outputSchema: GET_GROWTH_SUMMARY_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeGetGrowthSummary(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(output.result);
  },
});
