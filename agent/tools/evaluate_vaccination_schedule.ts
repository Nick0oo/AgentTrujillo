import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { mapToolError } from "../lib/runtime/safe-tool-errors";
import {
  createCitationHandle,
  projectToolResult,
  type ToolSafeProjectionMap,
} from "../lib/runtime/safe-to-model";
import { withToolAudit } from "../lib/runtime/tool-audit";
import { withToolIdempotency } from "../lib/runtime/tool-idempotency";
import {
  getTrustedToolAbortSignal,
  getTrustedToolLocale,
  getTrustedToolServices,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";

const TOOL_ID = "evaluate_vaccination_schedule" as const;
const TOOL_SCHEMA_VERSION = "evaluate-vaccination-schedule.v1" as const;
const MAX_ASSESSMENTS = 48;
const MAX_FACTS_PER_ASSESSMENT = 48;
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const OPAQUE_CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "calendar_date");
const CITATION_HANDLE = z.string().regex(/^citation:v1:[a-f0-9]{64}$/u);
const FACT_HANDLE = z.string().regex(/^fact:v1:[a-f0-9]{64}$/u);
const COUNTRY = z.enum(["CO", "US"]);
const STATUS = z.enum([
  "applied",
  "upcoming",
  "due",
  "overdue",
  "not_applicable",
  "review_required",
]);

function safeLabel(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !/[<>`]/u.test(value)
    && !/(?:\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|<\s*\/?\s*(?:script|iframe|object|embed|form|input|button|a)\b|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*:|(?:ignore|forget|ignora|olvida).{0,48}(?:previous|prior|anteriores?|system|sistema|instruction|instrucciones?))/iu.test(value);
}

const SOURCE_REFERENCE_SCHEMA = z.object({
  label: z.string().min(1).max(160).refine(safeLabel, "safe_source_label"),
  referenceCode: OPAQUE_CODE,
  sourceDigest: HASH,
}).strict();

const DOMAIN_PACKAGE_SCHEMA = z.object({
  country: COUNTRY,
  packageId: OPAQUE_CODE,
  packageVersion: OPAQUE_CODE,
  releaseStatus: z.literal("active"),
  algorithmId: OPAQUE_CODE,
  sourceReferences: z.array(SOURCE_REFERENCE_SCHEMA).min(1).max(16),
}).strict();

const DOMAIN_ASSESSMENT_SCHEMA = z.object({
  ruleCode: OPAQUE_CODE,
  seriesCode: OPAQUE_CODE,
  doseCode: OPAQUE_CODE,
  doseNumber: z.number().int().min(1).max(20),
  status: STATUS,
  reasonCode: OPAQUE_CODE,
  dueFrom: DATE.nullable(),
  dueUntil: DATE.nullable(),
  matchedAdministrationIds: z.array(OPAQUE_ID).max(MAX_FACTS_PER_ASSESSMENT),
  sourceReferences: z.array(SOURCE_REFERENCE_SCHEMA).min(1).max(16).optional(),
}).strict();

const DOMAIN_RESULT_SCHEMA = z.object({
  evidenceState: z.literal("confirmed_only"),
  package: DOMAIN_PACKAGE_SCHEMA,
  assessments: z.array(DOMAIN_ASSESSMENT_SCHEMA).max(MAX_ASSESSMENTS),
}).strict();

export type VaccinationScheduleSourceReference = Readonly<z.infer<typeof SOURCE_REFERENCE_SCHEMA>>;
export type VaccinationSchedulePackage = Readonly<z.infer<typeof DOMAIN_PACKAGE_SCHEMA>>;
export type VaccinationScheduleAssessment = Readonly<z.infer<typeof DOMAIN_ASSESSMENT_SCHEMA>>;
export type VaccinationScheduleEvaluation = Readonly<z.infer<typeof DOMAIN_RESULT_SCHEMA>>;

export type VaccinationScheduleRequest = Readonly<{
  scope: AuthorizedChildScope;
  locale: "es-CO" | "en-US";
  asOfDate: string;
  signal: AbortSignal;
}>;

/**
 * The authenticated application composition supplies this port. It resolves
 * only a released country package, loads confirmed facts, and invokes the
 * Module 06 deterministic engine. This port is strictly read-only: it MUST
 * perform zero writes, persistence, or stored-assessment reuse. Assessment
 * persistence/replay is intentionally deferred until a separately approved
 * effectful domain contract exists; this tool never writes a repository.
 */
export interface VaccinationSchedulePort {
  evaluate(request: VaccinationScheduleRequest): Promise<VaccinationScheduleEvaluation>;
}

export const EVALUATE_VACCINATION_SCHEDULE_INPUT_SCHEMA = z.object({
  asOfDate: DATE.optional(),
}).strict();

const TRUSTED_SOURCE_SCHEMA = z.object({
  label: z.string().min(1).max(160).refine(safeLabel, "safe_source_label"),
  referenceCode: OPAQUE_CODE,
  citationHandle: CITATION_HANDLE,
}).strict();

const TRUSTED_ASSESSMENT_SCHEMA = z.object({
  ruleCode: OPAQUE_CODE,
  seriesCode: OPAQUE_CODE,
  doseCode: OPAQUE_CODE,
  doseNumber: z.number().int().min(1).max(20),
  status: STATUS,
  reasonCode: OPAQUE_CODE,
  dueFrom: DATE.nullable(),
  dueUntil: DATE.nullable(),
  evidence: z.object({
    matchedFactCount: z.number().int().nonnegative().max(MAX_FACTS_PER_ASSESSMENT),
    matchedFactHandles: z.array(FACT_HANDLE).max(MAX_FACTS_PER_ASSESSMENT),
  }).strict(),
  provenance: z.object({
    sources: z.array(TRUSTED_SOURCE_SCHEMA).min(1).max(16),
  }).strict(),
}).strict();

export const EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(`${TOOL_ID}.trusted.v1`),
  data: z.object({
    asOfDate: DATE,
    country: COUNTRY,
    package: z.object({
      id: OPAQUE_CODE,
      version: OPAQUE_CODE,
      algorithmId: OPAQUE_CODE,
    }).strict(),
    assessments: z.array(TRUSTED_ASSESSMENT_SCHEMA).max(MAX_ASSESSMENTS),
  }).strict(),
}).strict();
export type EvaluateVaccinationScheduleTrustedResult = Readonly<
  z.infer<typeof EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA>
>;
type TrustedVaccinationSource = EvaluateVaccinationScheduleTrustedResult["data"]["assessments"][number]["provenance"]["sources"][number];
type TrustedVaccinationSourceList = readonly TrustedVaccinationSource[];

export const EVALUATE_VACCINATION_SCHEDULE_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.literal("no_effect"),
  result: EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: z.null(),
  requestSha256: HASH,
  approvalSha256: z.null(),
}).strict();
type EvaluateVaccinationScheduleExecution = z.infer<typeof EVALUATE_VACCINATION_SCHEDULE_OUTPUT_SCHEMA>;

type VaccinationScheduleModelResult = ToolSafeProjectionMap[typeof TOOL_ID];
type VaccinationScheduleServices = Readonly<Record<string, object> & {
  vaccinationSchedule: VaccinationSchedulePort;
}>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "read_only" as const,
  operation: "no_effect",
  inputSchema: EVALUATE_VACCINATION_SCHEDULE_INPUT_SCHEMA,
  resultSchema: EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA,
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

function currentCalendarDate(value: Date, timezone: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE");
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    const date = year && month && day ? `${year.padStart(4, "0")}-${month}-${day}` : null;
    if (date && DATE.safeParse(date).success) return date;
  } catch {
    // The trusted scope validates the timezone; a defensive fallback keeps the
    // tool fail-closed if a malformed scope reaches this boundary.
  }
  return safeFailure("PERSISTENCE_UNAVAILABLE");
}

function serviceFor(context: TrustedToolContext): VaccinationSchedulePort {
  try {
    const services = getTrustedToolServices(context as TrustedToolContext<VaccinationScheduleServices>);
    if (!services.vaccinationSchedule || typeof services.vaccinationSchedule.evaluate !== "function") {
      return safeFailure("RULE_UNAVAILABLE");
    }
    return services.vaccinationSchedule;
  } catch {
    return safeFailure("RULE_UNAVAILABLE");
  }
}

function factHandle(administrationId: string): string {
  const digest = createHash("sha256").update(canonicalize({
    domain: "tool-vaccination-fact.v1",
    toolId: TOOL_ID,
    administrationId,
  }), "utf8").digest("hex");
  return `fact:v1:${digest}`;
}

function sourceIdentity(source: Readonly<{ referenceCode: string; citationHandle: string }>): string {
  return `${source.referenceCode}\u0000${source.citationHandle}`;
}

function compareStable(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function sourceList(raw: readonly VaccinationScheduleSourceReference[]): TrustedVaccinationSourceList {
  const parsed = (() => {
    try {
      return z.array(SOURCE_REFERENCE_SCHEMA).min(1).max(16).safeParse(raw);
    } catch {
      return null;
    }
  })();
  if (!parsed || !parsed.success) return safeFailure("RULE_UNAVAILABLE");
  const sources = parsed.data.map((source) => ({
    label: source.label,
    referenceCode: source.referenceCode,
    citationHandle: createCitationHandle(TOOL_ID, {
      sourceDigest: source.sourceDigest,
      referenceCode: source.referenceCode,
    }),
  }));
  sources.sort((left, right) => compareStable(sourceIdentity(left), sourceIdentity(right)));
  const unique = new Map<string, typeof sources[number]>();
  const citationByReferenceCode = new Map<string, string>();
  for (const source of sources) {
    const key = sourceIdentity(source);
    const priorCitation = citationByReferenceCode.get(source.referenceCode);
    if (priorCitation !== undefined && priorCitation !== source.citationHandle) {
      return safeFailure("RULE_UNAVAILABLE");
    }
    citationByReferenceCode.set(source.referenceCode, source.citationHandle);
    const existing = unique.get(key);
    if (existing && existing.label !== source.label) return safeFailure("RULE_UNAVAILABLE");
    unique.set(key, Object.freeze(source));
  }
  if (unique.size === 0) return safeFailure("RULE_UNAVAILABLE");
  return Object.freeze([...unique.values()]);
}

function assessmentOrderKey(value: Readonly<{
  ruleCode: string;
  seriesCode: string;
  doseCode: string;
  doseNumber: number;
  status: string;
  reasonCode: string;
  dueFrom: string | null;
  dueUntil: string | null;
}>): string {
  return [
    value.seriesCode,
    String(value.doseNumber).padStart(3, "0"),
    value.doseCode,
    value.ruleCode,
    value.status,
    value.reasonCode,
    value.dueFrom ?? "",
    value.dueUntil ?? "",
  ].join("\u0000");
}

function assessmentIdentity(value: Readonly<{
  ruleCode: string;
  seriesCode: string;
  doseCode: string;
  doseNumber: number;
}>): string {
  return [value.ruleCode, value.seriesCode, value.doseCode, String(value.doseNumber)].join("\u0000");
}

function serviceFailureCode(error: unknown): "ACCESS_DENIED" | "PERSISTENCE_UNAVAILABLE" | "RULE_UNAVAILABLE" {
  try {
    const code = error && typeof error === "object"
      ? (error as Readonly<{ code?: unknown }>).code
      : undefined;
    const message = error instanceof Error ? error.message : undefined;
    const source = typeof code === "string" ? code : message;
    if (source === "ACCESS_DENIED" || source === "NOT_FOUND" || source === "FORBIDDEN") return "ACCESS_DENIED";
    if (source === "PERSISTENCE_UNAVAILABLE" || source === "CLOUD_PERSISTENCE_ERROR"
      || source === "PACKAGE_REPOSITORY_UNAVAILABLE") return "PERSISTENCE_UNAVAILABLE";
  } catch {
    return "RULE_UNAVAILABLE";
  }
  return "RULE_UNAVAILABLE";
}

function trustedResult(
  raw: unknown,
  scope: AuthorizedChildScope,
  asOfDate: string,
): EvaluateVaccinationScheduleTrustedResult {
  const parsed = (() => {
    try {
      return DOMAIN_RESULT_SCHEMA.safeParse(raw);
    } catch {
      return null;
    }
  })();
  if (!parsed || !parsed.success) return safeFailure("RULE_UNAVAILABLE");
  const packageData = parsed.data.package;
  if (packageData.country !== scope.countryOfCare || packageData.releaseStatus !== "active") {
    return safeFailure("RULE_UNAVAILABLE");
  }
  const packageSources = sourceList(packageData.sourceReferences);
  const packageCitationHandles = new Set(packageSources.map((source) => source.citationHandle));
  const packageSourceByCitation = new Map(packageSources.map((source) => [source.citationHandle, source]));
  const seenAssessments = new Set<string>();
  const assessments = parsed.data.assessments.map((assessment) => {
    if (assessment.dueFrom !== null && assessment.dueUntil !== null && assessment.dueFrom > assessment.dueUntil) {
      return safeFailure("RULE_UNAVAILABLE");
    }
    const key = assessmentIdentity(assessment);
    if (seenAssessments.has(key)) return safeFailure("RULE_UNAVAILABLE");
    seenAssessments.add(key);
    const ids = [...assessment.matchedAdministrationIds];
    if (new Set(ids).size !== ids.length) return safeFailure("RULE_UNAVAILABLE");
    const sourceReferences = sourceList(assessment.sourceReferences ?? packageData.sourceReferences);
    if (sourceReferences.some((source) => {
      const packageSource = packageSourceByCitation.get(source.citationHandle);
      return !packageCitationHandles.has(source.citationHandle)
        || !packageSource
        || packageSource.referenceCode !== source.referenceCode
        || packageSource.label !== source.label;
    })) {
      return safeFailure("RULE_UNAVAILABLE");
    }
    const handles = ids.map(factHandle).sort(compareStable);
    return Object.freeze({
      ruleCode: assessment.ruleCode,
      seriesCode: assessment.seriesCode,
      doseCode: assessment.doseCode,
      doseNumber: assessment.doseNumber,
      status: assessment.status,
      reasonCode: assessment.reasonCode,
      dueFrom: assessment.dueFrom,
      dueUntil: assessment.dueUntil,
      evidence: Object.freeze({
        matchedFactCount: ids.length,
        matchedFactHandles: Object.freeze(handles),
      }),
      provenance: Object.freeze({ sources: sourceReferences }),
    });
  });
  assessments.sort((left, right) => compareStable(assessmentOrderKey(left), assessmentOrderKey(right)));
  const result = {
    kind: "trusted_tool_result" as const,
    toolId: TOOL_ID,
    schemaVersion: `${TOOL_ID}.trusted.v1` as const,
    data: {
      asOfDate,
      country: packageData.country,
      package: {
        id: packageData.packageId,
        version: packageData.packageVersion,
        algorithmId: packageData.algorithmId,
      },
      assessments,
    },
  };
  const checked = EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA.safeParse(result);
  if (!checked.success) return safeFailure("RULE_UNAVAILABLE");
  return checked.data;
}

export function projectVaccinationScheduleForModel(raw: unknown): VaccinationScheduleModelResult {
  const parsed = EVALUATE_VACCINATION_SCHEDULE_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: `${TOOL_ID}.model.v1`,
    data: {
      asOfDate: parsed.data.data.asOfDate,
      assessments: parsed.data.data.assessments.map((assessment) => ({
        seriesCode: assessment.seriesCode,
        doseCode: assessment.doseCode,
        doseNumber: assessment.doseNumber,
        status: assessment.status,
        reasonCode: assessment.reasonCode,
        dueFrom: assessment.dueFrom,
        dueUntil: assessment.dueUntil,
        citationHandles: assessment.provenance.sources.map((source) => source.citationHandle),
      })),
    },
  });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, input) => {
    const trustedContext = runtime.trustedContext as TrustedToolContext<VaccinationScheduleServices>;
    const signal = getTrustedToolAbortSignal(trustedContext);
    if (signal.aborted) return safeFailure("CANCELLED");
    let now: Date;
    try {
      const services = getTrustedToolServices(trustedContext);
      const clock = services.toolIdempotency as Readonly<{ now(): Date }>;
      now = clock.now();
    } catch {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    const today = currentCalendarDate(now, runtime.scope.timezone);
    const asOfDate = input.asOfDate ?? today;
    if (asOfDate > today) return safeFailure("INPUT_INVALID");
    if (signal.aborted) return safeFailure("CANCELLED");
    let evaluation: unknown;
    try {
      evaluation = await serviceFor(trustedContext).evaluate(Object.freeze({
        scope: runtime.scope,
        locale: getTrustedToolLocale(trustedContext),
        asOfDate,
        signal,
      }));
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED");
      return safeFailure(serviceFailureCode(error));
    }
    if (signal.aborted) return safeFailure("CANCELLED");
    return Object.freeze({
      status: "no_effect" as const,
      result: trustedResult(evaluation, runtime.scope, asOfDate),
    });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (context: TrustedToolContext, input: z.infer<typeof EVALUATE_VACCINATION_SCHEDULE_INPUT_SCHEMA>) => {
    const result = await invokeIdempotently(context, input, null);
    if ("allowed" in result) return safeFailure("CONFIRMATION_INVALID");
    return result;
  },
);

export async function executeEvaluateVaccinationSchedule(
  context: TrustedToolContext,
  input: z.infer<typeof EVALUATE_VACCINATION_SCHEDULE_INPUT_SCHEMA>,
): Promise<EvaluateVaccinationScheduleExecution> {
  try {
    const raw = await invokeWithAudit(context, input);
    if (!EVALUATE_VACCINATION_SCHEDULE_OUTPUT_SCHEMA.safeParse(raw).success) {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    return raw as EvaluateVaccinationScheduleExecution;
  } catch (error) {
    throw mapToolError(error, { effectState: "none" });
  }
}

export default defineTool({
  description: "Compara hechos de vacunación confirmados con el esquema vigente del país de cuidado. No combina países, certifica inmunidad, selecciona vacunas ni evalúa contraindicaciones.",
  inputSchema: EVALUATE_VACCINATION_SCHEDULE_INPUT_SCHEMA,
  outputSchema: EVALUATE_VACCINATION_SCHEDULE_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeEvaluateVaccinationSchedule(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectVaccinationScheduleForModel(output.result));
  },
});
