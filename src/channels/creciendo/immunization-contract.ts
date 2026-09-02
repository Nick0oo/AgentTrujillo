import { z } from "zod";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type {
  VaccinationScheduleEvaluation,
  VaccinationScheduleAssessment,
} from "../../../agent/tools/evaluate_vaccination_schedule.ts";

export const CRECIENDO_IMMUNIZATION_VERSION = "creciendo.immunization.v1" as const;

const UUID = z.string().uuid();
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "calendar_date");
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const SAFE_TEXT = z.string().min(1).max(160).refine((value) => (
  value === value.normalize("NFKC")
    && !/[\u0000-\u001f\u007f<>`]/u.test(value)
), "safe_text");
const COUNTRY = z.enum(["CO", "US"]);
const STATUS = z.enum(["applied", "upcoming", "due", "overdue", "not_applicable", "review_required"]);
const SOURCE = z.object({
  label: SAFE_TEXT,
  referenceCode: CODE,
  sourceDigest: HASH,
}).strict();
const PACKAGE = z.object({
  id: CODE,
  version: CODE,
  algorithmId: CODE,
  sourceReferences: z.array(SOURCE).min(1).max(16),
}).strict();
const ASSESSMENT = z.object({
  id: z.string().regex(/^vaccination-status-[0-9]{3}$/u),
  ruleCode: CODE,
  seriesCode: CODE,
  doseCode: CODE,
  doseNumber: z.number().int().min(1).max(20),
  status: STATUS,
  reasonCode: CODE,
  dueFrom: DATE.nullable(),
  dueUntil: DATE.nullable(),
  evidence: z.object({ matchedFactCount: z.number().int().nonnegative().max(48) }).strict(),
  sources: z.array(SOURCE).min(1).max(16),
}).strict();

const READY_RESPONSE = z.object({
  version: z.literal(CRECIENDO_IMMUNIZATION_VERSION),
  requestId: CODE,
  status: z.literal("ready"),
  code: z.null(),
  childId: UUID,
  careSpaceId: UUID,
  country: COUNTRY,
  asOfDate: DATE,
  package: PACKAGE,
  assessments: z.array(ASSESSMENT).max(48),
}).strict();

const UNAVAILABLE_RESPONSE = z.object({
  version: z.literal(CRECIENDO_IMMUNIZATION_VERSION),
  requestId: CODE,
  status: z.literal("unavailable"),
  code: z.enum(["RULE_UNAVAILABLE", "PERSISTENCE_UNAVAILABLE"]),
  childId: UUID,
  careSpaceId: UUID,
  country: COUNTRY,
  asOfDate: DATE,
  package: z.null(),
  assessments: z.array(z.never()).length(0),
}).strict();

export const IMMUNIZATION_STATUS_RESPONSE_SCHEMA = z.discriminatedUnion("status", [
  READY_RESPONSE,
  UNAVAILABLE_RESPONSE,
]);

const ADMINISTRATION_REQUEST = z.object({
  version: z.literal(CRECIENDO_IMMUNIZATION_VERSION),
  administeredOn: DATE,
  productLabel: SAFE_TEXT.optional(),
  productIdentifier: CODE.optional(),
  doseLabel: SAFE_TEXT.optional(),
  lotNumber: SAFE_TEXT.optional(),
  location: SAFE_TEXT.optional(),
  evidenceDraftId: CODE,
  confirmed: z.literal(true),
}).strict().refine((value) => value.productLabel !== undefined || value.productIdentifier !== undefined, "product_declaration_required");

const ADMINISTRATION_ASSESSMENT = ASSESSMENT.omit({ id: true, evidence: true }).extend({
  evidence: z.object({ matchedFactCount: z.number().int().nonnegative().max(48) }).strict(),
}).strict();

export const IMMUNIZATION_ADMINISTRATION_RESPONSE_SCHEMA = z.object({
  version: z.literal(CRECIENDO_IMMUNIZATION_VERSION),
  requestId: CODE,
  outcome: z.enum(["created", "idempotent_replay"]),
  administeredOn: DATE,
  country: COUNTRY,
  productCode: CODE,
  packageVersion: CODE,
  algorithmId: CODE,
  assessments: z.array(ADMINISTRATION_ASSESSMENT).max(48),
  sources: z.array(SOURCE).min(1).max(16),
}).strict();

export type ImmunizationStatusResponse = Readonly<z.infer<typeof IMMUNIZATION_STATUS_RESPONSE_SCHEMA>>;
export type ImmunizationAdministrationRequest = Readonly<z.infer<typeof ADMINISTRATION_REQUEST>>;
export type ImmunizationAdministrationResponse = Readonly<z.infer<typeof IMMUNIZATION_ADMINISTRATION_RESPONSE_SCHEMA>>;
export type ImmunizationStatusProjectionInput = Readonly<{
  requestId: string;
  scope: AuthorizedChildScope;
  asOfDate: string;
  evaluation: VaccinationScheduleEvaluation | null;
}>;

export class ImmunizationContractError extends Error {
  constructor(readonly code: "IMMUNIZATION_COUNTRY_MISMATCH" | "IMMUNIZATION_DUPLICATE_ASSESSMENT" | "IMMUNIZATION_STATUS_INVALID" | "IMMUNIZATION_RESPONSE_INVALID") {
    super(code);
    this.name = "ImmunizationContractError";
  }
}

function unavailable(input: ImmunizationStatusProjectionInput, code: "RULE_UNAVAILABLE" | "PERSISTENCE_UNAVAILABLE"): ImmunizationStatusResponse {
  return UNAVAILABLE_RESPONSE.parse({
    version: CRECIENDO_IMMUNIZATION_VERSION,
    requestId: input.requestId,
    status: "unavailable",
    code,
    childId: input.scope.childId,
    careSpaceId: input.scope.careSpaceId,
    country: input.scope.countryOfCare,
    asOfDate: input.asOfDate,
    package: null,
    assessments: [],
  });
}

function sourceReferences(assessment: VaccinationScheduleAssessment, evaluation: VaccinationScheduleEvaluation): readonly z.infer<typeof SOURCE>[] {
  const sources = assessment.sourceReferences ?? evaluation.package.sourceReferences;
  return sources.map((source) => ({
    label: source.label,
    referenceCode: source.referenceCode,
    sourceDigest: source.sourceDigest,
  }));
}

export function projectImmunizationStatus(input: ImmunizationStatusProjectionInput): ImmunizationStatusResponse {
  if (input.evaluation === null) return unavailable(input, "RULE_UNAVAILABLE");
  const evaluation = input.evaluation;
  if (evaluation.package.country !== input.scope.countryOfCare) {
    throw new ImmunizationContractError("IMMUNIZATION_COUNTRY_MISMATCH");
  }

  const identities = new Set<string>();
  const assessments = evaluation.assessments.map((assessment, index) => {
    if (!STATUS.options.includes(assessment.status)) {
      throw new ImmunizationContractError("IMMUNIZATION_STATUS_INVALID");
    }
    const identity = [assessment.ruleCode, assessment.seriesCode, assessment.doseCode, assessment.doseNumber].join("\u0000");
    if (identities.has(identity)) throw new ImmunizationContractError("IMMUNIZATION_DUPLICATE_ASSESSMENT");
    identities.add(identity);
    return {
      id: `vaccination-status-${String(index + 1).padStart(3, "0")}`,
      ruleCode: assessment.ruleCode,
      seriesCode: assessment.seriesCode,
      doseCode: assessment.doseCode,
      doseNumber: assessment.doseNumber,
      status: assessment.status,
      reasonCode: assessment.reasonCode,
      dueFrom: assessment.dueFrom,
      dueUntil: assessment.dueUntil,
      evidence: { matchedFactCount: assessment.matchedAdministrationIds.length },
      sources: sourceReferences(assessment, evaluation),
    };
  });

  const result = {
    version: CRECIENDO_IMMUNIZATION_VERSION,
    requestId: input.requestId,
    status: "ready" as const,
    code: null,
    childId: input.scope.childId,
    careSpaceId: input.scope.careSpaceId,
    country: input.scope.countryOfCare,
    asOfDate: input.asOfDate,
    package: {
      id: evaluation.package.packageId,
      version: evaluation.package.packageVersion,
      algorithmId: evaluation.package.algorithmId,
      sourceReferences: evaluation.package.sourceReferences,
    },
    assessments,
  };
  const parsed = READY_RESPONSE.safeParse(result);
  if (!parsed.success) throw new ImmunizationContractError("IMMUNIZATION_RESPONSE_INVALID");
  return parsed.data;
}

export function parseAdministrationRequest(raw: unknown): ImmunizationAdministrationRequest | null {
  const parsed = ADMINISTRATION_REQUEST.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function isValidImmunizationIdempotencyKey(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]*:[a-f0-9]{64}$/u.test(value);
}

export function publicImmunizationError(
  status: 400 | 401 | 403 | 404 | 409 | 422 | 503,
  code: "REQUEST_INVALID" | "UNAUTHORIZED" | "ACCESS_DENIED" | "NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "CONFIRMATION_INVALID" | "PERSISTENCE_UNAVAILABLE",
  requestId: string,
): Response {
  return Response.json({
    version: "creciendo.error.v1",
    code,
    requestId,
    retryable: status === 503,
    retryAfterSeconds: null,
    effectState: "none",
    resumable: false,
  }, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
