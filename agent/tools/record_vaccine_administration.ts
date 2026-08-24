import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { authorizeToolInvocation } from "../lib/runtime/tool-permission-policy";
import { isSafeToolError, mapToolError, type ToolEffectState } from "../lib/runtime/safe-tool-errors";
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
  getTrustedToolServices,
  requireActiveChildScope,
  type ToolServicePorts,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import {
  buildAdministrationConfirmationSnapshot,
  type ConfirmationSnapshot,
} from "../../src/clinical/immunization/evidence";
import {
  validateAdministration,
  type ConfirmedAdministrationCandidate,
} from "../../src/clinical/immunization/validation";
import type {
  AdministrationDraft,
  CalendarDate,
  VaccineCatalog,
} from "../../src/clinical/immunization/types";

const TOOL_ID = "record_vaccine_administration" as const;
const TOOL_SCHEMA_VERSION = "record-vaccine-administration.v1" as const;
const TRUSTED_SCHEMA_VERSION = "record_vaccine_administration.trusted.v1" as const;
const MODEL_SCHEMA_VERSION = "record_vaccine_administration.model.v1" as const;
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "calendar_date");
const COUNTRY = z.enum(["CO", "US"]);
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
  .refine((value) => !/^[A-Za-z0-9+/]{48,}={0,2}$/u.test(value), "bounded code");
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

function safeText(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !/[\u0000-\u001f\u007f\p{Cf}\p{Cs}]/u.test(value)
    && !/[<>`]/u.test(value)
    && !/(?:\b(?:https?|s3|gs|file|javascript|data):\/\/|\b(?:system|assistant|developer|tool|function)\s*[:=]|(?:ignore|forget|ignora|olvida|override|bypass).{0,64}(?:previous|prior|system|instruction|instrucci[oó]n))/iu.test(value);
}

const SAFE_TEXT = z.string().min(1).max(160).refine(safeText, "safe text");
const LOCATION = SAFE_TEXT.max(120);

/** Model input is a declaration only. Scope, package, antigens and approval are trusted runtime facts. */
export const RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA = z.object({
  productLabel: SAFE_TEXT.optional(),
  productIdentifier: OPAQUE_ID.optional(),
  administeredOn: DATE,
  location: LOCATION.optional(),
  evidenceDraftId: OPAQUE_ID,
  idempotencyKey: OPAQUE_ID,
}).strict().refine(
  (value) => value.productLabel !== undefined || value.productIdentifier !== undefined,
  "product declaration required",
);

export type RecordVaccineAdministrationInput = z.infer<typeof RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA>;

const SOURCE_REFERENCE_SCHEMA = z.object({
  label: SAFE_TEXT,
  referenceCode: CODE,
  sourceDigest: HASH,
}).strict();

const DOMAIN_PACKAGE_SCHEMA = z.object({
  country: COUNTRY,
  packageId: CODE,
  packageVersion: CODE,
  releaseStatus: z.literal("active"),
  algorithmId: CODE,
  sourceReferences: z.array(SOURCE_REFERENCE_SCHEMA).min(1).max(16),
}).strict();

const DOMAIN_ASSESSMENT_SCHEMA = z.object({
  ruleCode: CODE,
  seriesCode: CODE,
  doseCode: CODE,
  doseNumber: z.number().int().min(1).max(20),
  status: z.enum(["applied", "upcoming", "due", "overdue", "not_applicable", "review_required"]),
  reasonCode: CODE,
  dueFrom: DATE.nullable(),
  dueUntil: DATE.nullable(),
  matchedAdministrationIds: z.array(OPAQUE_ID).max(48),
  sourceReferences: z.array(SOURCE_REFERENCE_SCHEMA).min(1).max(16).optional(),
}).strict();

const DOMAIN_EVALUATION_SCHEMA = z.object({
  evidenceState: z.literal("confirmed_only"),
  package: DOMAIN_PACKAGE_SCHEMA,
  assessments: z.array(DOMAIN_ASSESSMENT_SCHEMA).max(48),
}).strict();

export type VaccineAdministrationSourceReference = Readonly<z.infer<typeof SOURCE_REFERENCE_SCHEMA>>;
export type VaccineAdministrationRulePackage = Readonly<z.infer<typeof DOMAIN_PACKAGE_SCHEMA>>;
export type VaccineAdministrationAssessment = Readonly<z.infer<typeof DOMAIN_ASSESSMENT_SCHEMA>>;
export type VaccineAdministrationEvaluation = Readonly<z.infer<typeof DOMAIN_EVALUATION_SCHEMA>>;

const TRUSTED_SOURCE_SCHEMA = z.object({
  label: SAFE_TEXT,
  referenceCode: CODE,
  citationHandle: z.string().regex(/^citation:v1:[a-f0-9]{64}$/u),
}).strict();

const TRUSTED_ASSESSMENT_SCHEMA = z.object({
  ruleCode: CODE,
  seriesCode: CODE,
  doseCode: CODE,
  doseNumber: z.number().int().min(1).max(20),
  status: z.enum(["applied", "upcoming", "due", "overdue", "not_applicable", "review_required"]),
  reasonCode: CODE,
  dueFrom: DATE.nullable(),
  dueUntil: DATE.nullable(),
  provenance: z.object({ sources: z.array(TRUSTED_SOURCE_SCHEMA).min(1).max(16) }).strict(),
}).strict();

const TRUSTED_DATA_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay"]),
  administeredOn: DATE,
  country: COUNTRY,
  productCode: CODE,
  antigenCodes: z.array(CODE).min(1).max(16),
  packageVersion: CODE,
  algorithmId: CODE,
  assessments: z.array(TRUSTED_ASSESSMENT_SCHEMA).max(48),
  provenance: z.object({ sources: z.array(TRUSTED_SOURCE_SCHEMA).min(1).max(16) }).strict(),
}).strict();

export const RECORD_VACCINE_ADMINISTRATION_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: TRUSTED_DATA_SCHEMA,
}).strict();

export type RecordVaccineAdministrationTrustedResult = Readonly<
  z.infer<typeof RECORD_VACCINE_ADMINISTRATION_TRUSTED_RESULT_SCHEMA>
>;

export const RECORD_VACCINE_ADMINISTRATION_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.enum(["created", "replayed"]),
  result: RECORD_VACCINE_ADMINISTRATION_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: z.string().regex(/^[a-z][a-z0-9_]*:[a-f0-9]{64}$/u),
  requestSha256: HASH,
  approvalSha256: HASH,
}).strict();

export type RecordVaccineAdministrationExecution = z.infer<
  typeof RECORD_VACCINE_ADMINISTRATION_OUTPUT_SCHEMA
>;
type RecordVaccineAdministrationModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

export type VaccineAdministrationPreflightResult = Readonly<{
  decision: "not_urgent" | "urgent" | "indeterminate";
}>;

export type VaccineAdministrationDraftResolution = Readonly<{
  status: "draft" | "confirmed" | "rejected" | "superseded";
  draft?: AdministrationDraft;
}>;

export type VaccineAdministrationRecordRequest = Readonly<{
  scope: AuthorizedChildScope;
  candidate: ConfirmedAdministrationCandidate;
  idempotencyKey: string;
  inputFingerprint: string;
  confirmation: Readonly<{ approvalSha256: string }>;
  requestSha256: string;
  signal: AbortSignal;
}>;

export type VaccineAdministrationRecordResult = Readonly<{
  outcome: "created" | "idempotent_replay";
  administrationId: string;
}>;

export type VaccineAdministrationReevaluationRequest = Readonly<{
  scope: AuthorizedChildScope;
  asOfDate: string;
  package: VaccineAdministrationRulePackage;
  administrationId: string;
  signal: AbortSignal;
}>;

export type VaccineAdministrationPort = Readonly<{
  preflight(request: Readonly<{ scope: AuthorizedChildScope; signal: AbortSignal }>): Promise<VaccineAdministrationPreflightResult>;
  resolveDraft(request: Readonly<{ scope: AuthorizedChildScope; draftId: string; signal: AbortSignal }>): Promise<VaccineAdministrationDraftResolution>;
  loadChildDateOfBirth(request: Readonly<{ scope: AuthorizedChildScope; signal: AbortSignal }>): Promise<string | null>;
  loadCatalog(request: Readonly<{ scope: AuthorizedChildScope; asOfDate: string; signal: AbortSignal }>): Promise<VaccineCatalog | null>;
  resolvePackage(request: Readonly<{ scope: AuthorizedChildScope; asOfDate: string; signal: AbortSignal }>): Promise<VaccineAdministrationRulePackage | null>;
  recordConfirmed(request: VaccineAdministrationRecordRequest): Promise<VaccineAdministrationRecordResult>;
  reevaluate(request: VaccineAdministrationReevaluationRequest): Promise<VaccineAdministrationEvaluation>;
}>;

type VaccineAdministrationServices = ToolServicePorts & Readonly<{
  vaccineAdministration: VaccineAdministrationPort;
}>;

const CATALOG_ANTIGEN_SCHEMA = z.object({
  id: OPAQUE_ID,
  antigenCode: CODE,
  displayName: SAFE_TEXT,
  diseaseGroup: CODE,
  active: z.boolean(),
}).strict();
const CATALOG_PRODUCT_SCHEMA = z.object({
  id: OPAQUE_ID,
  productCode: CODE,
  countryCode: z.enum(["CO", "US", "GLOBAL"]),
  manufacturer: SAFE_TEXT,
  brandName: SAFE_TEXT,
  presentation: SAFE_TEXT,
  regulatoryIdentifier: OPAQUE_ID.nullable(),
  aliases: z.array(SAFE_TEXT).max(16),
  effectiveFrom: DATE,
  effectiveUntil: DATE.nullable(),
  active: z.boolean(),
}).strict();
const CATALOG_SCHEMA = z.object({
  version: CODE,
  sourceDigest: HASH,
  antigens: z.array(CATALOG_ANTIGEN_SCHEMA).max(256),
  products: z.array(CATALOG_PRODUCT_SCHEMA).max(256),
  productAntigens: z.array(z.object({ productId: OPAQUE_ID, antigenId: OPAQUE_ID }).strict()).max(512),
}).strict();

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "record_vaccine_administration.v1",
  inputSchema: RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA,
  resultSchema: RECORD_VACCINE_ADMINISTRATION_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "record_vaccine_administration.v1",
});

function safeFailure(code: string, effectState: ToolEffectState = "unknown"): never {
  throw mapToolError(Object.freeze({ code }), { effectState });
}

function abortIfNeeded(signal: AbortSignal, effectState: ToolEffectState = "none"): void {
  if (signal.aborted) safeFailure("CANCELLED", effectState);
}

function serviceFor(context: TrustedToolContext): VaccineAdministrationPort {
  try {
    const services = getTrustedToolServices(context as TrustedToolContext<VaccineAdministrationServices>);
    const service = services.vaccineAdministration;
    if (!service
      || typeof service.preflight !== "function"
      || typeof service.resolveDraft !== "function"
      || typeof service.loadChildDateOfBirth !== "function"
      || typeof service.loadCatalog !== "function"
      || typeof service.resolvePackage !== "function"
      || typeof service.recordConfirmed !== "function"
      || typeof service.reevaluate !== "function") {
      return safeFailure("RULE_UNAVAILABLE", "none");
    }
    return service;
  } catch {
    return safeFailure("RULE_UNAVAILABLE", "none");
  }
}

function nowFor(context: TrustedToolContext, effectState: ToolEffectState = "none"): Date {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, object>>;
    const clock = services.toolIdempotency as Readonly<{ now?: () => Date }> | undefined;
    const now = typeof clock?.now === "function" ? clock.now() : new Date(Number.NaN);
    if (now instanceof Date && Number.isFinite(now.getTime())) return new Date(now);
  } catch {
    // Fail closed below.
  }
  return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
}

function calendarDateFor(value: Date, timezone: string): string {
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
    // The trusted scope supplies the timezone; malformed values deny below.
  }
  return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
}

function reauthorize(context: TrustedToolContext, effectState: ToolEffectState): AuthorizedChildScope {
  const signal = getTrustedToolAbortSignal(context);
  abortIfNeeded(signal, effectState);
  const now = nowFor(context, effectState);
  try {
    const scope = requireActiveChildScope(context, now);
    if (!authorizeToolInvocation(context, TOOL_ID, now).allowed) return safeFailure("FORBIDDEN", effectState);
    return scope;
  } catch {
    return safeFailure("FORBIDDEN", effectState);
  }
}

function serviceErrorCode(error: unknown): string | null {
  try {
    if (!error || typeof error !== "object" || Array.isArray(error)) return null;
    const code = (error as Readonly<{ code?: unknown }>).code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

function mapServiceFailure(error: unknown, effectState: ToolEffectState): never {
  if (isSafeToolError(error)) throw error;
  const code = serviceErrorCode(error);
  if (code === "CANCELLED" || code === "ABORTED"
    || (error instanceof Error && error.name === "AbortError")) return safeFailure("CANCELLED", effectState);
  if (code === "ACCESS_DENIED" || code === "NOT_AUTHORIZED" || code === "FORBIDDEN") {
    return safeFailure("ACCESS_DENIED", effectState);
  }
  if (code === "IDEMPOTENCY_CONFLICT" || code === "CONFIRMATION_DRIFT") {
    return safeFailure(code, "none");
  }
  if (code === "RULE_UNAVAILABLE" || code === "PACKAGE_UNAVAILABLE" || code === "POLICY_UNAVAILABLE") {
    return safeFailure("RULE_UNAVAILABLE", effectState);
  }
  return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
}

function parsePackage(raw: unknown): VaccineAdministrationRulePackage | null {
  try {
    const parsed = DOMAIN_PACKAGE_SCHEMA.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function activePackage(
  raw: unknown,
  scope: AuthorizedChildScope,
  effectState: ToolEffectState = "none",
): VaccineAdministrationRulePackage {
  const parsed = parsePackage(raw);
  if (!parsed || parsed.releaseStatus !== "active" || parsed.country !== scope.countryOfCare) {
    return safeFailure("RULE_UNAVAILABLE", effectState);
  }
  return parsed;
}

function parseCatalog(raw: unknown): VaccineCatalog | null {
  try {
    const parsed = CATALOG_SCHEMA.safeParse(raw);
    return parsed.success ? parsed.data as unknown as VaccineCatalog : null;
  } catch {
    return null;
  }
}

function parseEvaluation(raw: unknown): VaccineAdministrationEvaluation {
  try {
    const parsed = DOMAIN_EVALUATION_SCHEMA.safeParse(raw);
    if (parsed.success) return parsed.data;
  } catch {
    // Fail closed below.
  }
  return safeFailure("RULE_UNAVAILABLE", "committed");
}

function declaration(input: RecordVaccineAdministrationInput): Readonly<{
  administeredOn: string;
  product: Readonly<{ label?: string; identifier?: string }>;
  location?: string;
}> {
  return Object.freeze({
    administeredOn: input.administeredOn,
    product: Object.freeze({ label: input.productLabel, identifier: input.productIdentifier }),
    location: input.location,
  });
}

function draftMatchesDeclaration(snapshot: ConfirmationSnapshot, input: RecordVaccineAdministrationInput): boolean {
  const product = snapshot.extracted.product;
  const labelMatches = input.productLabel === undefined
    ? product.alias === undefined
    : product.alias === input.productLabel;
  const identifiers = [product.productCode, product.regulatoryIdentifier]
    .filter((value): value is string => value !== undefined);
  const identifierMatches = input.productIdentifier === undefined
    ? identifiers.length === 0
    : identifiers.length === 1 && identifiers[0] === input.productIdentifier;
  return snapshot.draftId === input.evidenceDraftId
    && snapshot.extracted.administeredOn === input.administeredOn
    && labelMatches
    && identifierMatches
    && snapshot.extracted.administrationSite === input.location
    && snapshot.extracted.antigenCodes === undefined
    && snapshot.extracted.doseLabel === undefined
    && snapshot.extracted.lotNumber === undefined
    && snapshot.extracted.providerName === undefined;
}

function inputFingerprint(
  input: RecordVaccineAdministrationInput,
  snapshot: ConfirmationSnapshot,
  candidate: ConfirmedAdministrationCandidate,
): string {
  return createHash("sha256").update(canonicalize({
    version: "record-vaccine-administration-input.v1",
    declaration: declaration(input),
    draftId: snapshot.draftId,
    confirmationDigest: snapshot.confirmationDigest,
    candidate: {
      administeredOn: candidate.administeredOn,
      productCode: candidate.product?.productCode ?? null,
      antigenIds: [...candidate.antigenIds],
      catalogVersion: candidate.catalogVersion,
      catalogDigest: candidate.catalogDigest,
      sourceDigest: candidate.sourceDigest,
    },
  }), "utf8").digest("hex");
}

function sourceList(raw: readonly VaccineAdministrationSourceReference[]): readonly z.infer<typeof TRUSTED_SOURCE_SCHEMA>[] {
  const parsed = (() => {
    try {
      return z.array(SOURCE_REFERENCE_SCHEMA).min(1).max(16).safeParse(raw);
    } catch {
      return null;
    }
  })();
  if (!parsed || !parsed.success) return safeFailure("RULE_UNAVAILABLE", "committed");
  const values = parsed.data.map((source) => ({
    label: source.label,
    referenceCode: source.referenceCode,
    citationHandle: createCitationHandle(TOOL_ID, {
      sourceDigest: source.sourceDigest,
      referenceCode: source.referenceCode,
    }),
  }));
  values.sort((left, right) => {
    const l = `${left.referenceCode}\u0000${left.citationHandle}`;
    const r = `${right.referenceCode}\u0000${right.citationHandle}`;
    return l === r ? 0 : l < r ? -1 : 1;
  });
  const unique = new Map<string, typeof values[number]>();
  for (const value of values) {
    const prior = unique.get(value.citationHandle);
    if (prior && prior.label !== value.label) return safeFailure("RULE_UNAVAILABLE", "committed");
    unique.set(value.citationHandle, Object.freeze(value));
  }
  if (unique.size === 0) return safeFailure("RULE_UNAVAILABLE", "committed");
  return Object.freeze([...unique.values()]);
}

function assessmentKey(value: Pick<VaccineAdministrationAssessment, "seriesCode" | "doseNumber" | "doseCode" | "ruleCode">): string {
  return [value.seriesCode, String(value.doseNumber).padStart(3, "0"), value.doseCode, value.ruleCode].join("\u0000");
}

function trustedResult(
  input: RecordVaccineAdministrationInput,
  candidate: ConfirmedAdministrationCandidate,
  antigenCodes: readonly string[],
  packageData: VaccineAdministrationRulePackage,
  evaluation: VaccineAdministrationEvaluation,
  administrationId: string,
  outcome: "created" | "idempotent_replay",
): RecordVaccineAdministrationTrustedResult {
  if (evaluation.package.country !== candidate.scope.countryCode
    || evaluation.package.country !== packageData.country
    || evaluation.package.packageId !== packageData.packageId
    || evaluation.package.packageVersion !== packageData.packageVersion
    || evaluation.package.algorithmId !== packageData.algorithmId
    || evaluation.package.releaseStatus !== "active"
    || canonicalize(evaluation.package.sourceReferences) !== canonicalize(packageData.sourceReferences)) {
    return safeFailure("RULE_UNAVAILABLE", "committed");
  }
  const packageSources = sourceList(packageData.sourceReferences);
  const packageByCitation = new Map(packageSources.map((source) => [source.citationHandle, source]));
  const seen = new Set<string>();
  const assessments = evaluation.assessments.map((assessment) => {
    if (assessment.dueFrom !== null && assessment.dueUntil !== null && assessment.dueFrom > assessment.dueUntil) {
      return safeFailure("RULE_UNAVAILABLE", "committed");
    }
    const key = assessmentKey(assessment);
    if (seen.has(key)) return safeFailure("RULE_UNAVAILABLE", "committed");
    seen.add(key);
    if (new Set(assessment.matchedAdministrationIds).size !== assessment.matchedAdministrationIds.length
      || (assessment.status === "applied" && !assessment.matchedAdministrationIds.includes(administrationId))) {
      return safeFailure("RULE_UNAVAILABLE", "committed");
    }
    const sources = sourceList(assessment.sourceReferences ?? packageData.sourceReferences);
    for (const source of sources) {
      const packageSource = packageByCitation.get(source.citationHandle);
      if (!packageSource || packageSource.referenceCode !== source.referenceCode || packageSource.label !== source.label) {
        return safeFailure("RULE_UNAVAILABLE", "committed");
      }
    }
    return Object.freeze({
      ruleCode: assessment.ruleCode,
      seriesCode: assessment.seriesCode,
      doseCode: assessment.doseCode,
      doseNumber: assessment.doseNumber,
      status: assessment.status,
      reasonCode: assessment.reasonCode,
      dueFrom: assessment.dueFrom,
      dueUntil: assessment.dueUntil,
      provenance: Object.freeze({ sources }),
    });
  });
  assessments.sort((left, right) => {
    const l = assessmentKey(left);
    const r = assessmentKey(right);
    return l === r ? 0 : l < r ? -1 : 1;
  });
  const product = candidate.product;
  if (!product || (product.countryCode !== candidate.scope.countryCode && product.countryCode !== "GLOBAL")) {
    return safeFailure("RULE_UNAVAILABLE", "committed");
  }
  const normalizedAntigens = [...antigenCodes].sort();
  if (normalizedAntigens.length === 0
    || new Set(normalizedAntigens).size !== normalizedAntigens.length
    || normalizedAntigens.some((code) => !CODE.safeParse(code).success)) {
    return safeFailure("RULE_UNAVAILABLE", "committed");
  }
  const result = {
    kind: "trusted_tool_result" as const,
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      outcome,
      administeredOn: input.administeredOn,
      country: candidate.scope.countryCode,
      productCode: product.productCode,
      antigenCodes: normalizedAntigens,
      packageVersion: packageData.packageVersion,
      algorithmId: packageData.algorithmId,
      assessments,
      provenance: Object.freeze({ sources: packageSources }),
    },
  };
  const checked = RECORD_VACCINE_ADMINISTRATION_TRUSTED_RESULT_SCHEMA.safeParse(result);
  if (!checked.success) return safeFailure("RULE_UNAVAILABLE", "committed");
  return checked.data;
}

function antigenCodesForCandidate(candidate: ConfirmedAdministrationCandidate, catalog: VaccineCatalog): readonly string[] {
  const product = candidate.product;
  if (!product) return safeFailure("RULE_UNAVAILABLE", "none");
  const linked = catalog.productAntigens
    .filter((link) => link.productId === product.id)
    .map((link) => catalog.antigens.find((antigen) => antigen.id === link.antigenId))
    .filter((antigen): antigen is NonNullable<typeof antigen> => antigen !== undefined && antigen.active);
  if (linked.length === 0 || linked.length !== candidate.antigenIds.length) return safeFailure("RULE_UNAVAILABLE", "none");
  const ids = new Set(candidate.antigenIds);
  if (linked.some((antigen) => !ids.has(antigen.id))) return safeFailure("RULE_UNAVAILABLE", "none");
  return Object.freeze(linked.map((antigen) => antigen.antigenCode).sort());
}

export function projectRecordVaccineAdministrationForModel(raw: unknown): RecordVaccineAdministrationModelResult {
  const parsed = RECORD_VACCINE_ADMINISTRATION_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      outcome: parsed.data.data.outcome,
      administeredOn: parsed.data.data.administeredOn,
      productCode: parsed.data.data.productCode,
      antigenCodes: parsed.data.data.antigenCodes,
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
  async (runtime, rawInput) => {
    const trusted = runtime.trustedContext as TrustedToolContext<VaccineAdministrationServices>;
    const signal = getTrustedToolAbortSignal(trusted);
    abortIfNeeded(signal);
    const input = RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA.safeParse(rawInput);
    if (!input.success) return safeFailure("INPUT_INVALID", "none");
    if (!runtime.idempotencyKey || !runtime.approvalSha256) {
      return safeFailure("CONFIRMATION_INVALID", "none");
    }
    const service = serviceFor(trusted);
    const scope = reauthorize(trusted, "none");
    const asOfDate = calendarDateFor(nowFor(trusted), scope.timezone);

    let rawDraft: unknown;
    try {
      rawDraft = await service.resolveDraft(Object.freeze({
        scope,
        draftId: input.data.evidenceDraftId,
        signal,
      }));
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "none");
      return mapServiceFailure(error, "none");
    }
    abortIfNeeded(signal);
    if (!rawDraft || typeof rawDraft !== "object" || (rawDraft as { status?: unknown }).status !== "draft") {
      return safeFailure("CONFIRMATION_INVALID", "none");
    }
    const draftValue = (rawDraft as { draft?: unknown }).draft;
    if (!draftValue || typeof draftValue !== "object") return safeFailure("CONFIRMATION_INVALID", "none");
    let snapshot: ConfirmationSnapshot;
    try {
      snapshot = buildAdministrationConfirmationSnapshot(draftValue as AdministrationDraft);
    } catch {
      return safeFailure("CONFIRMATION_INVALID", "none");
    }
    if (!draftMatchesDeclaration(snapshot, input.data)) return safeFailure("CONFIRMATION_INVALID", "none");

    let dob: string | null;
    try {
      dob = await service.loadChildDateOfBirth(Object.freeze({ scope, signal }));
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "none");
      return mapServiceFailure(error, "none");
    }
    if (!dob || !DATE.safeParse(dob).success) return safeFailure("RULE_UNAVAILABLE", "none");
    let catalogRaw: VaccineCatalog | null;
    try {
      catalogRaw = await service.loadCatalog(Object.freeze({ scope, asOfDate, signal }));
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "none");
      return mapServiceFailure(error, "none");
    }
    const catalog = parseCatalog(catalogRaw);
    if (!catalog) return safeFailure("RULE_UNAVAILABLE", "none");
    const validation = validateAdministration(snapshot, {
      now: nowFor(trusted).toISOString(),
      dateOfBirth: dob,
      expectedScope: Object.freeze({
        careSpaceId: scope.careSpaceId,
        childId: scope.childId,
        countryCode: scope.countryOfCare,
        asOfDate: asOfDate as CalendarDate,
      }),
      expectedConfirmationDigest: snapshot.confirmationDigest,
    }, catalog, { requireResolvedProduct: true });
    if (validation.outcome !== "valid" || !validation.candidate) return safeFailure("RULE_UNAVAILABLE", "none");
    const candidate = validation.candidate;
    const antigenCodes = antigenCodesForCandidate(candidate, catalog);

    const resolveCurrentPackage = async (
      currentScope: AuthorizedChildScope,
      effectState: ToolEffectState = "none",
    ): Promise<VaccineAdministrationRulePackage> => {
      const packageRaw = await service.resolvePackage(Object.freeze({ scope: currentScope, asOfDate, signal }));
      return activePackage(packageRaw, currentScope, effectState);
    };
    let packageData: VaccineAdministrationRulePackage;
    try {
      packageData = await resolveCurrentPackage(scope);
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "none");
      return mapServiceFailure(error, "none");
    }
    const packageBeforeWrite = canonicalize(packageData);
    const scopeBeforeWrite = reauthorize(trusted, "none");
    if (scopeBeforeWrite.countryOfCare !== packageData.country) return safeFailure("RULE_UNAVAILABLE", "none");
    let packageAtWrite: VaccineAdministrationRulePackage;
    try {
      packageAtWrite = await resolveCurrentPackage(scopeBeforeWrite);
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "none");
      return mapServiceFailure(error, "none");
    }
    if (canonicalize(packageAtWrite) !== packageBeforeWrite) return safeFailure("RULE_UNAVAILABLE", "none");

    const request: VaccineAdministrationRecordRequest = Object.freeze({
      scope: scopeBeforeWrite,
      candidate,
      idempotencyKey: runtime.idempotencyKey,
      inputFingerprint: inputFingerprint(input.data, snapshot, candidate),
      confirmation: Object.freeze({ approvalSha256: runtime.approvalSha256 }),
      requestSha256: runtime.requestSha256,
      signal,
    });
    let recorded: VaccineAdministrationRecordResult;
    try {
      recorded = await service.recordConfirmed(request);
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "unknown");
      return mapServiceFailure(error, "unknown");
    }
    if (!recorded || (recorded.outcome !== "created" && recorded.outcome !== "idempotent_replay")
      || typeof recorded.administrationId !== "string" || !OPAQUE_ID.safeParse(recorded.administrationId).success) {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    }
    abortIfNeeded(signal, "committed");
    const scopeAfterWrite = reauthorize(trusted, "committed");
    let packageAfterWrite: VaccineAdministrationRulePackage;
    try {
      packageAfterWrite = await resolveCurrentPackage(scopeAfterWrite, "committed");
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "committed");
      return mapServiceFailure(error, "committed");
    }
    let evaluation: VaccineAdministrationEvaluation;
    try {
      evaluation = parseEvaluation(await service.reevaluate(Object.freeze({
        scope: scopeAfterWrite,
        asOfDate,
        package: packageAfterWrite,
        administrationId: recorded.administrationId,
        signal,
      })));
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "committed");
      return mapServiceFailure(error, "committed");
    }
    const result = trustedResult(
      input.data,
      candidate,
      antigenCodes,
      packageAfterWrite,
      evaluation,
      recorded.administrationId,
      recorded.outcome,
    );
    return Object.freeze({
      status: "committed" as const,
      outcome: recorded.outcome === "idempotent_replay" ? "replayed" as const : "created" as const,
      result,
    });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (
    context: TrustedToolContext,
    input: RecordVaccineAdministrationInput,
    approval: ToolApprovalSubmission | null,
  ) => invokeIdempotently(context, input, approval),
);

async function ensureNotUrgent(context: TrustedToolContext): Promise<void> {
  const service = serviceFor(context);
  const signal = getTrustedToolAbortSignal(context);
  abortIfNeeded(signal);
  const scope = reauthorize(context, "none");
  let raw: unknown;
  try {
    raw = await service.preflight(Object.freeze({ scope, signal }));
  } catch (error) {
    if (signal.aborted) return safeFailure("CANCELLED", "none");
    return mapServiceFailure(error, "none");
  }
  const parsed = z.object({ decision: z.enum(["not_urgent", "urgent", "indeterminate"]) }).strict().safeParse(raw);
  if (!parsed.success || parsed.data.decision !== "not_urgent") return safeFailure("RULE_UNAVAILABLE", "none");
}

export async function executeRecordVaccineAdministration(
  context: TrustedToolContext,
  input: RecordVaccineAdministrationInput,
  approval: ToolApprovalSubmission | null = null,
): Promise<RecordVaccineAdministrationExecution> {
  try {
    // Deterministic preflight precedes approval, draft resolution, and effects.
    await ensureNotUrgent(context);
    const raw = await invokeWithAudit(context, input, approval);
    if ("allowed" in raw) {
      return raw.status === "approval_required"
        ? safeFailure("CONFIRMATION_REQUIRED", "none")
        : safeFailure("CONFIRMATION_INVALID", "none");
    }
    const parsed = RECORD_VACCINE_ADMINISTRATION_OUTPUT_SCHEMA.safeParse(raw);
    if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    return parsed.data;
  } catch (error) {
    throw mapToolError(error, { effectState: "unknown" });
  }
}

export default defineTool({
  description: "Registra una administración declarada después de confirmación explícita y reevaluación determinista; no certifica inmunidad, diagnostica contraindicaciones, selecciona vacunas ni crea citas o recordatorios.",
  inputSchema: RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA,
  outputSchema: RECORD_VACCINE_ADMINISTRATION_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeRecordVaccineAdministration(trusted, input, null);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectRecordVaccineAdministrationForModel(output.result));
  },
});
