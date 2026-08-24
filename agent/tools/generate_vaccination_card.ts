import { canonicalize } from "json-canonicalize";
import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { authorizeToolInvocation } from "../lib/runtime/tool-permission-policy";
import { mapToolError, type ToolEffectState } from "../lib/runtime/safe-tool-errors";
import {
  createCitationHandle,
  projectToolResult,
  type ToolSafeProjectionMap,
} from "../lib/runtime/safe-to-model";
import { withToolAudit } from "../lib/runtime/tool-audit";
import {
  withToolIdempotency,
  type ToolApprovalSubmission,
} from "../lib/runtime/tool-idempotency";
import {
  getTrustedToolAbortSignal,
  getTrustedToolLocale,
  getTrustedToolServices,
  requireActiveChildScope,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";

const TOOL_ID = "generate_vaccination_card" as const;
const TOOL_SCHEMA_VERSION = "generate-vaccination-card.v1" as const;
const TRUSTED_SCHEMA_VERSION = `${TOOL_ID}.trusted.v1` as const;
const MODEL_SCHEMA_VERSION = `${TOOL_ID}.model.v1` as const;

const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "ISO calendar date");
const LOCALE = z.enum(["es-CO", "en-US"]);
const COUNTRY = z.enum(["CO", "US"]);
const CARD_STATUS = z.enum(["queued", "processing", "ready", "failed"]);
const DOCUMENT_STATUS = z.enum(["reserved", "processing", "ready", "failed"]);
const CONTROL_OR_MARKUP = /[\u0000-\u001f\u007f<>`]/u;
const ROLE_OR_INJECTION = /(?:\b(?:https?|s3|gs|file|javascript|data):|\b(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\s*[:=]|(?:ignore|forget|disregard|override|bypass|ignora|olvida|omite|anula).{0,80}(?:previous|prior|system|developer|assistant|instruction|prompt|anterior(?:es)?|previ[oa]s?|sistema|desarrollador|asistente|instrucci[oó]n(?:es)?|pol[ií]tica))/iu;

function safeLabel(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL_OR_MARKUP.test(value)
    && !ROLE_OR_INJECTION.test(value);
}

const DISPLAY_OPTIONS_SCHEMA = z.object({
  paperSize: z.enum(["a4", "letter"]).optional(),
  orientation: z.enum(["portrait", "landscape"]).optional(),
  includeProvenance: z.boolean().optional(),
}).strict();

/** Model input is display intent only; scope, country, facts, and template are trusted server values. */
export const GENERATE_VACCINATION_CARD_INPUT_SCHEMA = z.object({
  locale: LOCALE.optional(),
  displayOptions: DISPLAY_OPTIONS_SCHEMA.optional(),
  idempotencyKey: OPAQUE_ID,
}).strict();
export type GenerateVaccinationCardInput = z.infer<typeof GENERATE_VACCINATION_CARD_INPUT_SCHEMA>;
export type VaccinationCardDisplayOptions = Readonly<z.infer<typeof DISPLAY_OPTIONS_SCHEMA>>;

const SOURCE_REFERENCE_SCHEMA = z.object({
  label: z.string().min(1).max(160).refine(safeLabel, "safe_source_label"),
  referenceCode: CODE,
  sourceDigest: HASH,
}).strict();

const PACKAGE_SCHEMA = z.object({
  country: COUNTRY,
  releaseStatus: z.literal("active"),
  version: CODE,
  algorithmId: CODE,
  artifactSha256: HASH,
  sourceReferences: z.array(SOURCE_REFERENCE_SCHEMA).min(1).max(16).readonly(),
}).strict();

const TEMPLATE_SCHEMA = z.object({
  country: COUNTRY,
  locale: LOCALE,
  releaseStatus: z.literal("released"),
  version: CODE,
  artifactSha256: HASH,
  sourceReferences: z.array(SOURCE_REFERENCE_SCHEMA).max(16).readonly().optional(),
}).strict();

const SNAPSHOT_SCHEMA = z.object({
  evidenceState: z.literal("confirmed_only"),
  asOfDate: DATE,
  country: COUNTRY,
  confirmedFactCount: z.number().int().nonnegative().max(512),
  package: PACKAGE_SCHEMA,
  template: TEMPLATE_SCHEMA,
}).strict();
export type VaccinationCardSnapshot = Readonly<z.infer<typeof SNAPSHOT_SCHEMA>>;

const CARD_REQUEST_RESULT_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay"]),
  status: CARD_STATUS,
  documentStatus: DOCUMENT_STATUS,
  snapshot: SNAPSHOT_SCHEMA,
}).strict();
export type VaccinationCardRequestResult = Readonly<z.infer<typeof CARD_REQUEST_RESULT_SCHEMA>>;

export type VaccinationCardResolveRequest = Readonly<{
  scope: AuthorizedChildScope;
  asOfDate: string;
  locale: "es-CO" | "en-US";
  displayOptions: VaccinationCardDisplayOptions;
  signal: AbortSignal;
}>;

export type VaccinationCardReservationRequest = Readonly<{
  scope: AuthorizedChildScope;
  idempotencyKey: string;
  displayOptions: VaccinationCardDisplayOptions;
  snapshot: VaccinationCardSnapshot;
  requestSha256: string;
  approvalSha256: string;
  signal: AbortSignal;
}>;

/**
 * Request-scoped domain boundary. `resolve` must load confirmed same-child
 * facts, the active country package, and the released display template. The
 * second method owns one atomic reservation/enqueue operation keyed by the
 * caller's idempotency key; it must reconcile an identical replay rather than
 * expose a replay lookup to the tool.
 */
export interface VaccinationCardPort {
  resolve(request: VaccinationCardResolveRequest): Promise<VaccinationCardSnapshot>;
  reserveAndEnqueue(request: VaccinationCardReservationRequest): Promise<VaccinationCardRequestResult>;
}

const TRUSTED_SOURCE_SCHEMA = z.object({
  label: z.string().min(1).max(160).refine(safeLabel, "safe_source_label"),
  referenceCode: CODE,
  citationHandle: z.string().regex(/^citation:v1:[a-f0-9]{64}$/u),
}).strict();

const TRUSTED_DATA_SCHEMA = z.object({
  status: CARD_STATUS,
  jobStatus: CARD_STATUS,
  documentStatus: DOCUMENT_STATUS,
  asOfDate: DATE,
  country: COUNTRY,
  evidenceState: z.literal("confirmed_only"),
  confirmedFactCount: z.number().int().nonnegative().max(512),
  packageVersion: CODE,
  algorithmId: CODE,
  templateVersion: CODE,
  templateLocale: LOCALE,
  artifactKind: z.literal("private_factual_copy"),
  officialRecord: z.literal(false),
  provenance: z.object({
    sources: z.array(TRUSTED_SOURCE_SCHEMA).min(1).max(32),
  }).strict(),
}).strict();

export const GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: TRUSTED_DATA_SCHEMA,
}).strict();
export type GenerateVaccinationCardTrustedResult = Readonly<
  z.infer<typeof GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA>
>;

export const GENERATE_VACCINATION_CARD_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.enum(["created", "replayed"]),
  result: GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: OPAQUE_ID,
  requestSha256: HASH,
  approvalSha256: HASH,
}).strict();
export type GenerateVaccinationCardExecution = Readonly<
  z.infer<typeof GENERATE_VACCINATION_CARD_OUTPUT_SCHEMA>
>;
type GenerateVaccinationCardModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "generate_vaccination_card.v1",
  inputSchema: GENERATE_VACCINATION_CARD_INPUT_SCHEMA,
  resultSchema: GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "generate_vaccination_card.v1",
});

function safeFailure(code: string, effectState: ToolEffectState = "none"): never {
  // SafeToolError maps domain policy causes to the public code. Use the
  // canonical rule cause here because the mapper intentionally treats
  // `CLINICAL_POLICY_UNAVAILABLE` as an output, not a source code.
  const sourceCode = code === "CLINICAL_POLICY_UNAVAILABLE" ? "RULE_UNAVAILABLE" : code;
  throw mapToolError(Object.freeze({ code: sourceCode }), { effectState });
}

function nowFrom(context: TrustedToolContext): Date {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const clock = services.toolIdempotency as Readonly<{ now?: unknown }> | undefined;
    if (!clock || typeof clock.now !== "function") return safeFailure("PERSISTENCE_UNAVAILABLE");
    const now = clock.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE");
    return new Date(now);
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
}

function currentCalendarDate(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    const date = year && month && day ? `${year}-${month}-${day}` : null;
    if (date && DATE.safeParse(date).success) return date;
  } catch {
    // The trusted scope owns the timezone; malformed values fail closed below.
  }
  return safeFailure("PERSISTENCE_UNAVAILABLE");
}

function serviceFor(context: TrustedToolContext): VaccinationCardPort {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const service = services.vaccinationCard;
    if (!service || typeof service !== "object"
      || typeof (service as Partial<VaccinationCardPort>).resolve !== "function"
      || typeof (service as Partial<VaccinationCardPort>).reserveAndEnqueue !== "function") {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    return service as VaccinationCardPort;
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
}

function reauthorize(context: TrustedToolContext, effectState: ToolEffectState): AuthorizedChildScope {
  const signal = getTrustedToolAbortSignal(context);
  if (signal.aborted) return safeFailure("CANCELLED", effectState);
  const now = nowFrom(context);
  try {
    const scope = requireActiveChildScope(context, now);
    if (!authorizeToolInvocation(context, TOOL_ID, now).allowed) return safeFailure("FORBIDDEN", effectState);
    return scope;
  } catch {
    return safeFailure("FORBIDDEN", effectState);
  }
}

function normalizedOptions(input: GenerateVaccinationCardInput): VaccinationCardDisplayOptions {
  return Object.freeze({
    paperSize: input.displayOptions?.paperSize ?? "a4",
    orientation: input.displayOptions?.orientation ?? "portrait",
    includeProvenance: input.displayOptions?.includeProvenance ?? true,
  });
}

function sourceList(snapshot: VaccinationCardSnapshot): ReadonlyArray<z.infer<typeof TRUSTED_SOURCE_SCHEMA>> {
  const all = [
    ...snapshot.package.sourceReferences,
    ...(snapshot.template.sourceReferences ?? []),
  ];
  const byIdentity = new Map<string, z.infer<typeof SOURCE_REFERENCE_SCHEMA>>();
  const byReference = new Map<string, string>();
  for (const source of all) {
    const priorDigest = byReference.get(source.referenceCode);
    if (priorDigest !== undefined && priorDigest !== source.sourceDigest) {
      return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    }
    byReference.set(source.referenceCode, source.sourceDigest);
    const key = `${source.referenceCode}\u0000${source.sourceDigest}`;
    const prior = byIdentity.get(key);
    if (prior && prior.label !== source.label) return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    byIdentity.set(key, source);
  }
  if (byIdentity.size === 0) return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
  try {
    return [...byIdentity.values()]
      .sort((left, right) => {
        const leftKey = `${left.referenceCode}\u0000${left.sourceDigest}`;
        const rightKey = `${right.referenceCode}\u0000${right.sourceDigest}`;
        return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
      })
      .map((source) => Object.freeze({
        label: source.label,
        referenceCode: source.referenceCode,
        citationHandle: createCitationHandle(TOOL_ID, {
          sourceDigest: source.sourceDigest,
          referenceCode: source.referenceCode,
        }),
      }));
  } catch {
    return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
  }
}

function validateSnapshot(
  raw: unknown,
  scope: AuthorizedChildScope,
  asOfDate: string,
  locale: "es-CO" | "en-US",
): VaccinationCardSnapshot {
  const parsed = SNAPSHOT_SCHEMA.safeParse(raw);
  if (!parsed.success
    || parsed.data.evidenceState !== "confirmed_only"
    || parsed.data.country !== scope.countryOfCare
    || parsed.data.asOfDate !== asOfDate
    || parsed.data.package.country !== scope.countryOfCare
    || parsed.data.package.releaseStatus !== "active"
    || parsed.data.template.country !== scope.countryOfCare
    || parsed.data.template.locale !== locale
    || parsed.data.template.releaseStatus !== "released") {
    return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
  }
  return Object.freeze(parsed.data);
}

function domainFailure(error: unknown, effectState: ToolEffectState): never {
  const mapped = mapToolError(error, { effectState });
  if (mapped.code === "INTERNAL_UNAVAILABLE") return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
  throw mapped;
}

async function callPort<T>(
  signal: AbortSignal,
  operation: () => Promise<T>,
  effectState: ToolEffectState,
): Promise<T> {
  if (signal.aborted) return safeFailure("CANCELLED", effectState);
  try {
    const value = await operation();
    if (signal.aborted) return safeFailure("CANCELLED", effectState);
    return value;
  } catch (error) {
    if (signal.aborted) return safeFailure("CANCELLED", effectState);
    return domainFailure(error, effectState);
  }
}

function sameSnapshot(left: VaccinationCardSnapshot, right: VaccinationCardSnapshot): boolean {
  try {
    return canonicalize(left) === canonicalize(right);
  } catch {
    return false;
  }
}

function trustedResult(
  request: VaccinationCardRequestResult,
  snapshot: VaccinationCardSnapshot,
  locale: "es-CO" | "en-US",
  sources: ReadonlyArray<z.infer<typeof TRUSTED_SOURCE_SCHEMA>>,
): GenerateVaccinationCardTrustedResult {
  const checked = GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA.safeParse({
    kind: "trusted_tool_result",
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      status: request.status,
      jobStatus: request.status,
      documentStatus: request.documentStatus,
      asOfDate: snapshot.asOfDate,
      country: snapshot.country,
      evidenceState: snapshot.evidenceState,
      confirmedFactCount: snapshot.confirmedFactCount,
      packageVersion: snapshot.package.version,
      algorithmId: snapshot.package.algorithmId,
      templateVersion: snapshot.template.version,
      templateLocale: locale,
      artifactKind: "private_factual_copy",
      officialRecord: false,
      provenance: { sources },
    },
  });
  if (!checked.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  return Object.freeze(checked.data);
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, input) => {
    const context = runtime.trustedContext as TrustedToolContext<{ vaccinationCard: VaccinationCardPort }>;
    const signal = getTrustedToolAbortSignal(context);
    if (!runtime.idempotencyKey || !runtime.approvalSha256) {
      return safeFailure("TOOL_IDEMPOTENCY_DENIED", "none");
    }
    const domainIdempotencyKey = runtime.idempotencyKey;
    const approvalSha256 = runtime.approvalSha256;
    const locale = input.locale ?? getTrustedToolLocale(context);
    if (locale !== getTrustedToolLocale(context)) return safeFailure("INPUT_INVALID");
    const options = normalizedOptions(input);
    const firstScope = reauthorize(context, "none");
    const asOfDate = currentCalendarDate(nowFrom(context), firstScope.timezone);
    const service = serviceFor(context);
    const rawSnapshot = await callPort(signal, () => service.resolve(Object.freeze({
      scope: firstScope,
      asOfDate,
      locale,
      displayOptions: options,
      signal,
    })), "none");
    const snapshot = validateSnapshot(rawSnapshot, firstScope, asOfDate, locale);
    // Validate provenance before any reservation/enqueue effect. A malformed or
    // conflicting source reference must fail closed without creating a job.
    const sources = sourceList(snapshot);
    const reservationScope = reauthorize(context, "none");
    const rawReceipt = await callPort(signal, () => service.reserveAndEnqueue(Object.freeze({
      scope: reservationScope,
      idempotencyKey: domainIdempotencyKey,
      displayOptions: options,
      snapshot,
      requestSha256: runtime.requestSha256,
      approvalSha256,
      signal,
    })), "unknown");
    const receipt = CARD_REQUEST_RESULT_SCHEMA.safeParse(rawReceipt);
    if (!receipt.success || !sameSnapshot(receipt.data.snapshot, snapshot)) {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    }
    return Object.freeze({
      status: "committed" as const,
      outcome: receipt.data.outcome === "idempotent_replay" ? "replayed" as const : "created" as const,
      result: trustedResult(receipt.data, snapshot, locale, sources),
    });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (
    context: TrustedToolContext,
    input: GenerateVaccinationCardInput,
    approval: ToolApprovalSubmission | null,
  ) => invokeIdempotently(context, input, approval),
);

export function projectGenerateVaccinationCardForModel(raw: unknown): GenerateVaccinationCardModelResult {
  const parsed = GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      status: parsed.data.data.status,
      asOfDate: parsed.data.data.asOfDate,
      citationHandles: parsed.data.data.provenance.sources.map((source) => source.citationHandle),
    },
  });
}

export async function executeGenerateVaccinationCard(
  context: TrustedToolContext,
  input: GenerateVaccinationCardInput,
  approval: ToolApprovalSubmission | null = null,
): Promise<GenerateVaccinationCardExecution> {
  try {
    const raw = await invokeWithAudit(context, input, approval);
    if ("allowed" in raw) {
      if (raw.status === "approval_required") return safeFailure("CONFIRMATION_REQUIRED");
      return safeFailure("CONFIRMATION_INVALID");
    }
    const trusted = GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA.safeParse(raw.result);
    if (!trusted.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    const outcome = raw.outcome === "replayed" ? "replayed" : raw.outcome === "created" ? "created" : null;
    if (outcome === null) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    const checked = GENERATE_VACCINATION_CARD_OUTPUT_SCHEMA.safeParse({
      status: "succeeded",
      outcome,
      result: trusted.data,
      idempotencyKey: raw.idempotencyKey,
      requestSha256: raw.requestSha256,
      approvalSha256: raw.approvalSha256,
    });
    if (!checked.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    return Object.freeze(checked.data);
  } catch (error) {
    throw mapToolError(error, { effectState: "unknown" });
  }
}

export default defineTool({
  description: "Genera una copia factual privada de las vacunas confirmadas del niño activo con el paquete y plantilla vigentes. No certifica inmunidad, no es un registro oficial ni profesional, no combina países y no crea citas, recordatorios ni acciones clínicas.",
  inputSchema: GENERATE_VACCINATION_CARD_INPUT_SCHEMA,
  outputSchema: GENERATE_VACCINATION_CARD_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeGenerateVaccinationCard(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectGenerateVaccinationCardForModel(output.result));
  },
});
