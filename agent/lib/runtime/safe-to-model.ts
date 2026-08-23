import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  REGISTERED_TOOL_IDS,
  type RegisteredToolId,
} from "./tool-permission-policy";

const CODE = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u)
  .refine((value) => !/^[A-Za-z0-9+/]{48,}={0,2}$/u.test(value), "bounded code");
const DECIMAL = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u).max(64);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "ISO calendar date");
const INSTANT = z.string().datetime({ offset: true });
const CITATION_HANDLE = z.string().regex(/^citation:v1:[a-f0-9]{64}$/u);
const CITATION_INPUT = z.object({
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  referenceCode: CODE,
}).strict();
const CITATIONS = z.array(CITATION_HANDLE).min(1).max(16);
const FORBIDDEN_KEY = /^(?:__proto__|prototype|constructor|actorUserId|careSpaceId|childId|guardianId|recordedBy|countryOfCare|permissions|roles|entitlements|capabilities|packageId|packageVersion|artifactSha256|approvalDigest|inputDigest|decisionDigest|traceId|sessionId|signedUrl|url|uri|headers|bucket|objectPath|path|ticketId|ticket|raw|rawDocument|prompt|reasoning|vector|embedding|documentContent)$/iu;
const EXECUTABLE_OR_CONTROL = /(?:\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|<\s*\/?\s*(?:script|iframe|object|embed|form|input|button|a)\b|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|(?:ignore|forget|ignora|olvida).{0,48}(?:previous|prior|anteriores?|system|sistema|instruction|instrucciones?))/iu;
const BASE64_BLOB = /^[A-Za-z0-9+/]{48,}={0,2}$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

function safeTextValue(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL_CHARACTER.test(value)
    && !EXECUTABLE_OR_CONTROL.test(value)
    && !BASE64_BLOB.test(value);
}

function safeText(max: number) {
  return z.string().min(1).max(max).refine(safeTextValue, "model-safe text");
}

const OUTCOME = z.enum(["created", "idempotent_replay"]);
const IMMUNIZATION_STATUS = z.enum([
  "applied", "upcoming", "due", "overdue", "not_applicable", "review_required",
]);
const IMMUNIZATION_ASSESSMENT = z.object({
  seriesCode: CODE,
  doseCode: CODE,
  doseNumber: z.number().int().min(1).max(20),
  status: IMMUNIZATION_STATUS,
  reasonCode: CODE,
  dueFrom: DATE.nullable(),
  dueUntil: DATE.nullable(),
  citationHandles: CITATIONS,
}).strict();

const MEASUREMENT_TYPE = z.enum(["weight", "recumbent_length", "standing_height", "head_circumference"]);
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
const GROWTH_COMMON = {
  indicator: GROWTH_INDICATOR,
  ageBasis: z.enum(["chronological", "corrected"]),
  ageDays: z.number().int().nonnegative().max(10_000),
  interpretation: z.enum(["within_expected", "review_required", "urgent_review", "unavailable"]),
  warnings: z.array(GROWTH_WARNING).max(12),
  citationHandles: CITATIONS,
} as const;
const CALCULATED_GROWTH = z.object({
  status: z.literal("calculated"),
  ...GROWTH_COMMON,
  zScore: DECIMAL,
  percentile: DECIMAL,
}).strict();
const UNAVAILABLE_GROWTH = z.object({
  status: z.enum(["rule_unavailable", "insufficient_data", "excluded"]),
  ...GROWTH_COMMON,
  zScore: z.null(),
  percentile: z.null(),
}).strict();
const GROWTH_ASSESSMENT = z.union([CALCULATED_GROWTH, UNAVAILABLE_GROWTH]);

const NUTRITION_BLOCK = z.object({
  contentCode: CODE,
  kind: z.enum(["education", "feeding", "preparation", "safety", "exclusion"]),
  title: safeText(160),
  text: safeText(2_000),
  citationHandles: CITATIONS,
}).strict();
const NUTRITION_RECIPE = z.object({
  recipeCode: CODE,
  title: safeText(160),
  ingredientCodes: z.array(CODE).min(1).max(24),
  preparationSteps: z.array(safeText(500)).min(1).max(12),
  texture: z.enum(["smooth_puree", "mashed", "soft_lumpy", "finger_food", "family_food", "unknown"]),
  supervision: z.enum(["required", "recommended"]),
  citationHandles: CITATIONS,
}).strict();
const NUTRITION_RESULT = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("educational_guidance"),
    blocks: z.array(NUTRITION_BLOCK).max(16),
    recipes: z.array(NUTRITION_RECIPE).max(8),
    exclusions: z.array(z.object({ contentCode: CODE, reasonCodes: z.array(CODE).min(1).max(8) }).strict()).max(24),
  }).strict(),
  z.object({
    status: z.literal("insufficient_data"),
    reasonCodes: z.array(CODE).min(1).max(8),
    missingFacts: z.array(CODE).max(8),
  }).strict(),
  z.object({
    status: z.literal("professional_review"),
    responseMode: z.literal("pediatrician_recommendation"),
    reasonCodes: z.array(CODE).min(1).max(8),
  }).strict(),
]);

const MEDICATION_UNIT = z.enum(["mg", "mcg", "g", "mL", "L", "tablet", "capsule", "drop", "puff", "application"]);
const MEDICATION_ROUTE = z.enum(["oral", "intravenous", "intramuscular", "subcutaneous", "topical", "inhaled", "other"]);
const MEDICATION_FREQUENCY = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("interval"), everyHours: DECIMAL }).strict(),
  z.object({ kind: z.literal("times_of_day"), times: z.array(z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u)).min(1).max(24) }).strict(),
  z.object({ kind: z.literal("as_needed") }).strict(),
]);
const DEVELOPMENT_DOMAIN = z.enum([
  "gross_motor", "fine_motor", "language", "social", "cognitive", "adaptive", "general",
]);

function envelope<T extends RegisteredToolId, S extends z.ZodType>(toolId: T, data: S) {
  return z.object({
    kind: z.literal("tool_result"),
    toolId: z.literal(toolId),
    schemaVersion: z.literal(`${toolId}.model.v1`),
    data,
  }).strict();
}

const schemaDefinitions = {
  evaluate_vaccination_schedule: envelope("evaluate_vaccination_schedule", z.object({
    asOfDate: DATE,
    assessments: z.array(IMMUNIZATION_ASSESSMENT).max(48),
  }).strict()),
  get_growth_summary: envelope("get_growth_summary", z.object({
    cutoffAt: INSTANT,
    points: z.array(z.union([
      CALCULATED_GROWTH.extend({
        occurredAt: INSTANT,
        measurementType: MEASUREMENT_TYPE,
        value: DECIMAL,
        unit: z.enum(["kg", "cm"]),
      }).strict(),
      UNAVAILABLE_GROWTH.extend({
        occurredAt: INSTANT,
        measurementType: MEASUREMENT_TYPE,
        value: DECIMAL,
        unit: z.enum(["kg", "cm"]),
      }).strict(),
    ])).max(48),
  }).strict()),
  suggest_pediatric_nutrition: envelope("suggest_pediatric_nutrition", NUTRITION_RESULT),
  validate_declared_pediatric_dose: envelope("validate_declared_pediatric_dose", z.object({
    outcome: z.enum([
      "within_reference_limits",
      "outside_reference_limits",
      "insufficient_data",
      "requires_professional_review",
    ]),
    explanationCodes: z.array(CODE).min(1).max(12),
    citationHandles: CITATIONS,
  }).strict()),
  register_anthropometry: envelope("register_anthropometry", z.object({
    outcome: OUTCOME,
    measurement: z.object({
      measurementType: MEASUREMENT_TYPE,
      value: DECIMAL,
      unit: z.enum(["kg", "cm"]),
      occurredAt: INSTANT,
    }).strict(),
    assessment: GROWTH_ASSESSMENT,
  }).strict()),
  record_vaccine_administration: envelope("record_vaccine_administration", z.object({
    outcome: OUTCOME,
    administeredOn: DATE,
    productCode: CODE,
    antigenCodes: z.array(CODE).min(1).max(16),
    assessments: z.array(IMMUNIZATION_ASSESSMENT).max(48),
  }).strict()),
  create_medication_plan: envelope("create_medication_plan", z.object({
    outcome: OUTCOME,
    planStatus: z.enum(["active", "paused", "completed", "cancelled", "superseded"]),
    startsAt: INSTANT,
    endsAt: INSTANT.nullable(),
    declaredDose: z.object({ quantity: DECIMAL, unit: MEDICATION_UNIT, route: MEDICATION_ROUTE }).strict().nullable(),
    frequency: MEDICATION_FREQUENCY.nullable(),
    schedule: z.array(z.object({
      scheduledFor: INSTANT,
      localDate: DATE,
      source: z.enum(["interval", "times_of_day"]),
    }).strict()).max(64),
  }).strict()),
  record_medication_intake: envelope("record_medication_intake", z.object({
    outcome: OUTCOME,
    state: z.enum(["taken", "skipped", "unknown"]),
    scheduledFor: INSTANT.nullable(),
    takenAt: INSTANT.nullable(),
  }).strict()),
  record_development_observation: envelope("record_development_observation", z.object({
    outcome: OUTCOME,
    domain: DEVELOPMENT_DOMAIN,
    observedOn: DATE,
    milestoneCode: CODE.nullable(),
    concernDeclared: z.boolean(),
  }).strict()),
  capture_clinical_memory_candidate: envelope("capture_clinical_memory_candidate", z.object({
    status: z.literal("pending_confirmation"),
    outcome: z.enum(["created", "idempotent_replay", "source_replay"]),
    sensitivity: z.enum(["low", "medium", "high"]),
    expiresAt: INSTANT,
    confirmationRequired: z.literal(true),
  }).strict()),
  search_child_clinical_memory: envelope("search_child_clinical_memory", z.object({
    cutoffAt: INSTANT,
    entries: z.array(z.object({
      contentKind: z.literal("confirmed_untrusted_fact"),
      quotedFact: safeText(512),
      observedAt: INSTANT,
      sourceKind: z.enum(["guardian", "professional", "import", "document", "chat", "system"]),
      citationHandles: CITATIONS,
    }).strict()).max(12),
    omittedCount: z.number().int().nonnegative().max(10_000),
  }).strict()),
  prepare_private_document_upload: envelope("prepare_private_document_upload", z.object({
    status: z.literal("upload_prepared"),
    purpose: z.enum(["avatar", "vaccine_record", "clinical_attachment", "generated_report", "clinical_source"]),
    mobileActionRequired: z.literal(true),
  }).strict()),
  generate_vaccination_card: envelope("generate_vaccination_card", z.object({
    status: z.enum(["queued", "processing", "ready", "failed"]),
    asOfDate: DATE,
    citationHandles: CITATIONS,
  }).strict()),
} as const satisfies Record<RegisteredToolId, z.ZodType>;

export const TOOL_SAFE_RESULT_SCHEMAS = Object.freeze(schemaDefinitions);

export type ToolSafeProjectionMap = {
  readonly [K in RegisteredToolId]: z.infer<(typeof TOOL_SAFE_RESULT_SCHEMAS)[K]>;
};

export type CitationHandle = z.infer<typeof CITATION_HANDLE>;
export type CitationHandleInput = Readonly<z.infer<typeof CITATION_INPUT>>;

export type ToolModelBudget = Readonly<{ maxBytes: number; maxTokens: number }>;

function budget(maxBytes: number, maxTokens: number): ToolModelBudget {
  return Object.freeze({ maxBytes, maxTokens });
}

export const TOOL_MODEL_BUDGETS = Object.freeze({
  evaluate_vaccination_schedule: budget(16_384, 16_384),
  get_growth_summary: budget(16_384, 16_384),
  suggest_pediatric_nutrition: budget(24_576, 24_576),
  validate_declared_pediatric_dose: budget(4_096, 4_096),
  register_anthropometry: budget(8_192, 8_192),
  record_vaccine_administration: budget(16_384, 16_384),
  create_medication_plan: budget(12_288, 12_288),
  record_medication_intake: budget(4_096, 4_096),
  record_development_observation: budget(4_096, 4_096),
  capture_clinical_memory_candidate: budget(2_048, 2_048),
  search_child_clinical_memory: budget(4_096, 4_096),
  prepare_private_document_upload: budget(2_048, 2_048),
  generate_vaccination_card: budget(4_096, 4_096),
} as const satisfies Record<RegisteredToolId, ToolModelBudget>);

export const MAX_MODEL_RESULT_BYTES = Math.max(...Object.values(TOOL_MODEL_BUDGETS).map((value) => value.maxBytes));
export const MAX_MODEL_RESULT_TOKENS = Math.max(...Object.values(TOOL_MODEL_BUDGETS).map((value) => value.maxTokens));

const REGISTERED = new Set<string>(REGISTERED_TOOL_IDS);

type SafeModelBoundaryErrorCode =
  | "SAFE_MODEL_TOOL_UNKNOWN"
  | "SAFE_MODEL_PROJECTION_INVALID"
  | "SAFE_MODEL_BUDGET_EXCEEDED"
  | "SAFE_MODEL_CITATION_INVALID";

class SafeModelBoundaryError extends Error {
  constructor(readonly code: SafeModelBoundaryErrorCode) {
    super(code);
    this.name = "SafeModelBoundaryError";
  }
}

function fail(code: SafeModelBoundaryErrorCode): never {
  throw new SafeModelBoundaryError(code);
}

function assertPlainInput(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail("SAFE_MODEL_PROJECTION_INVALID");
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) fail("SAFE_MODEL_PROJECTION_INVALID");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || FORBIDDEN_KEY.test(key)) fail("SAFE_MODEL_PROJECTION_INVALID");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail("SAFE_MODEL_PROJECTION_INVALID");
    assertPlainInput(descriptor.value, seen);
  }
}

function assertRedactedValue(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value === "string") {
    if (!safeTextValue(value) && !CODE.safeParse(value).success && !DATE.safeParse(value).success
      && !INSTANT.safeParse(value).success && !CITATION_HANDLE.safeParse(value).success
      && !DECIMAL.safeParse(value).success) fail("SAFE_MODEL_PROJECTION_INVALID");
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail("SAFE_MODEL_PROJECTION_INVALID");
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) fail("SAFE_MODEL_PROJECTION_INVALID");
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) fail("SAFE_MODEL_PROJECTION_INVALID");
    assertRedactedValue(child, seen);
  }
}

function serializedSize(value: unknown): number {
  try {
    return Buffer.byteLength(canonicalize(value), "utf8");
  } catch {
    return fail("SAFE_MODEL_PROJECTION_INVALID");
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function knownToolId(value: unknown): value is RegisteredToolId {
  return typeof value === "string" && REGISTERED.has(value);
}

export function createCitationHandle(toolId: RegisteredToolId, rawInput: CitationHandleInput): CitationHandle {
  if (!knownToolId(toolId)) fail("SAFE_MODEL_TOOL_UNKNOWN");
  try {
    assertPlainInput(rawInput);
    const parsed = CITATION_INPUT.safeParse(rawInput);
    if (!parsed.success) fail("SAFE_MODEL_CITATION_INVALID");
    const digest = createHash("sha256").update(canonicalize({
      domain: "tool-model-citation.v1",
      toolId,
      ...parsed.data,
    }), "utf8").digest("hex");
    return `citation:v1:${digest}` as CitationHandle;
  } catch (error) {
    if (error instanceof SafeModelBoundaryError
      && (error.code === "SAFE_MODEL_TOOL_UNKNOWN" || error.code === "SAFE_MODEL_CITATION_INVALID")) throw error;
    return fail("SAFE_MODEL_CITATION_INVALID");
  }
}

export function assertModelSafeProjection<K extends RegisteredToolId>(
  toolId: K,
  value: unknown,
): asserts value is ToolSafeProjectionMap[K] {
  if (!knownToolId(toolId)) fail("SAFE_MODEL_TOOL_UNKNOWN");
  try {
    if (!TOOL_SAFE_RESULT_SCHEMAS[toolId].safeParse(value).success) fail("SAFE_MODEL_PROJECTION_INVALID");
    assertRedactedValue(value);
  } catch (error) {
    if (error instanceof SafeModelBoundaryError) throw error;
    fail("SAFE_MODEL_PROJECTION_INVALID");
  }
  const bytes = serializedSize(value);
  const { maxBytes, maxTokens } = TOOL_MODEL_BUDGETS[toolId];
  // UTF-8 byte length is a conservative provider-neutral upper bound for byte-level tokenizers.
  const tokenUpperBound = bytes;
  if (bytes > maxBytes || tokenUpperBound > maxTokens) fail("SAFE_MODEL_BUDGET_EXCEEDED");
}

export function projectToolResult<K extends RegisteredToolId>(
  toolId: K,
  result: unknown,
): ToolSafeProjectionMap[K] {
  if (!knownToolId(toolId)) fail("SAFE_MODEL_TOOL_UNKNOWN");
  let parsed: ToolSafeProjectionMap[K];
  try {
    assertPlainInput(result);
    const outcome = TOOL_SAFE_RESULT_SCHEMAS[toolId].safeParse(result);
    if (!outcome.success) fail("SAFE_MODEL_PROJECTION_INVALID");
    parsed = outcome.data as ToolSafeProjectionMap[K];
  } catch (error) {
    if (error instanceof SafeModelBoundaryError) throw error;
    return fail("SAFE_MODEL_PROJECTION_INVALID");
  }
  const frozen = deepFreeze(parsed);
  assertModelSafeProjection(toolId, frozen);
  return frozen;
}
