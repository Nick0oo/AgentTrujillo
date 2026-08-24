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
  requireActiveChildScope,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import {
  type MedicationConceptResolution,
} from "../../src/clinical/medication/concept-resolver";
import {
  resolveMedicationFormulary,
} from "../../src/clinical/medication/formulary-resolver";
import {
  resolveMedicationPresentation,
  type MedicationPresentationResolution,
} from "../../src/clinical/medication/presentation-resolver";
import { convertMedicationConcentration } from "../../src/clinical/medication/concentration-converter";
import { compareMedicationDailyExposure } from "../../src/clinical/medication/daily-comparator";
import { type MedicationDoseRuleResolution } from "../../src/clinical/medication/dose-limit-selector";
import { compareMedicationPerDose } from "../../src/clinical/medication/per-dose-comparator";
import { mapMedicationValidationStatus } from "../../src/clinical/medication/status-mapper";
import { resolveRecentVerifiedWeight } from "../../src/clinical/medication/weight-resolver";
import { decimalToCanonicalString, parseExactDecimal } from "../../src/clinical/medication/decimal";
import {
  medicationCodingSystemSchema,
  medicationCountrySchema,
  medicationFormSchema,
  medicationRouteSchema,
  medicationUnitSchema,
  type ApprovedMedicationPackage,
  type MedicationConcept,
  type MedicationDoseRule,
  type MedicationPresentation,
  type MedicationWeightEvidence,
} from "../../src/clinical/medication/types";

const TOOL_ID = "validate_declared_pediatric_dose" as const;
const TOOL_SCHEMA_VERSION = "validate-declared-pediatric-dose.v1" as const;
const MAX_WEIGHT_AGE_HOURS = 720;
const MAX_INGREDIENTS = 8;
const MAX_PEDIATRIC_AGE_DAYS = 18 * 366;
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const SAFE_TEXT = (max: number) => z.string().min(1).max(max).refine((value) => (
  value === value.normalize("NFKC")
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !/[<>`]/u.test(value)
    && !/(?:\b(?:https?|s3|gs|file):\/\/|\b(?:javascript|data):|<\/?(?:script|iframe|object|embed|form|input|button)\b|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function)\s*:|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|(?:ignore|forget|ignora|olvida).{0,48}(?:previous|prior|anteriores?|system|sistema|instruction|instrucciones?))/iu.test(value)
), "safe declared text");
const DECIMAL = z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u).max(64);
const POSITIVE_DECIMAL = DECIMAL.refine((value) => {
  try {
    parseExactDecimal(value, { strictlyPositive: true });
    return true;
  } catch {
    return false;
  }
}, "positive exact decimal");
const INSTANT = z.string().datetime({ offset: true });
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const SOURCE_KIND = z.enum(["identity", "label", "formulary", "algorithm"]);
const COMPARISON_STATUS = z.enum(["within", "outside", "insufficient_data", "requires_professional_review"]);
const OUTCOME = z.enum([
  "within_reference_limits",
  "outside_reference_limits",
  "insufficient_data",
  "requires_professional_review",
]);

const CONCENTRATION_SCHEMA = z.object({
  numerator: POSITIVE_DECIMAL,
  numeratorUnit: medicationUnitSchema,
  denominator: POSITIVE_DECIMAL,
  denominatorUnit: medicationUnitSchema,
}).strict();

const FREQUENCY_SCHEMA = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("interval"),
    everyHours: POSITIVE_DECIMAL.max(8),
  }).strict(),
  z.object({
    kind: z.literal("times_of_day"),
    times: z.array(z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/u)).min(1).max(24),
  }).strict().superRefine((value, refinement) => {
    if (new Set(value.times).size !== value.times.length) refinement.addIssue({ code: "custom", path: ["times"], message: "duplicate_time" });
  }),
  z.object({
    kind: z.literal("as_needed"),
    label: SAFE_TEXT(200),
  }).strict(),
]);

export const VALIDATE_DECLARED_PEDIATRIC_DOSE_INPUT_SCHEMA = z.object({
  product: z.object({
    displayName: SAFE_TEXT(200),
    conceptCode: CODE,
    codingSystem: medicationCodingSystemSchema,
  }).strict(),
  label: z.object({
    form: medicationFormSchema,
    release: z.enum(["immediate", "extended", "delayed", "unknown"]),
    regulatoryIdentifier: SAFE_TEXT(240),
    concentration: CONCENTRATION_SCHEMA,
  }).strict(),
  dose: z.object({
    quantity: POSITIVE_DECIMAL,
    unit: medicationUnitSchema,
  }).strict(),
  route: medicationRouteSchema,
  frequency: FREQUENCY_SCHEMA,
  context: z.object({
    indication: SAFE_TEXT(200).nullable().optional(),
    exclusions: z.array(CODE).max(16).optional(),
    durationDays: z.number().int().min(1).max(366).nullable().optional(),
  }).strict().optional(),
}).strict();
export type ValidateDeclaredPediatricDoseInput = z.infer<typeof VALIDATE_DECLARED_PEDIATRIC_DOSE_INPUT_SCHEMA>;

const SOURCE_SCHEMA = z.object({
  sourceId: CODE,
  sourceVersion: CODE,
  sourceKind: SOURCE_KIND,
  sourceUri: z.string().url().refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "https source"),
  artifactSha256: HASH,
}).strict();
const PACKAGE_SCHEMA = z.object({
  packageId: CODE,
  country: medicationCountrySchema,
  version: CODE,
  effectiveFrom: INSTANT,
  effectiveUntil: INSTANT.nullable(),
  algorithmVersion: CODE,
  vocabularyVersion: CODE,
  status: z.enum(["approved", "active"]),
  approvedBy: SAFE_TEXT(128),
  artifactSha256: HASH,
  sources: z.array(SOURCE_SCHEMA).min(1).max(16),
}).strict();
const INGREDIENT_SCHEMA = z.object({
  ingredientCode: CODE,
  codingSystem: medicationCodingSystemSchema,
  name: SAFE_TEXT(160),
  salt: SAFE_TEXT(160).optional(),
  amount: POSITIVE_DECIMAL.optional(),
  amountUnit: medicationUnitSchema.optional(),
}).strict();
const CONCEPT_SCHEMA = z.object({
  id: CODE,
  country: medicationCountrySchema,
  codingSystem: medicationCodingSystemSchema,
  conceptCode: CODE,
  normalizedName: SAFE_TEXT(240),
  displayName: SAFE_TEXT(200),
  ingredients: z.array(INGREDIENT_SCHEMA).min(1).max(MAX_INGREDIENTS),
}).strict();
const PRESENTATION_SCHEMA = z.object({
  id: CODE,
  conceptId: CODE,
  country: medicationCountrySchema,
  form: medicationFormSchema,
  route: medicationRouteSchema,
  concentration: CONCENTRATION_SCHEMA.nullable(),
  release: z.enum(["immediate", "extended", "delayed", "unknown"]),
  regulatoryIdentifier: SAFE_TEXT(240),
  ingredients: z.array(INGREDIENT_SCHEMA).min(1).max(MAX_INGREDIENTS),
}).strict();
const RULE_SCHEMA = z.object({
  ruleId: CODE,
  packageId: CODE,
  conceptCode: CODE,
  route: medicationRouteSchema,
  indicationCode: CODE.nullable(),
  minAgeDays: z.number().int().nonnegative().max(10_000).nullable(),
  maxAgeDays: z.number().int().nonnegative().max(10_000).nullable(),
  minWeightKg: POSITIVE_DECIMAL.nullable(),
  maxWeightKg: POSITIVE_DECIMAL.nullable(),
  perDoseMin: POSITIVE_DECIMAL.nullable(),
  perDoseMax: POSITIVE_DECIMAL.nullable(),
  perDoseUnit: medicationUnitSchema.nullable(),
  perKgMin: POSITIVE_DECIMAL.nullable(),
  perKgMax: POSITIVE_DECIMAL.nullable(),
  absoluteSingleMax: POSITIVE_DECIMAL.nullable(),
  dailyMax: POSITIVE_DECIMAL.nullable(),
  dailyUnit: medicationUnitSchema.nullable(),
  minimumIntervalHours: POSITIVE_DECIMAL.nullable(),
  exclusions: z.array(CODE).max(32),
}).strict();
const WEIGHT_SCHEMA = z.object({
  measurementId: CODE,
  childId: CODE,
  valueKg: POSITIVE_DECIMAL,
  measuredAt: INSTANT,
  confirmedAt: INSTANT,
  validationStatus: z.literal("confirmed"),
  provenance: z.enum(["professional", "guardian", "import", "document"]),
}).strict();
const AGE_SCHEMA = z.object({
  ageDays: z.number().int().nonnegative().max(MAX_PEDIATRIC_AGE_DAYS),
  basis: z.literal("chronological"),
  referenceAt: INSTANT,
  observedAt: INSTANT,
  timeZone: z.string().min(1).max(64),
  evidenceVersion: CODE,
  calculationVersion: CODE,
}).strict();

type PackageResolution =
  | Readonly<{ status: "resolved"; package: ApprovedMedicationPackage }>
  | Readonly<{ status: "unavailable"; reason: string }>;

export type MedicationAgeEvidence = z.infer<typeof AGE_SCHEMA>;
export type MedicationAgePort = Readonly<{
  getAge: (request: Readonly<{ scope: AuthorizedChildScope; cutoffAt: string; signal: AbortSignal }>) => Promise<MedicationAgeEvidence | null>;
}>;
export type MedicationConceptPort = Readonly<{
  resolve: (request: Readonly<{
    scope: AuthorizedChildScope;
    package: ApprovedMedicationPackage;
    country: "CO" | "US";
    codingSystem: ValidateDeclaredPediatricDoseInput["product"]["codingSystem"];
    conceptCode: string;
    name: string;
    signal: AbortSignal;
  }>) => Promise<MedicationConceptResolution>;
}>;
export type MedicationPresentationPort = Readonly<{
  resolve: (request: Readonly<{
    scope: AuthorizedChildScope;
    package: ApprovedMedicationPackage;
    concept: MedicationConcept;
    country: "CO" | "US";
    form: ValidateDeclaredPediatricDoseInput["label"]["form"];
    route: ValidateDeclaredPediatricDoseInput["route"];
    release: ValidateDeclaredPediatricDoseInput["label"]["release"];
    concentration: ValidateDeclaredPediatricDoseInput["label"]["concentration"];
    regulatoryIdentifier: string;
    signal: AbortSignal;
  }>) => Promise<MedicationPresentationResolution>;
}>;
export type MedicationFormularyPort = Readonly<{
  resolve: (request: Readonly<{
    scope: AuthorizedChildScope;
    country: "CO" | "US";
    at: string;
    locale: "es-CO" | "en-US";
    signal: AbortSignal;
  }>) => Promise<PackageResolution>;
}>;
export type MedicationWeightPort = Readonly<{
  list: (request: Readonly<{
    scope: AuthorizedChildScope;
    cutoffAt: string;
    signal: AbortSignal;
  }>) => Promise<readonly MedicationWeightEvidence[]>;
}>;
export type MedicationRulePort = Readonly<{
  resolve: (request: Readonly<{
    scope: AuthorizedChildScope;
    package: ApprovedMedicationPackage;
    concept: MedicationConcept;
    presentation: MedicationPresentation;
    ageDays: number;
    weightKg: string | null;
    indicationCode: string | null;
    exclusionCodes: readonly string[];
    durationDays: number | null;
    signal: AbortSignal;
  }>) => Promise<MedicationDoseRuleResolution>;
}>;

type DoseValidationServices = Readonly<Record<string, object> & {
  medicationAge: MedicationAgePort;
  medicationConcepts: MedicationConceptPort;
  medicationPresentations: MedicationPresentationPort;
  medicationFormularies: MedicationFormularyPort;
  medicationWeights: MedicationWeightPort;
  medicationRules: MedicationRulePort;
}>;

const RESULT_SOURCE = z.object({
  label: SAFE_TEXT(256),
  citationHandle: z.string().regex(/^citation:v1:[a-f0-9]{64}$/u),
}).strict();
const RESOLVED_PRODUCT = z.object({
  displayName: SAFE_TEXT(200),
  conceptCode: CODE,
  codingSystem: medicationCodingSystemSchema,
}).strict();
const RESOLVED_PRESENTATION = z.object({
  form: medicationFormSchema,
  route: medicationRouteSchema,
  release: z.enum(["immediate", "extended", "delayed", "unknown"]),
  regulatoryIdentifier: SAFE_TEXT(240),
  concentration: CONCENTRATION_SCHEMA,
}).strict();
const RESOLVED_PACKAGE = z.object({
  country: medicationCountrySchema,
  version: CODE,
  algorithmVersion: CODE,
  vocabularyVersion: CODE,
  effectiveFrom: INSTANT,
  effectiveUntil: INSTANT.nullable(),
}).strict();
const RESOLVED_RULE = z.object({
  ruleLabel: CODE,
  route: medicationRouteSchema,
  indicationCode: CODE.nullable(),
  minWeightKg: POSITIVE_DECIMAL.nullable(),
  maxWeightKg: POSITIVE_DECIMAL.nullable(),
  perDoseMin: POSITIVE_DECIMAL.nullable(),
  perDoseMax: POSITIVE_DECIMAL.nullable(),
  perDoseUnit: medicationUnitSchema.nullable(),
  absoluteSingleMax: POSITIVE_DECIMAL.nullable(),
  dailyMax: POSITIVE_DECIMAL.nullable(),
  dailyUnit: medicationUnitSchema.nullable(),
  minimumIntervalHours: POSITIVE_DECIMAL.nullable(),
}).strict();
const RESOLVED_WEIGHT = z.object({
  valueKg: POSITIVE_DECIMAL,
  measuredAt: INSTANT,
  confirmedAt: INSTANT,
}).strict();
const RESOLVED_AGE = AGE_SCHEMA;
const CONVERSION_TRACE = z.object({
  ingredientLabel: CODE,
  amount: POSITIVE_DECIMAL,
  unit: medicationUnitSchema,
}).strict();
const COMPARISON_TRACE = z.object({
  ingredientLabel: CODE,
  status: COMPARISON_STATUS,
  amount: DECIMAL.nullable(),
  unit: medicationUnitSchema.nullable(),
  referenceLower: POSITIVE_DECIMAL.nullable(),
  referenceUpper: POSITIVE_DECIMAL.nullable(),
  reasonCodes: z.array(CODE).min(1).max(8),
}).strict();
const DAILY_TRACE = z.object({
  ingredientLabel: CODE,
  status: COMPARISON_STATUS,
  dailyAmount: DECIMAL.nullable(),
  unit: medicationUnitSchema.nullable(),
  expectedDoses: DECIMAL.nullable(),
  reasonCodes: z.array(CODE).min(1).max(8),
}).strict();
const TRUSTED_DATA_SCHEMA = z.object({
  outcome: OUTCOME,
  declared: VALIDATE_DECLARED_PEDIATRIC_DOSE_INPUT_SCHEMA,
  resolved: z.object({
    product: RESOLVED_PRODUCT.nullable(),
    presentation: RESOLVED_PRESENTATION.nullable(),
    package: RESOLVED_PACKAGE,
    rule: RESOLVED_RULE.nullable(),
    age: RESOLVED_AGE.nullable(),
    weight: RESOLVED_WEIGHT.nullable(),
    sources: z.array(RESULT_SOURCE).min(1).max(16),
  }).strict(),
  computed: z.object({
    conversions: z.array(CONVERSION_TRACE).max(MAX_INGREDIENTS),
    perDose: z.array(COMPARISON_TRACE).max(MAX_INGREDIENTS),
    daily: z.array(DAILY_TRACE).max(MAX_INGREDIENTS),
  }).strict(),
  missingReasonCodes: z.array(CODE).max(12),
  reviewReasonCodes: z.array(CODE).max(12),
  reasonCodes: z.array(CODE).min(1).max(12),
}).strict();

export const VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(`${TOOL_ID}.trusted.v1`),
  data: TRUSTED_DATA_SCHEMA,
}).strict();
export type ValidateDeclaredPediatricDoseTrustedResult = Readonly<z.infer<typeof VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA>>;

export const VALIDATE_DECLARED_PEDIATRIC_DOSE_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.enum(["no_effect"]),
  result: VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: z.null(),
  requestSha256: HASH,
  approvalSha256: z.null(),
}).strict();
type DoseValidationExecution = z.infer<typeof VALIDATE_DECLARED_PEDIATRIC_DOSE_OUTPUT_SCHEMA>;
type DoseValidationModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "read_only" as const,
  operation: "no_effect",
  inputSchema: VALIDATE_DECLARED_PEDIATRIC_DOSE_INPUT_SCHEMA,
  resultSchema: VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA,
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

function validDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function codes(values: readonly string[], fallback: string): readonly string[] {
  const unique = [...new Set(values)].sort(compareStableText);
  if (unique.length === 0) return [fallback];
  if (unique.some((value) => !CODE.safeParse(value).success)) return safeFailure("RULE_UNAVAILABLE");
  if (unique.length > 12) return safeFailure("RULE_UNAVAILABLE");
  return unique;
}

function resolutionStatus(value: unknown): value is "resolved" | "not_found" | "ambiguous" | "review_required" {
  return value === "resolved" || value === "not_found" || value === "ambiguous" || value === "review_required";
}

function outcomeFallback(outcome: z.infer<typeof OUTCOME>): string {
  if (outcome === "within_reference_limits") return "DECLARED_DOSE_WITHIN_REFERENCE";
  if (outcome === "outside_reference_limits") return "DECLARED_DOSE_OUTSIDE_REFERENCE";
  if (outcome === "insufficient_data") return "VALIDATION_INCOMPLETE";
  return "PROFESSIONAL_REVIEW_REQUIRED";
}

function resultOutcome(status: "resolved" | "not_found" | "ambiguous" | "review_required"): "insufficient_data" | "requires_professional_review" {
  return status === "not_found" ? "insufficient_data" : "requires_professional_review";
}

function sourceProjection(pack: ApprovedMedicationPackage): z.infer<typeof RESULT_SOURCE>[] {
  if (pack.sources.length === 0) return safeFailure("RULE_UNAVAILABLE");
  const sources = pack.sources.map((source) => {
    const handle = createCitationHandle(TOOL_ID, {
      sourceDigest: source.artifactSha256,
      referenceCode: source.sourceId,
    });
    const label = `${source.sourceKind}:${source.sourceId}@${source.sourceVersion}`;
    if (!SAFE_TEXT(256).safeParse(label).success) return safeFailure("RULE_UNAVAILABLE");
    return Object.freeze({ label, citationHandle: handle });
  });
  sources.sort((left, right) => compareStableText(left.label, right.label) || compareStableText(left.citationHandle, right.citationHandle));
  return sources;
}

function packageProjection(pack: ApprovedMedicationPackage): z.infer<typeof RESOLVED_PACKAGE> {
  const parsed = PACKAGE_SCHEMA.safeParse(pack);
  if (!parsed.success || parsed.data.status !== "active") return safeFailure("RULE_UNAVAILABLE");
  return {
    country: parsed.data.country,
    version: parsed.data.version,
    algorithmVersion: parsed.data.algorithmVersion,
    vocabularyVersion: parsed.data.vocabularyVersion,
    effectiveFrom: parsed.data.effectiveFrom,
    effectiveUntil: parsed.data.effectiveUntil,
  };
}

function productProjection(value: MedicationConcept): z.infer<typeof RESOLVED_PRODUCT> {
  const parsed = CONCEPT_SCHEMA.safeParse(value);
  if (!parsed.success) return safeFailure("RULE_UNAVAILABLE");
  return {
    displayName: parsed.data.displayName,
    conceptCode: parsed.data.conceptCode,
    codingSystem: parsed.data.codingSystem,
  };
}

function presentationProjection(value: MedicationPresentation): z.infer<typeof RESOLVED_PRESENTATION> {
  const parsed = PRESENTATION_SCHEMA.safeParse(value);
  if (!parsed.success || parsed.data.concentration === null) return safeFailure("RULE_UNAVAILABLE");
  return {
    form: parsed.data.form,
    route: parsed.data.route,
    release: parsed.data.release,
    regulatoryIdentifier: parsed.data.regulatoryIdentifier,
    concentration: parsed.data.concentration,
  };
}

function ruleProjection(value: MedicationDoseRule): z.infer<typeof RESOLVED_RULE> {
  const parsed = RULE_SCHEMA.safeParse(value);
  if (!parsed.success) return safeFailure("RULE_UNAVAILABLE");
  return {
    ruleLabel: parsed.data.ruleId,
    route: parsed.data.route,
    indicationCode: parsed.data.indicationCode,
    minWeightKg: parsed.data.minWeightKg,
    maxWeightKg: parsed.data.maxWeightKg,
    perDoseMin: parsed.data.perDoseMin,
    perDoseMax: parsed.data.perDoseMax,
    perDoseUnit: parsed.data.perDoseUnit,
    absoluteSingleMax: parsed.data.absoluteSingleMax,
    dailyMax: parsed.data.dailyMax,
    dailyUnit: parsed.data.dailyUnit,
    minimumIntervalHours: parsed.data.minimumIntervalHours,
  };
}

function weightProjection(value: MedicationWeightEvidence | null): z.infer<typeof RESOLVED_WEIGHT> | null {
  if (value === null) return null;
  const parsed = WEIGHT_SCHEMA.safeParse(value);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return {
    valueKg: parsed.data.valueKg,
    measuredAt: parsed.data.measuredAt,
    confirmedAt: parsed.data.confirmedAt,
  };
}

function ageProjection(value: MedicationAgeEvidence | null): z.infer<typeof RESOLVED_AGE> | null {
  if (value === null) return null;
  const parsed = AGE_SCHEMA.safeParse(value);
  if (!parsed.success) return safeFailure("RULE_UNAVAILABLE");
  return parsed.data;
}

function emptyComputed(): z.infer<typeof TRUSTED_DATA_SCHEMA>["computed"] {
  return { conversions: [], perDose: [], daily: [] };
}

function reasonBuckets(outcome: z.infer<typeof OUTCOME>, reasonCodes: readonly string[]): Readonly<{
  missing: readonly string[];
  review: readonly string[];
}> {
  const exact = codes(
    reasonCodes,
    outcomeFallback(outcome),
  );
  const missing = outcome === "insufficient_data" ? exact : [];
  const review = outcome === "requires_professional_review" ? exact : [];
  return Object.freeze({ missing, review });
}

function buildTrustedResult(input: ValidateDeclaredPediatricDoseInput, pack: ApprovedMedicationPackage, options: Readonly<{
  outcome: z.infer<typeof OUTCOME>;
  product: MedicationConcept | null;
  presentation: MedicationPresentation | null;
  rule: MedicationDoseRule | null;
  age: MedicationAgeEvidence | null;
  weight: MedicationWeightEvidence | null;
  computed: z.infer<typeof TRUSTED_DATA_SCHEMA>["computed"];
  reasonCodes: readonly string[];
}>): ValidateDeclaredPediatricDoseTrustedResult {
  const parsed = VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA.safeParse({
    kind: "trusted_tool_result",
    toolId: TOOL_ID,
    schemaVersion: `${TOOL_ID}.trusted.v1`,
    data: {
      outcome: options.outcome,
      declared: input,
      resolved: {
        product: options.product ? productProjection(options.product) : null,
        presentation: options.presentation ? presentationProjection(options.presentation) : null,
        package: packageProjection(pack),
        rule: options.rule ? ruleProjection(options.rule) : null,
        age: ageProjection(options.age),
        weight: weightProjection(options.weight),
        sources: sourceProjection(pack),
      },
      computed: options.computed,
      ...(() => {
        const reasonCodes = codes(options.reasonCodes, outcomeFallback(options.outcome));
        const buckets = reasonBuckets(options.outcome, reasonCodes);
        return {
          missingReasonCodes: [...buckets.missing],
          reviewReasonCodes: [...buckets.review],
          reasonCodes: [...reasonCodes],
        };
      })(),
    },
  });
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return parsed.data;
}

function projectDeclaredDoseForModel(raw: unknown): DoseValidationModelResult {
  const parsed = VALIDATE_DECLARED_PEDIATRIC_DOSE_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  const citations = parsed.data.data.resolved.sources.map((source) => source.citationHandle);
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: `${TOOL_ID}.model.v1`,
    data: {
      outcome: parsed.data.data.outcome,
      explanationCodes: parsed.data.data.reasonCodes.slice(0, 12),
      citationHandles: citations,
    },
  });
}

function readPorts(context: TrustedToolContext<DoseValidationServices>): DoseValidationServices {
  try {
    const services = getTrustedToolServices(context);
    const required = [
      services.medicationAge,
      services.medicationConcepts,
      services.medicationPresentations,
      services.medicationFormularies,
      services.medicationWeights,
      services.medicationRules,
    ];
    if (required.some((port) => !port || typeof port !== "object")) return safeFailure("PERSISTENCE_UNAVAILABLE");
    return services;
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
}

async function callPort<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
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

function verifyPackage(pack: ApprovedMedicationPackage, scope: AuthorizedChildScope, cutoffAt: string): void {
  const parsed = PACKAGE_SCHEMA.safeParse(pack);
  if (!parsed.success || parsed.data.country !== scope.countryOfCare) return safeFailure("RULE_UNAVAILABLE");
  const at = validDate(cutoffAt);
  if (!at) return safeFailure("RULE_UNAVAILABLE");
  const resolution = resolveMedicationFormulary({
    country: scope.countryOfCare,
    at: cutoffAt,
    algorithmVersion: parsed.data.algorithmVersion,
    vocabularyVersion: parsed.data.vocabularyVersion,
    requiredSourceIds: parsed.data.sources.map((source) => source.sourceId),
    requiredArtifactSha256: parsed.data.artifactSha256,
  }, [parsed.data]);
  if (resolution.status !== "resolved" || Date.parse(parsed.data.effectiveFrom) > at.getTime()) return safeFailure("RULE_UNAVAILABLE");
}

function verifyConcept(value: MedicationConcept, input: ValidateDeclaredPediatricDoseInput, scope: AuthorizedChildScope): void {
  const parsed = CONCEPT_SCHEMA.safeParse(value);
  if (!parsed.success
    || parsed.data.country !== scope.countryOfCare
    || parsed.data.codingSystem !== input.product.codingSystem
    || parsed.data.conceptCode !== input.product.conceptCode
    || parsed.data.displayName !== input.product.displayName) return safeFailure("RULE_UNAVAILABLE");
}

function verifyPresentation(value: MedicationPresentation, input: ValidateDeclaredPediatricDoseInput, concept: MedicationConcept, scope: AuthorizedChildScope): void {
  const parsed = PRESENTATION_SCHEMA.safeParse(value);
  const expected = input.label;
  const actualConcentration = parsed.success ? parsed.data.concentration : null;
  let concentrationMatches = false;
  try {
    concentrationMatches = actualConcentration !== null
      && decimalToCanonicalString(parseExactDecimal(actualConcentration.numerator)) === decimalToCanonicalString(parseExactDecimal(expected.concentration.numerator))
      && actualConcentration.numeratorUnit === expected.concentration.numeratorUnit
      && decimalToCanonicalString(parseExactDecimal(actualConcentration.denominator)) === decimalToCanonicalString(parseExactDecimal(expected.concentration.denominator))
      && actualConcentration.denominatorUnit === expected.concentration.denominatorUnit;
  } catch {
    concentrationMatches = false;
  }
  const conceptIngredients = CONCEPT_SCHEMA.safeParse(concept);
  const ingredientIdentity = (ingredient: z.infer<typeof INGREDIENT_SCHEMA>) =>
    `${ingredient.ingredientCode}\u0000${ingredient.codingSystem}\u0000${ingredient.name}\u0000${ingredient.salt ?? ""}`;
  const conceptVector = conceptIngredients.success
    ? conceptIngredients.data.ingredients.map(ingredientIdentity).sort(compareStableText)
    : [];
  const presentationVector = parsed.success
    ? parsed.data.ingredients.map(ingredientIdentity).sort(compareStableText)
    : [];
  if (!parsed.success
    || !conceptIngredients.success
    || parsed.data.country !== scope.countryOfCare
    || parsed.data.conceptId !== concept.id
    || parsed.data.form !== expected.form
    || parsed.data.route !== input.route
    || parsed.data.release !== expected.release
    || parsed.data.regulatoryIdentifier !== expected.regulatoryIdentifier
    || conceptVector.length !== presentationVector.length
    || conceptVector.some((identity, index) => identity !== presentationVector[index])
    || !concentrationMatches) return safeFailure("RULE_UNAVAILABLE");
}

function verifyAge(value: MedicationAgeEvidence | null, cutoffAt: string, scope: AuthorizedChildScope): value is MedicationAgeEvidence {
  if (value === null) return false;
  const parsed = AGE_SCHEMA.safeParse(value);
  if (!parsed.success
    || parsed.data.referenceAt !== cutoffAt
    || parsed.data.timeZone !== scope.timezone) return safeFailure("RULE_UNAVAILABLE");
  const observed = validDate(parsed.data.observedAt);
  const cutoff = validDate(cutoffAt);
  if (!observed || !cutoff || observed.getTime() > cutoff.getTime()) return safeFailure("RULE_UNAVAILABLE");
  return true;
}

function decimalWithin(value: string, min: string | null, max: string | null): boolean {
  try {
    const actual = parseExactDecimal(value, { strictlyPositive: true }).value;
    return (min === null || actual.gte(parseExactDecimal(min, { strictlyPositive: true }).value))
      && (max === null || actual.lte(parseExactDecimal(max, { strictlyPositive: true }).value));
  } catch {
    return false;
  }
}

function orderedDecimals(min: string | null, max: string | null): boolean {
  if (min === null || max === null) return true;
  try {
    return parseExactDecimal(min, { strictlyPositive: true }).value.lte(parseExactDecimal(max, { strictlyPositive: true }).value);
  } catch {
    return false;
  }
}

function verifyRule(
  value: MedicationDoseRule,
  pack: ApprovedMedicationPackage,
  concept: MedicationConcept,
  presentation: MedicationPresentation,
  input: ValidateDeclaredPediatricDoseInput,
  ageDays: number,
  weight: MedicationWeightEvidence | null,
): void {
  const parsed = RULE_SCHEMA.safeParse(value);
  if (!parsed.success
    || parsed.data.packageId !== pack.packageId
    || parsed.data.conceptCode !== concept.conceptCode
    || parsed.data.route !== presentation.route
    || (parsed.data.minAgeDays !== null && parsed.data.maxAgeDays !== null && parsed.data.minAgeDays > parsed.data.maxAgeDays)
    || (parsed.data.minAgeDays !== null && ageDays < parsed.data.minAgeDays)
    || (parsed.data.maxAgeDays !== null && ageDays > parsed.data.maxAgeDays)
    || !orderedDecimals(parsed.data.minWeightKg, parsed.data.maxWeightKg)
    || ((parsed.data.minWeightKg !== null || parsed.data.maxWeightKg !== null)
      && weight !== null
      && !decimalWithin(weight.valueKg, parsed.data.minWeightKg, parsed.data.maxWeightKg))
    || !orderedDecimals(parsed.data.perDoseMin, parsed.data.perDoseMax)
    || !orderedDecimals(parsed.data.perKgMin, parsed.data.perKgMax)
    || (parsed.data.indicationCode !== null && parsed.data.indicationCode !== (input.context?.indication ?? null))
    || (input.context?.exclusions ?? []).some((code) => parsed.data.exclusions.includes(code))) {
    return safeFailure("RULE_UNAVAILABLE");
  }
}

function resultForResolution(input: ValidateDeclaredPediatricDoseInput, pack: ApprovedMedicationPackage, product: MedicationConcept | null, presentation: MedicationPresentation | null, age: MedicationAgeEvidence | null, weight: MedicationWeightEvidence | null, resolution: Readonly<{ outcome: "insufficient_data" | "requires_professional_review"; reasonCodes: readonly string[] }>): ValidateDeclaredPediatricDoseTrustedResult {
  return buildTrustedResult(input, pack, {
    outcome: resolution.outcome,
    product,
    presentation,
    rule: null,
    age,
    weight,
    computed: emptyComputed(),
    reasonCodes: resolution.reasonCodes,
  });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, input) => {
    const context = runtime.trustedContext as TrustedToolContext<DoseValidationServices>;
    const services = readPorts(context);
    const signal = getTrustedToolAbortSignal(context);
    const clock = services.toolIdempotency as Readonly<{ now(): Date }>;
    let cutoff: Date;
    try {
      cutoff = clock.now();
    } catch {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE");
    const cutoffAt = cutoff.toISOString();
    requireActiveChildScope(context, cutoff);

    const packageResolution = await callPort(signal, () => services.medicationFormularies.resolve(Object.freeze({
      scope: runtime.scope,
      country: runtime.scope.countryOfCare,
      at: cutoffAt,
      locale: getTrustedToolLocale(context),
      signal,
    })));
    if (!packageResolution || packageResolution.status !== "resolved") {
      if (packageResolution?.reason === "CANCELLED" || signal.aborted) return safeFailure("CANCELLED");
      return safeFailure("RULE_UNAVAILABLE");
    }
    const pack = packageResolution.package;
    verifyPackage(pack, runtime.scope, cutoffAt);

    const conceptResolution = await callPort(signal, () => services.medicationConcepts.resolve(Object.freeze({
      scope: runtime.scope,
      package: pack,
      country: runtime.scope.countryOfCare,
      codingSystem: input.product.codingSystem,
      conceptCode: input.product.conceptCode,
      name: input.product.displayName,
      signal,
    })));
    const conceptParsed = z.object({
      status: z.enum(["resolved", "not_found", "ambiguous", "review_required"]),
      concept: CONCEPT_SCHEMA.nullable(),
      explanationCodes: z.array(CODE).max(12),
    }).strict().safeParse(conceptResolution);
    if (!conceptParsed.success || !resolutionStatus(conceptParsed.data.status)) return safeFailure("RULE_UNAVAILABLE");
    if (conceptParsed.data.status !== "resolved" || conceptParsed.data.concept === null) {
      return {
        status: "no_effect" as const,
        result: resultForResolution(input, pack, null, null, null, null, {
          outcome: resultOutcome(conceptParsed.data.status),
          reasonCodes: conceptParsed.data.explanationCodes,
        }),
      };
    }
    const conceptValue = conceptParsed.data.concept as unknown as MedicationConcept;
    verifyConcept(conceptValue, input, runtime.scope);

    const presentationResolution = await callPort(signal, () => services.medicationPresentations.resolve(Object.freeze({
      scope: runtime.scope,
      package: pack,
      concept: conceptValue,
      country: runtime.scope.countryOfCare,
      form: input.label.form,
      route: input.route,
      release: input.label.release,
      concentration: input.label.concentration,
      regulatoryIdentifier: input.label.regulatoryIdentifier,
      signal,
    })));
    const presentationParsed = z.object({
      status: z.enum(["resolved", "not_found", "ambiguous", "review_required"]),
      presentation: PRESENTATION_SCHEMA.nullable(),
      explanationCodes: z.array(CODE).max(12),
    }).strict().safeParse(presentationResolution);
    if (!presentationParsed.success || !resolutionStatus(presentationParsed.data.status)) return safeFailure("RULE_UNAVAILABLE");
    if (presentationParsed.data.status !== "resolved" || presentationParsed.data.presentation === null) {
      return {
        status: "no_effect" as const,
        result: resultForResolution(input, pack, conceptValue, null, null, null, {
          outcome: resultOutcome(presentationParsed.data.status),
          reasonCodes: presentationParsed.data.explanationCodes,
        }),
      };
    }
    const presentationValue = presentationParsed.data.presentation as unknown as MedicationPresentation;
    verifyPresentation(presentationValue, input, conceptValue, runtime.scope);

    if (presentationValue.ingredients.length > 1) {
      return {
        status: "no_effect" as const,
        result: resultForResolution(input, pack, conceptValue, presentationValue, null, null, {
          outcome: "requires_professional_review",
          reasonCodes: ["COMBINATION_REFERENCE_COVERAGE_UNAVAILABLE"],
        }),
      };
    }

    const ageRaw = await callPort(signal, () => services.medicationAge.getAge(Object.freeze({ scope: runtime.scope, cutoffAt, signal })));
    const ageValid = verifyAge(ageRaw, cutoffAt, runtime.scope);
    const age = ageValid ? ageRaw : null;
    if (!age) {
      return {
        status: "no_effect" as const,
        result: resultForResolution(input, pack, conceptValue, presentationValue, null, null, {
          outcome: "insufficient_data",
          reasonCodes: ["AGE_EVIDENCE_UNAVAILABLE"],
        }),
      };
    }

    const rawWeights = await callPort(signal, () => services.medicationWeights.list(Object.freeze({ scope: runtime.scope, cutoffAt, signal })));
    if (!Array.isArray(rawWeights) || rawWeights.length > 64) return safeFailure("PERSISTENCE_UNAVAILABLE");
    const parsedWeights = rawWeights.map((value) => WEIGHT_SCHEMA.safeParse(value));
    if (parsedWeights.some((value) => !value.success)) return safeFailure("PERSISTENCE_UNAVAILABLE");
    const weightResolution = resolveRecentVerifiedWeight(runtime.scope.childId, cutoffAt, parsedWeights.map((value) => value.data as MedicationWeightEvidence), { maxAgeHours: MAX_WEIGHT_AGE_HOURS });
    const verifiedWeight = weightResolution.status === "resolved" ? weightResolution.weight : null;
    const indication = input.context?.indication ?? null;
    const exclusions = input.context?.exclusions ?? [];
    if (indication !== null) {
      return {
        status: "no_effect" as const,
        result: resultForResolution(input, pack, conceptValue, presentationValue, age, verifiedWeight, {
          outcome: "requires_professional_review",
          reasonCodes: ["DECLARED_INDICATION_REQUIRES_REVIEW"],
        }),
      };
    }
    if (input.context?.durationDays !== undefined && input.context.durationDays !== null) {
      return {
        status: "no_effect" as const,
        result: resultForResolution(input, pack, conceptValue, presentationValue, age, verifiedWeight, {
          outcome: "requires_professional_review",
          reasonCodes: ["DURATION_CONTEXT_REQUIRES_REVIEW"],
        }),
      };
    }
    const ruleResolution = await callPort(signal, () => services.medicationRules.resolve(Object.freeze({
      scope: runtime.scope,
      package: pack,
      concept: conceptValue,
      presentation: presentationValue,
      ageDays: age.ageDays,
      weightKg: verifiedWeight?.valueKg ?? null,
      indicationCode: indication,
      exclusionCodes: exclusions,
      durationDays: input.context?.durationDays ?? null,
      signal,
    })));
    const ruleParsed = z.object({
      status: z.enum(["resolved", "insufficient_data", "requires_professional_review"]),
      rule: RULE_SCHEMA.nullable(),
      explanationCodes: z.array(CODE).max(12),
    }).strict().safeParse(ruleResolution);
    if (!ruleParsed.success) return safeFailure("RULE_UNAVAILABLE");
    if (ruleParsed.data.status !== "resolved" || ruleParsed.data.rule === null) {
      const outcome = ruleParsed.data.status === "requires_professional_review" ? "requires_professional_review" as const : "insufficient_data" as const;
      return {
        status: "no_effect" as const,
        result: resultForResolution(input, pack, conceptValue, presentationValue, age, verifiedWeight, {
          outcome,
          reasonCodes: [...weightResolution.explanationCodes, ...ruleParsed.data.explanationCodes],
        }),
      };
    }
    const ruleValue = ruleParsed.data.rule as unknown as MedicationDoseRule;
    verifyRule(ruleValue, pack, conceptValue, presentationValue, input, age.ageDays, verifiedWeight);
    if (!verifiedWeight) {
      return {
        status: "no_effect" as const,
        result: resultForResolution(input, pack, conceptValue, presentationValue, age, null, {
          outcome: "insufficient_data",
          reasonCodes: [...weightResolution.explanationCodes, "WEIGHT_REQUIRED_FOR_VALIDATION"],
        }),
      };
    }

    const conversion = convertMedicationConcentration({ presentation: presentationValue, quantity: input.dose.quantity, quantityUnit: input.dose.unit });
    const conversionReasons = [...conversion.explanationCodes];
    const ingredients = conversion.status === "converted"
      ? [...conversion.ingredients].sort((left, right) => compareStableText(left.ingredientCode, right.ingredientCode))
      : [];
    const conversions = conversion.status === "converted"
      ? ingredients.slice(0, MAX_INGREDIENTS).map((ingredient) => ({ ingredientLabel: ingredient.ingredientCode, amount: ingredient.amount, unit: ingredient.unit }))
      : [];
    if (conversion.status !== "converted") {
      const outcome = conversion.status === "requires_professional_review" ? "requires_professional_review" as const : "insufficient_data" as const;
      return {
        status: "no_effect" as const,
        result: buildTrustedResult(input, pack, {
          outcome,
          product: conceptValue,
          presentation: presentationValue,
          rule: ruleValue,
          age,
          weight: verifiedWeight,
          computed: { conversions, perDose: [], daily: [] },
          reasonCodes: [...weightResolution.explanationCodes, ...conversionReasons],
        }),
      };
    }
    if (conversion.ingredients.length === 0 || conversion.ingredients.length > MAX_INGREDIENTS) return safeFailure("RULE_UNAVAILABLE");
    const perDose = ingredients.map((ingredient) => {
      const comparison = compareMedicationPerDose({ amount: ingredient.amount, unit: ingredient.unit, weightKg: verifiedWeight?.valueKg ?? null, rule: ruleValue });
      return {
        ingredientLabel: ingredient.ingredientCode,
        status: comparison.status,
        amount: comparison.amount,
        unit: comparison.amount === null ? null : ruleValue.perDoseUnit,
        referenceLower: comparison.lower,
        referenceUpper: comparison.upper,
        reasonCodes: [...codes(comparison.explanationCodes, "PER_DOSE_COMPARISON_UNAVAILABLE")],
      };
    });
    const daily = ingredients.map((ingredient) => {
      const comparison = compareMedicationDailyExposure({ perDoseAmount: ingredient.amount, perDoseUnit: ingredient.unit, frequency: input.frequency, rule: ruleValue });
      return {
        ingredientLabel: ingredient.ingredientCode,
        status: comparison.status,
        dailyAmount: comparison.dailyAmount,
        unit: comparison.dailyAmount === null ? null : ruleValue.dailyUnit,
        expectedDoses: comparison.expectedDoses,
        reasonCodes: [...codes(comparison.explanationCodes, "DAILY_COMPARISON_UNAVAILABLE")],
      };
    });
    const professionalReview = perDose.some((value) => value.status === "requires_professional_review") || daily.some((value) => value.status === "requires_professional_review");
    const insufficient = perDose.some((value) => value.status === "insufficient_data") || daily.some((value) => value.status === "insufficient_data");
    const outside = perDose.some((value) => value.status === "outside") || daily.some((value) => value.status === "outside");
    const within = !professionalReview && !insufficient && !outside
      && perDose.length > 0 && perDose.every((value) => value.status === "within")
      && daily.length > 0 && daily.every((value) => value.status === "within");
    const outcome = mapMedicationValidationStatus({ within, outside, insufficient, professionalReview });
    const reasonCodes = [
      ...weightResolution.explanationCodes,
      ...ruleParsed.data.explanationCodes,
      ...conversionReasons,
      ...perDose.flatMap((value) => value.reasonCodes),
      ...daily.flatMap((value) => value.reasonCodes),
    ];
    return {
      status: "no_effect" as const,
      result: buildTrustedResult(input, pack, {
        outcome,
        product: conceptValue,
        presentation: presentationValue,
        rule: ruleValue,
        age,
        weight: verifiedWeight,
        computed: { conversions, perDose, daily },
        reasonCodes,
      }),
    };
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (context: TrustedToolContext, input: ValidateDeclaredPediatricDoseInput) => {
    const result = await invokeIdempotently(context, input, null);
    if ("allowed" in result) return safeFailure("CONFIRMATION_INVALID");
    return result;
  },
);

export async function executeValidateDeclaredPediatricDose(
  context: TrustedToolContext,
  input: ValidateDeclaredPediatricDoseInput,
): Promise<DoseValidationExecution> {
  try {
    const raw = await invokeWithAudit(context, input);
    if (!VALIDATE_DECLARED_PEDIATRIC_DOSE_OUTPUT_SCHEMA.safeParse(raw).success) return safeFailure("PERSISTENCE_UNAVAILABLE");
    return raw as DoseValidationExecution;
  } catch (error) {
    throw mapToolError(error, { effectState: "none" });
  }
}

export default defineTool({
  description: "Compara una dosis pediátrica declarada con una referencia exacta aprobada; no prescribe, no calcula una dosis alternativa y no autoriza administrar.",
  inputSchema: VALIDATE_DECLARED_PEDIATRIC_DOSE_INPUT_SCHEMA,
  outputSchema: VALIDATE_DECLARED_PEDIATRIC_DOSE_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeValidateDeclaredPediatricDose(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectDeclaredDoseForModel(output.result));
  },
});
