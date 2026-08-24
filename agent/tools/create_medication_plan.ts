import { canonicalize } from "json-canonicalize";
import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { mapToolError } from "../lib/runtime/safe-tool-errors";
import {
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
import {
  authorizeToolInvocation,
} from "../lib/runtime/tool-permission-policy";
import {
  medicationCodingSystemSchema,
  medicationFormSchema,
  medicationRouteSchema,
  medicationUnitSchema,
  medicationPlanRecordSchema,
  type ApprovedMedicationPackage,
  type MedicationConcept,
  type MedicationPlanInput,
  type MedicationPlanRecord,
  type MedicationPresentation,
  type MedicationScheduleOccurrence,
} from "../../src/clinical/medication/types";
import type { MedicationConceptResolution } from "../../src/clinical/medication/concept-resolver";
import { resolveMedicationFormulary } from "../../src/clinical/medication/formulary-resolver";
import type { MedicationPresentationResolution } from "../../src/clinical/medication/presentation-resolver";
import type { MedicationCommandReceipt, MedicationOperationInput } from "../../src/application/medication/ports";

const TOOL_ID = "create_medication_plan" as const;
const TOOL_SCHEMA_VERSION = "create-medication-plan.v1" as const;
const TRUSTED_SCHEMA_VERSION = `${TOOL_ID}.trusted.v1` as const;
const MODEL_SCHEMA_VERSION = `${TOOL_ID}.model.v1` as const;
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u);
const INSTANT = z.string().datetime({ offset: true });
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const POSITIVE_DECIMAL = z.string().regex(/^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/u).max(64);
const TIME_ZONE = z.string().min(1).max(64).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "IANA time zone");
const RELEASE = z.enum(["immediate", "extended", "delayed", "unknown"]);
const PLAN_STATUS = z.enum(["active", "paused", "completed", "cancelled", "superseded"]);

const EXECUTABLE_OR_CONTROL = /(?:\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|<\s*\/?\s*(?:script|iframe|object|embed|form|input|button|a)\b|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|(?:ignore|forget|ignora|olvida).{0,48}(?:previous|prior|anteriores?|system|sistema|instruction|instrucciones?))/iu;
const URGENT_MEDICATION_TEXT = /\b(?:overdose[ds]?|poison(?:ed|ing)?|too\s+much|wrong\s+dose|breathing\s+difficulty|difficulty\s+breathing|seizure|unconscious|unresponsive|bleeding|sobredosis|intoxicaci[oó]n|envenen(?:amiento|ado|ada)?|demasiad[oa]|dificultad\s+para\s+respirar|convulsi[oó]n|inconsciente|no\s+responde|sangrado)\b/iu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

function safeText(max: number) {
  return z.string().min(1).max(max).refine((value) => (
      value === value.normalize("NFKC")
      && !CONTROL_CHARACTER.test(value)
      && !/[<>`]/u.test(value)
      && !EXECUTABLE_OR_CONTROL.test(value)
  ), "safe declared text");
}

const CONCENTRATION_SCHEMA = z.object({
  numerator: POSITIVE_DECIMAL,
  numeratorUnit: medicationUnitSchema,
  denominator: POSITIVE_DECIMAL,
  denominatorUnit: medicationUnitSchema,
}).strict();

const FREQUENCY_SCHEMA = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("interval"), everyHours: POSITIVE_DECIMAL }).strict(),
  z.object({
    kind: z.literal("times_of_day"),
    times: z.array(z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u)).min(1).max(24),
  }).strict().superRefine((value, context) => {
    if (new Set(value.times).size !== value.times.length) {
      context.addIssue({ code: "custom", path: ["times"], message: "duplicate_time" });
    }
  }),
  z.object({ kind: z.literal("as_needed"), label: safeText(200) }).strict(),
]);

const PRODUCT_SCHEMA = z.object({
  displayName: safeText(200),
  conceptCode: CODE,
  codingSystem: medicationCodingSystemSchema,
}).strict();

const SOURCE_SCHEMA = z.object({
  sourceId: CODE,
  sourceVersion: CODE,
  sourceKind: z.enum(["identity", "label", "formulary", "algorithm"]),
  sourceUri: z.string().url(),
  artifactSha256: HASH,
}).strict();

const PACKAGE_SCHEMA = z.object({
  packageId: z.string().uuid(),
  country: z.enum(["CO", "US"]),
  version: CODE,
  effectiveFrom: INSTANT,
  effectiveUntil: INSTANT.nullable(),
  algorithmVersion: CODE,
  vocabularyVersion: CODE,
  status: z.enum(["approved", "active"]),
  approvedBy: safeText(200),
  artifactSha256: HASH,
  sources: z.array(SOURCE_SCHEMA).min(1).max(16),
}).strict();

const INGREDIENT_SCHEMA = z.object({
  ingredientCode: CODE,
  codingSystem: medicationCodingSystemSchema,
  name: safeText(200),
  salt: safeText(160).optional(),
  amount: POSITIVE_DECIMAL.optional(),
  amountUnit: medicationUnitSchema.optional(),
}).strict();

const CONCEPT_SCHEMA = z.object({
  id: z.string().uuid(),
  country: z.enum(["CO", "US"]),
  codingSystem: medicationCodingSystemSchema,
  conceptCode: CODE,
  normalizedName: safeText(240),
  displayName: safeText(200),
  ingredients: z.array(INGREDIENT_SCHEMA).min(1).max(8),
}).strict();

const PRESENTATION_SCHEMA = z.object({
  id: z.string().uuid(),
  conceptId: z.string().uuid(),
  country: z.enum(["CO", "US"]),
  form: medicationFormSchema,
  route: medicationRouteSchema,
  concentration: CONCENTRATION_SCHEMA.nullable(),
  release: RELEASE,
  regulatoryIdentifier: safeText(240),
  ingredients: z.array(INGREDIENT_SCHEMA).min(1).max(8),
}).strict();

const PRESENTATION_DECLARATION_SCHEMA = z.object({
  form: medicationFormSchema,
  release: RELEASE,
  regulatoryIdentifier: safeText(240),
  concentration: CONCENTRATION_SCHEMA.nullable(),
}).strict();

const DOSE_SCHEMA = z.object({
  quantity: POSITIVE_DECIMAL,
  unit: medicationUnitSchema,
}).strict();

export const CREATE_MEDICATION_PLAN_INPUT_SCHEMA = z.object({
  product: PRODUCT_SCHEMA,
  presentation: PRESENTATION_DECLARATION_SCHEMA,
  dose: DOSE_SCHEMA,
  route: medicationRouteSchema,
  frequency: FREQUENCY_SCHEMA,
  startsAt: INSTANT,
  endsAt: INSTANT.optional(),
  timeZone: TIME_ZONE,
  idempotencyKey: OPAQUE_ID,
  declaredIndication: safeText(200).optional(),
  instructions: safeText(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "end_must_follow_start" });
  }
  const declaredText = [
    value.product.displayName,
    value.presentation.regulatoryIdentifier,
    value.declaredIndication,
    value.instructions,
    value.frequency.kind === "as_needed" ? value.frequency.label : undefined,
  ].filter((candidate): candidate is string => candidate !== undefined);
  if (declaredText.some((candidate) => URGENT_MEDICATION_TEXT.test(candidate))) {
    context.addIssue({ code: "custom", path: ["instructions"], message: "urgent_medication_text" });
  }
});
export type CreateMedicationPlanInput = z.infer<typeof CREATE_MEDICATION_PLAN_INPUT_SCHEMA>;

const TRUSTED_PRESENTATION_SCHEMA = z.object({
  form: medicationFormSchema,
  route: medicationRouteSchema,
  release: RELEASE,
  regulatoryIdentifier: safeText(240),
  concentration: CONCENTRATION_SCHEMA.nullable(),
}).strict();

const TRUSTED_FREQUENCY_SCHEMA = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("interval"), everyHours: POSITIVE_DECIMAL }).strict(),
  z.object({
    kind: z.literal("times_of_day"),
    times: z.array(z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u)).min(1).max(24),
  }).strict(),
  z.object({ kind: z.literal("as_needed"), label: safeText(200) }).strict(),
]);

const TRUSTED_DATA_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay"]),
  planStatus: PLAN_STATUS,
  product: PRODUCT_SCHEMA,
  presentation: TRUSTED_PRESENTATION_SCHEMA,
  startsAt: INSTANT,
  endsAt: INSTANT.nullable(),
  timeZone: TIME_ZONE,
  declaredDose: z.object({
    quantity: POSITIVE_DECIMAL,
    unit: medicationUnitSchema,
    route: medicationRouteSchema,
  }).strict().nullable(),
  frequency: TRUSTED_FREQUENCY_SCHEMA.nullable(),
  schedule: z.array(z.object({
    scheduledFor: INSTANT,
    localDate: DATE,
    timeZone: TIME_ZONE,
    source: z.enum(["interval", "times_of_day"]),
  }).strict()).max(64),
  explanationCodes: z.array(CODE).min(1).max(12),
}).strict();

export const CREATE_MEDICATION_PLAN_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: TRUSTED_DATA_SCHEMA,
}).strict();
export type CreateMedicationPlanTrustedResult = Readonly<z.infer<typeof CREATE_MEDICATION_PLAN_TRUSTED_RESULT_SCHEMA>>;

export const CREATE_MEDICATION_PLAN_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.enum(["created", "replayed"]),
  result: CREATE_MEDICATION_PLAN_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: OPAQUE_ID,
  requestSha256: HASH,
  approvalSha256: HASH,
}).strict();
export type CreateMedicationPlanExecution = Readonly<z.infer<typeof CREATE_MEDICATION_PLAN_OUTPUT_SCHEMA>>;
type CreateMedicationPlanModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

export type MedicationFormularyPort = Readonly<{
  resolve(request: Readonly<{
    scope: AuthorizedChildScope;
    country: "CO" | "US";
    at: string;
    locale: "es-CO" | "en-US";
    signal: AbortSignal;
  }>): Promise<Readonly<{
    status: "resolved";
    package: ApprovedMedicationPackage;
  } | {
    status: "unavailable";
    reason: string;
  }>>;
}>;

export type MedicationConceptPort = Readonly<{
  resolve(request: Readonly<{
    scope: AuthorizedChildScope;
    package: ApprovedMedicationPackage;
    country: "CO" | "US";
    codingSystem: CreateMedicationPlanInput["product"]["codingSystem"];
    conceptCode: string;
    name: string;
    signal: AbortSignal;
  }>): Promise<MedicationConceptResolution>;
}>;

export type MedicationPlanPresentationPort = Readonly<{
  resolve(request: Readonly<{
    scope: AuthorizedChildScope;
    package: ApprovedMedicationPackage;
    concept: MedicationConcept;
    country: "CO" | "US";
    form: CreateMedicationPlanInput["presentation"]["form"];
    route: CreateMedicationPlanInput["route"];
    release: CreateMedicationPlanInput["presentation"]["release"];
    concentration: CreateMedicationPlanInput["presentation"]["concentration"];
    regulatoryIdentifier: string;
    signal: AbortSignal;
  }>): Promise<MedicationPresentationResolution>;
}>;

export type MedicationPlanServicePort = Readonly<{
  createDraftWithOutcome(scope: AuthorizedChildScope, input: MedicationPlanInput, operation: MedicationOperationInput): Promise<MedicationCommandReceipt<MedicationPlanRecord>>;
  confirmDeclaredPlanWithOutcome(scope: AuthorizedChildScope, planId: string, operation: MedicationOperationInput): Promise<MedicationCommandReceipt<MedicationPlanRecord>>;
}>;

export type MedicationScheduleServicePort = Readonly<{
  materializeWithOutcome(scope: AuthorizedChildScope, planId: string, range: Readonly<{ from: string; to: string; maxOccurrences: number }>, operation: MedicationOperationInput): Promise<MedicationCommandReceipt<Readonly<{
    occurrences: readonly MedicationScheduleOccurrence[];
    explanationCodes: readonly string[];
  }>>>;
}>;

type CreateMedicationPlanServices = Readonly<Record<string, object> & {
  medicationFormularies: MedicationFormularyPort;
  medicationConcepts: MedicationConceptPort;
  medicationPresentations: MedicationPlanPresentationPort;
  medicationPlans: MedicationPlanServicePort;
  medicationSchedules: MedicationScheduleServicePort;
}>;

const PLAN_COMMAND_RECEIPT_SCHEMA = z.object({
  outcome: z.enum(["created", "replayed"]),
  value: medicationPlanRecordSchema,
}).strict();

const SCHEDULE_COMMAND_RECEIPT_SCHEMA = z.object({
  outcome: z.enum(["created", "replayed", "no_effect"]),
  value: z.unknown(),
}).strict();

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "create_medication_plan.v1",
  inputSchema: CREATE_MEDICATION_PLAN_INPUT_SCHEMA,
  resultSchema: CREATE_MEDICATION_PLAN_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "create_medication_plan.v1",
});

function safeFailure(code: string, effectState: "none" | "unknown" | "committed" = "none"): never {
  throw mapToolError(Object.freeze({ code }), { effectState });
}

function servicesFor(context: TrustedToolContext): CreateMedicationPlanServices {
  try {
    const services = getTrustedToolServices(context) as Partial<CreateMedicationPlanServices>;
    if (!services.medicationFormularies || typeof services.medicationFormularies.resolve !== "function"
      || !services.medicationConcepts || typeof services.medicationConcepts.resolve !== "function"
      || !services.medicationPresentations || typeof services.medicationPresentations.resolve !== "function"
      || !services.medicationPlans
      || typeof services.medicationPlans.createDraftWithOutcome !== "function"
      || typeof services.medicationPlans.confirmDeclaredPlanWithOutcome !== "function"
      || !services.medicationSchedules
      || typeof services.medicationSchedules.materializeWithOutcome !== "function") {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    return services as CreateMedicationPlanServices;
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
}

async function callClinicalPort<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  if (signal.aborted) return safeFailure("CANCELLED");
  try {
    const value = await operation();
    if (signal.aborted) return safeFailure("CANCELLED");
    return value;
  } catch (error) {
    if (signal.aborted) return safeFailure("CANCELLED");
    throw mapToolError(error, { effectState: "none" });
  }
}

function domainFailure(error: unknown, effectState: "none" | "unknown"): never {
  const mapped = mapToolError(error, { effectState });
  if (mapped.code === "INTERNAL_UNAVAILABLE") return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
  throw mapped;
}

function nowFrom(context: TrustedToolContext): Date {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const clock = services.toolIdempotency as Readonly<{ now?: unknown }> | undefined;
    if (!clock || typeof clock.now !== "function") return safeFailure("PERSISTENCE_UNAVAILABLE");
    const now = clock.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE");
    return now;
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
}

function reauthorize(context: TrustedToolContext, effectState: "none" | "unknown"): AuthorizedChildScope {
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

function canonicalDecimal(value: string): string | null {
  try {
    const normalized = value.replace(/^(-?)0+(?=\d)/u, "$1");
    const [whole, fraction] = normalized.split(".");
    return fraction === undefined ? normalized : `${whole}.${fraction.replace(/0+$/u, "") || "0"}`;
  } catch {
    return null;
  }
}

function sameConcentration(
  left: CreateMedicationPlanInput["presentation"]["concentration"],
  right: Readonly<{
    numerator: string;
    numeratorUnit: z.infer<typeof medicationUnitSchema>;
    denominator: string;
    denominatorUnit: z.infer<typeof medicationUnitSchema>;
  }> | null,
): boolean {
  if (left === null || right === null) return left === right;
  const leftNumerator = canonicalDecimal(left.numerator);
  const rightNumerator = canonicalDecimal(String(right.numerator));
  const leftDenominator = canonicalDecimal(left.denominator);
  const rightDenominator = canonicalDecimal(String(right.denominator));
  return leftNumerator !== null
    && leftNumerator === rightNumerator
    && left.numeratorUnit === right.numeratorUnit
    && leftDenominator !== null
    && leftDenominator === rightDenominator
    && left.denominatorUnit === right.denominatorUnit;
}

function resolvedPackage(
  raw: unknown,
  scope: AuthorizedChildScope,
  cutoffAt: string,
): ApprovedMedicationPackage {
  const resolution = z.union([
    z.object({ status: z.literal("resolved"), package: z.unknown() }).strict(),
    z.object({ status: z.literal("unavailable"), reason: safeText(240) }).strict(),
  ]).safeParse(raw);
  if (!resolution.success || resolution.data.status !== "resolved") return safeFailure("RULE_UNAVAILABLE");
  const candidate = PACKAGE_SCHEMA.safeParse(resolution.data.package);
  if (!candidate.success || candidate.data.country !== scope.countryOfCare || candidate.data.status !== "active") {
    return safeFailure("RULE_UNAVAILABLE");
  }
  const resolved = resolveMedicationFormulary({
    country: candidate.data.country,
    at: cutoffAt,
    algorithmVersion: candidate.data.algorithmVersion,
    vocabularyVersion: candidate.data.vocabularyVersion,
    requiredSourceIds: candidate.data.sources.map((source) => source.sourceId),
    requiredArtifactSha256: candidate.data.artifactSha256,
  }, [candidate.data as unknown as ApprovedMedicationPackage]);
  if (resolved.status !== "resolved") return safeFailure("RULE_UNAVAILABLE");
  return candidate.data as unknown as ApprovedMedicationPackage;
}

function resolvedConcept(
  raw: unknown,
  input: CreateMedicationPlanInput,
  scope: AuthorizedChildScope,
): MedicationConcept {
  const resolution = z.object({
    status: z.enum(["resolved", "not_found", "ambiguous", "review_required"]),
    concept: z.unknown().nullable(),
    explanationCodes: z.array(CODE).max(12),
  }).strict().safeParse(raw);
  if (!resolution.success || resolution.data.status !== "resolved" || resolution.data.concept === null) {
    return safeFailure("RULE_UNAVAILABLE");
  }
  const candidate = CONCEPT_SCHEMA.safeParse(resolution.data.concept);
  if (!candidate.success
    || candidate.data.country !== scope.countryOfCare
    || candidate.data.codingSystem !== input.product.codingSystem
    || candidate.data.conceptCode !== input.product.conceptCode
    || candidate.data.displayName !== input.product.displayName) {
    return safeFailure("RULE_UNAVAILABLE");
  }
  return candidate.data as unknown as MedicationConcept;
}

function sameIngredients(
  left: readonly z.infer<typeof INGREDIENT_SCHEMA>[],
  right: readonly z.infer<typeof INGREDIENT_SCHEMA>[],
): boolean {
  const identity = (ingredient: z.infer<typeof INGREDIENT_SCHEMA>) => [
    ingredient.ingredientCode,
    ingredient.codingSystem,
    ingredient.name,
    ingredient.salt ?? "",
    ingredient.amount ?? "",
    ingredient.amountUnit ?? "",
  ].join("\u0000");
  const leftValues = left.map(identity).sort();
  const rightValues = right.map(identity).sort();
  return leftValues.length === rightValues.length
    && leftValues.every((value, index) => value === rightValues[index]);
}

function resolvedPresentation(
  raw: unknown,
  input: CreateMedicationPlanInput,
  scope: AuthorizedChildScope,
  concept: MedicationConcept,
): MedicationPresentation {
  const schema = z.object({
    status: z.enum(["resolved", "not_found", "ambiguous", "review_required"]),
    presentation: z.unknown().nullable(),
    explanationCodes: z.array(CODE).max(12),
  }).strict().safeParse(raw);
  if (!schema.success || schema.data.status !== "resolved" || schema.data.presentation === null) {
    return safeFailure("RULE_UNAVAILABLE");
  }
  const candidate = PRESENTATION_SCHEMA.safeParse(schema.data.presentation);
  if (!candidate.success
    || candidate.data.country !== scope.countryOfCare
    || candidate.data.conceptId !== concept.id
    || candidate.data.form !== input.presentation.form
    || candidate.data.route !== input.route
    || candidate.data.release !== input.presentation.release
    || candidate.data.regulatoryIdentifier !== input.presentation.regulatoryIdentifier
    || !sameConcentration(input.presentation.concentration, candidate.data.concentration)
    || !sameIngredients(concept.ingredients as readonly z.infer<typeof INGREDIENT_SCHEMA>[], candidate.data.ingredients)) {
    return safeFailure("RULE_UNAVAILABLE");
  }
  return candidate.data as unknown as MedicationPresentation;
}

function sameInstant(left: string, right: string | undefined): boolean {
  if (right === undefined) return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && leftMs === rightMs;
}

function sameFrequency(left: unknown, right: unknown): boolean {
  try {
    return canonicalize(left) === canonicalize(right);
  } catch {
    return false;
  }
}

function verifyPlan(
  raw: unknown,
  expectedStatus: "draft" | "active",
  input: CreateMedicationPlanInput,
  scope: AuthorizedChildScope,
  presentation: MedicationPresentation,
): MedicationPlanRecord {
  const parsed = medicationPlanRecordSchema.safeParse(raw);
  if (!parsed.success
    || parsed.data.status !== expectedStatus
    || parsed.data.careSpaceId !== scope.careSpaceId
    || parsed.data.childId !== scope.childId
    || parsed.data.recordedBy !== scope.actorUserId
    || parsed.data.supersedesId !== null
    || parsed.data.input.displayName !== input.product.displayName
    || parsed.data.input.conceptCode !== input.product.conceptCode
    || parsed.data.input.codingSystem !== input.product.codingSystem
    || parsed.data.input.presentationId !== presentation.id
    || parsed.data.input.declaredIndication !== input.declaredIndication
    || parsed.data.input.instructions !== input.instructions
    || !sameInstant(input.startsAt, parsed.data.input.startsAt)
    || (input.endsAt !== undefined && !sameInstant(input.endsAt, parsed.data.input.endsAt))
    || (input.endsAt === undefined && parsed.data.input.endsAt !== undefined)
    || parsed.data.input.dose?.quantity !== input.dose.quantity
    || parsed.data.input.dose?.unit !== input.dose.unit
    || parsed.data.input.route !== input.route
    || !sameFrequency(parsed.data.input.frequency, input.frequency)) {
    return safeFailure("PERSISTENCE_UNAVAILABLE", expectedStatus === "active" ? "unknown" : "none");
  }
  return parsed.data;
}

function scheduleWindow(input: CreateMedicationPlanInput): Readonly<{ from: string; to: string; maxOccurrences: number }> {
  const fromMs = Date.parse(input.startsAt);
  // The bounded window is only a materialization/preview limit. It never
  // becomes the plan's declared end date when the caregiver omits endsAt.
  const endMs = input.endsAt ? Date.parse(input.endsAt) : fromMs + 7 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(fromMs) || !Number.isFinite(endMs) || endMs <= fromMs) return safeFailure("INVALID_INPUT");
  return Object.freeze({
    from: new Date(fromMs).toISOString(),
    to: new Date(endMs).toISOString(),
    maxOccurrences: 64,
  });
}

function localDateAt(instant: string, timeZone: string): string | null {
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
    const date = year && month && day ? `${year}-${month}-${day}` : null;
    return date && DATE.safeParse(date).success ? date : null;
  } catch {
    return null;
  }
}

function validatedSchedule(
  raw: unknown,
  plan: MedicationPlanRecord,
  scope: AuthorizedChildScope,
  input: CreateMedicationPlanInput,
): Readonly<{ occurrences: readonly MedicationScheduleOccurrence[]; explanationCodes: readonly string[] }> {
  const parsed = z.object({
    occurrences: z.array(z.unknown()).max(64),
    explanationCodes: z.array(CODE).min(1).max(12),
  }).strict().safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  const window = scheduleWindow(input);
  const fromMs = Date.parse(window.from);
  const toMs = Date.parse(window.to);
  const occurrenceSchema = z.object({
    occurrenceId: OPAQUE_ID,
    planId: z.string().uuid(),
    planVersion: z.number().int().positive(),
    scheduledFor: INSTANT,
    localDate: DATE,
    timeZone: TIME_ZONE,
    source: z.enum(["interval", "times_of_day"]),
  }).strict();
  const occurrences: MedicationScheduleOccurrence[] = [];
  const seenIds = new Set<string>();
  const seenInstants = new Set<string>();
  const expectedSource = input.frequency.kind === "interval" ? "interval"
    : input.frequency.kind === "times_of_day" ? "times_of_day" : null;
  let previousKey = "";
  for (const rawOccurrence of parsed.data.occurrences) {
    const value = occurrenceSchema.safeParse(rawOccurrence);
    const scheduledMs = value.success ? Date.parse(value.data.scheduledFor) : Number.NaN;
    if (!value.success
      || value.data.planId !== plan.id
      || value.data.planVersion !== plan.version
      || value.data.timeZone !== scope.timezone
      || !Number.isFinite(scheduledMs)
      || scheduledMs < fromMs
      || scheduledMs >= toMs
      || (expectedSource !== null && value.data.source !== expectedSource)
      || (expectedSource === null)
      || localDateAt(value.data.scheduledFor, scope.timezone) !== value.data.localDate
      || seenIds.has(value.data.occurrenceId)
      || seenInstants.has(value.data.scheduledFor)
      || (previousKey !== "" && `${value.data.scheduledFor}\u0000${value.data.occurrenceId}` <= previousKey)) {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    }
    previousKey = `${value.data.scheduledFor}\u0000${value.data.occurrenceId}`;
    seenIds.add(value.data.occurrenceId);
    seenInstants.add(value.data.scheduledFor);
    occurrences.push(value.data as MedicationScheduleOccurrence);
  }
  return Object.freeze({ occurrences: Object.freeze(occurrences), explanationCodes: Object.freeze([...parsed.data.explanationCodes]) });
}

function trustedResult(
  plan: MedicationPlanRecord,
  presentation: MedicationPresentation,
  schedule: Readonly<{ occurrences: readonly MedicationScheduleOccurrence[]; explanationCodes: readonly string[] }>,
  scope: AuthorizedChildScope,
  outcome: "created" | "replayed",
): CreateMedicationPlanTrustedResult {
  const input = plan.input;
  const parsed = CREATE_MEDICATION_PLAN_TRUSTED_RESULT_SCHEMA.safeParse({
    kind: "trusted_tool_result",
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      outcome: outcome === "replayed" ? "idempotent_replay" : "created",
      planStatus: plan.status,
      product: {
        displayName: input.displayName,
        conceptCode: input.conceptCode,
        codingSystem: input.codingSystem,
      },
      presentation: {
        form: presentation.form,
        route: presentation.route,
        release: presentation.release,
        regulatoryIdentifier: presentation.regulatoryIdentifier,
        concentration: presentation.concentration,
      },
      startsAt: new Date(input.startsAt).toISOString(),
      endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      timeZone: scope.timezone,
      declaredDose: input.dose && input.route
        ? { quantity: input.dose.quantity, unit: input.dose.unit, route: input.route }
        : null,
      frequency: input.frequency ?? null,
      schedule: schedule.occurrences.map(({ scheduledFor, localDate, timeZone, source }) => ({
        scheduledFor,
        localDate,
        timeZone,
        source,
      })),
      explanationCodes: schedule.explanationCodes,
    },
  });
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  return Object.freeze(parsed.data) as CreateMedicationPlanTrustedResult;
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, input) => {
    const context = runtime.trustedContext as TrustedToolContext<CreateMedicationPlanServices>;
    const services = servicesFor(context);
    const signal = getTrustedToolAbortSignal(context);
    if (signal.aborted) return safeFailure("CANCELLED");
    if (input.timeZone !== runtime.scope.timezone) return safeFailure("INVALID_INPUT");

    const cutoffAt = nowFrom(context).toISOString();
    const packageRaw = await callClinicalPort(signal, () => services.medicationFormularies.resolve(Object.freeze({
      scope: runtime.scope,
      country: runtime.scope.countryOfCare,
      at: cutoffAt,
      locale: getTrustedToolLocale(context),
      signal,
    })));
    const exactPackage = resolvedPackage(packageRaw, runtime.scope, cutoffAt);
    const conceptRaw = await callClinicalPort(signal, () => services.medicationConcepts.resolve(Object.freeze({
      scope: runtime.scope,
      package: exactPackage,
      country: runtime.scope.countryOfCare,
      codingSystem: input.product.codingSystem,
      conceptCode: input.product.conceptCode,
      name: input.product.displayName,
      signal,
    })));
    const exactConcept = resolvedConcept(conceptRaw, input, runtime.scope);
    const presentationRaw = await callClinicalPort(signal, () => services.medicationPresentations.resolve(Object.freeze({
      scope: runtime.scope,
      package: exactPackage,
      concept: exactConcept,
      country: runtime.scope.countryOfCare,
      form: input.presentation.form,
      route: input.route,
      release: input.presentation.release,
      concentration: input.presentation.concentration,
      regulatoryIdentifier: input.presentation.regulatoryIdentifier,
      signal,
    })));
    const exactPresentation = resolvedPresentation(
      presentationRaw,
      input,
      runtime.scope,
      exactConcept,
    );

    const draftScope = reauthorize(context, "none");
    const planInput: MedicationPlanInput = Object.freeze({
      displayName: input.product.displayName,
      conceptCode: input.product.conceptCode,
      codingSystem: input.product.codingSystem,
      presentationId: exactPresentation.id,
      ...(input.declaredIndication ? { declaredIndication: input.declaredIndication } : {}),
      startsAt: new Date(input.startsAt).toISOString(),
      ...(input.endsAt ? { endsAt: new Date(input.endsAt).toISOString() } : {}),
      dose: Object.freeze({ quantity: input.dose.quantity, unit: input.dose.unit }),
      route: input.route,
      frequency: input.frequency,
      ...(input.instructions ? { instructions: input.instructions } : {}),
    });
    let draftReceiptRaw: unknown;
    try {
      draftReceiptRaw = await services.medicationPlans.createDraftWithOutcome(draftScope, planInput, Object.freeze({
        idempotencyKey: `${runtime.idempotencyKey}:create`,
        digest: runtime.requestSha256,
      }));
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED");
      return domainFailure(error, "unknown");
    }
    if (signal.aborted) return safeFailure("CANCELLED", "unknown");
    const draftReceipt = PLAN_COMMAND_RECEIPT_SCHEMA.safeParse(draftReceiptRaw);
    if (!draftReceipt.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    const draft = verifyPlan(draftReceipt.data.value, "draft", input, draftScope, exactPresentation);
    const confirmScope = reauthorize(context, "unknown");
    let confirmReceiptRaw: unknown;
    try {
      confirmReceiptRaw = await services.medicationPlans.confirmDeclaredPlanWithOutcome(confirmScope, draft.id, Object.freeze({
        idempotencyKey: `${runtime.idempotencyKey}:confirm`,
        digest: runtime.approvalSha256 ?? runtime.requestSha256,
      }));
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "unknown");
      return domainFailure(error, "unknown");
    }
    if (signal.aborted) return safeFailure("CANCELLED", "unknown");
    const confirmReceipt = PLAN_COMMAND_RECEIPT_SCHEMA.safeParse(confirmReceiptRaw);
    if (!confirmReceipt.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    const activePlan = verifyPlan(confirmReceipt.data.value, "active", input, confirmScope, exactPresentation);
    const scheduleRange = scheduleWindow(input);
    const scheduleScope = reauthorize(context, "unknown");
    let scheduleRaw: unknown;
    try {
      scheduleRaw = await services.medicationSchedules.materializeWithOutcome(scheduleScope, activePlan.id, scheduleRange, Object.freeze({
        idempotencyKey: `${runtime.idempotencyKey}:schedule`,
        digest: runtime.requestSha256,
      }));
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "unknown");
      return domainFailure(error, "unknown");
    }
    if (signal.aborted) return safeFailure("CANCELLED", "unknown");
    const scheduleReceipt = SCHEDULE_COMMAND_RECEIPT_SCHEMA.safeParse(scheduleRaw);
    if (!scheduleReceipt.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    const schedule = validatedSchedule(scheduleReceipt.data.value, activePlan, scheduleScope, input);
    const outcome = draftReceipt.data.outcome === "replayed"
      && confirmReceipt.data.outcome === "replayed"
      && scheduleReceipt.data.outcome !== "created"
      ? "replayed" as const
      : "created" as const;
    return Object.freeze({
      status: "committed" as const,
      outcome,
      result: trustedResult(activePlan, exactPresentation, schedule, scheduleScope, outcome),
    });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (
    context: TrustedToolContext,
    input: CreateMedicationPlanInput,
    approval: ToolApprovalSubmission | null,
  ) => invokeIdempotently(context, input, approval),
);

export function projectCreateMedicationPlanForModel(raw: unknown): CreateMedicationPlanModelResult {
  const parsed = CREATE_MEDICATION_PLAN_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  const frequency = parsed.data.data.frequency;
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      outcome: parsed.data.data.outcome,
      planStatus: parsed.data.data.planStatus,
      startsAt: parsed.data.data.startsAt,
      endsAt: parsed.data.data.endsAt,
      declaredDose: parsed.data.data.declaredDose,
      frequency: frequency === null
        ? null
        : frequency.kind === "interval"
          ? { kind: "interval", everyHours: frequency.everyHours }
          : frequency.kind === "times_of_day"
            ? { kind: "times_of_day", times: frequency.times }
            : { kind: "as_needed" },
      schedule: parsed.data.data.schedule.map(({ scheduledFor, localDate, source }) => ({
        scheduledFor,
        localDate,
        source,
      })),
    },
  });
}

export async function executeCreateMedicationPlan(
  context: TrustedToolContext,
  input: CreateMedicationPlanInput,
  approval: ToolApprovalSubmission | null = null,
): Promise<CreateMedicationPlanExecution> {
  try {
    const raw = await invokeWithAudit(context, input, approval);
    if ("allowed" in raw) {
      if (raw.status === "approval_required") return safeFailure("CONFIRMATION_REQUIRED");
      return safeFailure("CONFIRMATION_INVALID");
    }
    const trusted = CREATE_MEDICATION_PLAN_TRUSTED_RESULT_SCHEMA.safeParse(raw.result);
    if (!trusted.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    if (raw.outcome !== "created" && raw.outcome !== "replayed") {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    }
    const expectedTrustedOutcome = raw.outcome === "replayed" ? "idempotent_replay" : "created";
    if (trusted.data.data.outcome !== expectedTrustedOutcome) {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    }
    const output = CREATE_MEDICATION_PLAN_OUTPUT_SCHEMA.safeParse({
      status: "succeeded",
      outcome: raw.outcome,
      result: trusted.data,
      idempotencyKey: raw.idempotencyKey,
      requestSha256: raw.requestSha256,
      approvalSha256: raw.approvalSha256,
    });
    if (!output.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    return Object.freeze(output.data) as CreateMedicationPlanExecution;
  } catch (error) {
    throw mapToolError(error, { effectState: "unknown" });
  }
}

export default defineTool({
  description: "Registra un plan de medicamento que el tutor declara que ya existe. No selecciona medicamento, no prescribe, no modifica dosis y no indica que administrar sea seguro.",
  inputSchema: CREATE_MEDICATION_PLAN_INPUT_SCHEMA,
  outputSchema: CREATE_MEDICATION_PLAN_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeCreateMedicationPlan(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectCreateMedicationPlanForModel(output.result));
  },
});
