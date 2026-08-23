import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import { deepFreeze, type SafetyDecision } from "../../safety/message-types.ts";
import type { MemorySensitivity, MemoryType } from "./types.ts";
import type { Sha256Hex } from "../governance/source-types.ts";

const DIGEST = /^[a-f0-9]{64}$/u;
const CODE = /^[a-z][a-z0-9._-]{0,95}$/u;
const INSTANT = z.string().datetime({ offset: true });
const POLICY_ID = "clinical-memory-confirmation";
const POLICY_SCHEMA_VERSION = "clinical-memory-confirmation-policy.v1";
const DEFAULT_POLICY_VERSION = "memory-confirmation.v1";
const PURPOSE = "guardian_controlled_memory" as const;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type MemoryAllowedPurpose = typeof PURPOSE;
export type MemoryConfirmationMode = "explicit" | "digest_bound";
export type PolicyMemoryType = MemoryType;

export type MemoryPolicyReason =
  | "INVALID_INPUT"
  | "MODEL_OVERRIDE"
  | "UNKNOWN_MEMORY_TYPE"
  | "UNKNOWN_SUBJECT"
  | "THIRD_PARTY_DATA"
  | "DIAGNOSIS_GUESS"
  | "MEDICATION_RECOMMENDATION"
  | "DOSE_OR_ADMINISTRATION_AUTHORIZATION"
  | "URGENT_CONTENT"
  | "SECRET_OR_CREDENTIAL"
  | "OPERATIONAL_ABUSE"
  | "AMBIGUOUS_CONTENT"
  | "SAFETY_PREFLIGHT_REQUIRED"
  | "SAFETY_PREFLIGHT_INVALID"
  | "SAFETY_NON_CONTINUE"
  | "URGENT_PREFLIGHT"
  | "POLICY_UNAVAILABLE"
  | "POLICY_REVOKED"
  | "POLICY_DIGEST_DRIFT"
  | "POLICY_OUTSIDE_EFFECTIVE_WINDOW"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_INVALID"
  | "CONFIRMATION_MODE_MISMATCH"
  | "CONFIRMATION_DIGEST_MISMATCH"
  | "CANDIDATE_DIGEST_REQUIRED"
  | "CANDIDATE_DIGEST_MISMATCH"
  | "PURPOSE_NOT_ALLOWED"
  | "EXPIRY_REQUIRED"
  | "EXPIRY_INVALID"
  | "EXPIRY_OUTSIDE_POLICY";

export type MemoryConfirmationPolicy = Readonly<{
  policyId: string;
  policyVersion: string;
  policySha256: Sha256Hex;
  allowedPurpose: MemoryAllowedPurpose;
  retentionDays: Readonly<{ low: number; medium: number; high: number }>;
  effectiveFrom: string;
  effectiveUntil: string | null;
  active: boolean;
  current?: boolean;
  revoked: boolean;
}>;

export type MemoryPolicyCandidate = Readonly<{
  memoryType: string;
  text: string;
  provenanceType?: "guardian" | "professional" | "import" | "document" | "chat" | "system";
  subject?: "child" | "guardian" | "other" | "unknown";
  candidateId?: string;
  inputSha256?: string;
  expiresAt?: string | null;
}>;

export type MemoryCandidatePolicyInput = Readonly<{
  candidate: MemoryPolicyCandidate;
  policy: MemoryConfirmationPolicy | null | undefined;
  safetyDecision: SafetyDecision | undefined;
  cutoff: Date | string;
}>;

export type MemoryPolicyMetadata = Readonly<{
  policyId: string;
  policyVersion: string;
  policySha256: Sha256Hex;
}>;

type MemoryDecisionCore = Readonly<{
  sensitivity: MemorySensitivity;
  allowedPurpose: MemoryAllowedPurpose | null;
  confirmation: Readonly<{ required: true; mode: MemoryConfirmationMode }>;
  retention: Readonly<{
    eligible: boolean;
    maxDays: number | null;
    cutoffAt: string;
    expiresAt: string | null;
  }>;
  prohibitionReasons: readonly MemoryPolicyReason[];
  reviewReasons: readonly MemoryPolicyReason[];
  policy: MemoryPolicyMetadata | null;
  candidateInputSha256: Sha256Hex | null;
}>;

export type MemoryPolicyClassification = MemoryDecisionCore & Readonly<{
  status: "allowed" | "review_required" | "denied";
  decisionSha256: Sha256Hex;
}>;

export type MemoryConfirmationInput = Readonly<{
  candidate: MemoryPolicyCandidate;
  confirmation: Readonly<{
    explicit: true;
    mode: MemoryConfirmationMode;
    purpose: string;
    candidateInputSha256: string;
    confirmationSha256: string;
    expiresAt: string;
  }>;
  policy: MemoryConfirmationPolicy | null | undefined;
  safetyDecision: SafetyDecision | undefined;
  cutoff: Date | string;
}>;

export type MemoryConfirmationEvaluation = MemoryDecisionCore & Readonly<{
  ok: boolean;
  status: "confirmed" | "review_required" | "denied";
  confirmationSha256: Sha256Hex | null;
  decisionSha256: Sha256Hex;
}>;

const candidateSchema = z.object({
  memoryType: z.string().min(1).max(32),
  text: z.string().min(1).max(8_000),
  provenanceType: z.enum(["guardian", "professional", "import", "document", "chat", "system"]).optional(),
  subject: z.enum(["child", "guardian", "other", "unknown"]).optional(),
  candidateId: z.string().uuid().optional(),
  inputSha256: z.string().regex(DIGEST).optional(),
  expiresAt: INSTANT.nullable().optional(),
}).strict();

const policySchema = z.object({
  policyId: z.string().regex(CODE),
  policyVersion: z.string().regex(CODE),
  policySha256: z.string().regex(DIGEST),
  allowedPurpose: z.literal(PURPOSE),
  retentionDays: z.object({
    low: z.number().int().positive().max(3_650),
    medium: z.number().int().positive().max(3_650),
    high: z.number().int().positive().max(3_650),
  }).strict(),
  effectiveFrom: INSTANT,
  effectiveUntil: INSTANT.nullable(),
  active: z.boolean(),
  current: z.boolean().optional(),
  revoked: z.boolean(),
}).strict();

const safetyDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("urgent"), responseMode: z.literal("emergency_recommendation"), ruleCodes: z.array(z.string().min(1).max(128)).min(1).max(100), copyKey: z.enum(["emergency_department_es_co_v1", "emergency_department_en_us_v1"]) }).strict(),
  z.object({ decision: z.literal("clarification_required"), responseMode: z.literal("clarify"), question: z.enum(["clarify_subject_or_timing_v1", "clarify_temperature_unit_v1"]) }).strict(),
  z.object({ decision: z.literal("professional_review"), responseMode: z.literal("pediatrician_recommendation"), reasonCode: z.string().min(1).max(128) }).strict(),
  z.object({ decision: z.literal("not_urgent"), responseMode: z.literal("continue") }).strict(),
  z.object({ decision: z.literal("indeterminate"), responseMode: z.literal("abstain"), reasonCode: z.string().min(1).max(128) }).strict(),
]);

const confirmationSchema = z.object({
  explicit: z.literal(true),
  mode: z.enum(["explicit", "digest_bound"]),
  purpose: z.string(),
  candidateInputSha256: z.string().regex(DIGEST),
  confirmationSha256: z.string().regex(DIGEST),
  expiresAt: INSTANT,
}).strict();

const envelopeSchema = z.object({
  candidate: candidateSchema,
  policy: z.unknown(),
  safetyDecision: z.unknown(),
  cutoff: z.union([z.date(), INSTANT]),
}).strict();

const confirmationEnvelopeSchema = z.object({
  candidate: candidateSchema,
  confirmation: confirmationSchema,
  policy: z.unknown(),
  safetyDecision: z.unknown(),
  cutoff: z.union([z.date(), INSTANT]),
}).strict();

const HIGH_TYPES = new Set<PolicyMemoryType>([
  "symptom",
  "history",
  "allergy",
  "medication",
  "vaccine",
  "measurement",
  "development",
]);

const KNOWN_TYPES = new Set<PolicyMemoryType>([
  ...HIGH_TYPES,
  "preference",
  "summary",
]);

const diagnosisPattern = /\b(?:(?:what|que)\s+(?:could|might|puede|podria)\s+(?:be|tener|have)|(?:could|might|may|puede|podria|sera)\s+(?:it|this|ser)|(?:what|que)\s+(?:is|es)\s+(?:the\s+)?(?:diagnos(?:e|is|tic|tico|ticar)|diagnostico)|i\s+(?:think|suspect)|creo\s+que|sospecho\s+que)\b/u;
const medicationPattern = /\b(?:what\s+should\s+i\s+give|should\s+i\s+give|can\s+i\s+give|what\s+do\s+i\s+give|safe\s+to\s+give|que\s+le\s+(?:doy|puedo|debo)\s+dar|debo\s+darle|puedo\s+darle|es\s+seguro\s+darle|se\s+lo\s+administro|administrar|prescri(?:be|ption)|receta|treatment|tratamiento|replace|cambiar)\b/u;
const dosePattern = /\b(?:dose|dosage|dosis|mg|mcg|ml|miligramos?|mililitros?|frequency|frecuencia|safe\s+to\s+administer|autorizar\s+la\s+administracion|autoriz(?:ar|ado)\s+administrar)\b/u;
const urgentPattern = /\b(?:not\s+breathing|can(?:'t|not)\s+breathe|difficulty\s+breathing|turning\s+blue|blue\s+(?:lips|face|skin)|seizure|unconscious|choking|heavy\s+bleeding|poison(?:ing)?|no\s+respira|dificultad\s+para\s+respirar|se\s+esta\s+poniendo\s+azul|convulsion|inconsciente|atragantamiento|sangrado\s+abundante|intoxicacion|anafilax|can(?:'t|not)\s+wake|no\s+despierta|letarg(?:ia|o))\b/u;
const secretPattern = /\b(?:password|passcode|api\s*key|secret|token|bearer|private\s*key|credential|jwt|cookie|seed\s*phrase|contrasena|clave|llave\s+privada|credenciales?|frase\s+semilla)\b/u;
const operationalPattern = /\b(?:ignore\s+(?:all\s+)?previous|ignora\s+(?:todas\s+)?(?:las\s+)?instrucciones|system\s+prompt|prompt\s+(?:injection|del\s+sistema)|jailbreak|bypass|disable\s+safety|desactiva\s+la\s+seguridad|override|anula|exploit|exfiltrat|grant\s+access|otorga\s+acceso|admin(?:istrator)?|administrador|root|book|schedule|call|contact|notify|appointment|reserva|agenda|llama|contacta|notifica|cita)\b/u;
const thirdPartyPattern = /\b(?:neighbor|neighbour|friend's\s+child|sibling|brother|sister|cousin|another\s+child|someone\s+else's|vecino|vecina|hijo\s+de|hija\s+de|hermano|hermana|sobrino|sobrina|primo|prima|otro\s+nino|otra\s+nina|alguien\s+mas)\b/u;
const ambiguityPattern = /\b(?:maybe|perhaps|not\s+sure|unclear|i\s+guess|possibly|quizas|no\s+se|tal\s+vez|posiblemente)\b/u;

function hash(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function sortedReasons(values: Iterable<MemoryPolicyReason>): readonly MemoryPolicyReason[] {
  return Object.freeze([...new Set(values)].sort());
}

function validDate(value: Date | string): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function policyArtifact(policy: Omit<MemoryConfirmationPolicy, "policySha256" | "active" | "current" | "revoked">): unknown {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    allowedPurpose: policy.allowedPurpose,
    retentionDays: policy.retentionDays,
    effectiveFrom: policy.effectiveFrom,
    effectiveUntil: policy.effectiveUntil,
  };
}

function policyMetadata(policy: z.infer<typeof policySchema>): MemoryPolicyMetadata {
  return Object.freeze({ policyId: policy.policyId, policyVersion: policy.policyVersion, policySha256: policy.policySha256 as Sha256Hex });
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/\s+/gu, " ").trim();
}

function isModelOverride(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => /(?:authority|child(?:[_-]?id)?|care[_-]?space(?:[_-]?id)?|guardian(?:[_-]?id)?|permission|country|entitlement|model|override|approved|sensitivity|policy[_-]?(?:id|version|sha256)|confirmation[_-]?(?:status|sha256)|scope)/iu.test(key));
}

function hasModelOverrideInConfirmationInput(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return isModelOverride(value);
  const record = value as Record<string, unknown>;
  return isModelOverride(value)
    || isModelOverride(record.candidate)
    || isModelOverride(record.confirmation)
    || isModelOverride(record.safetyDecision);
}

function sensitivityFor(memoryType: string): MemorySensitivity {
  if (memoryType === "preference") return "low";
  if (memoryType === "summary") return "medium";
  return "high";
}

function confirmationFor(sensitivity: MemorySensitivity): Readonly<{ required: true; mode: MemoryConfirmationMode }> {
  return Object.freeze({ required: true as const, mode: sensitivity === "high" ? "digest_bound" as const : "explicit" as const });
}

export function computeMemoryCandidateInputDigest(candidate: MemoryPolicyCandidate): Sha256Hex {
  const parsed = candidateSchema.parse(candidate);
  const { inputSha256: _inputSha256, ...withoutDigest } = parsed;
  return hash({ schemaVersion: "clinical-memory-candidate-input.v1", candidate: withoutDigest });
}

function candidateDigest(candidate: z.infer<typeof candidateSchema>): Sha256Hex {
  return computeMemoryCandidateInputDigest(candidate);
}

function policyState(
  rawPolicy: unknown,
  cutoff: Date,
): Readonly<{ policy: z.infer<typeof policySchema> | null; metadata: MemoryPolicyMetadata | null; reasons: readonly MemoryPolicyReason[] }> {
  const parsed = policySchema.safeParse(rawPolicy);
  if (!parsed.success) return Object.freeze({ policy: null, metadata: null, reasons: Object.freeze(["POLICY_UNAVAILABLE"] as MemoryPolicyReason[]) });
  const policy = parsed.data;
  const expectedDigest = hash(policyArtifact(policy));
  const reasons: MemoryPolicyReason[] = [];
  if (policy.policySha256 !== expectedDigest) reasons.push("POLICY_DIGEST_DRIFT");
  if (policy.revoked) reasons.push("POLICY_REVOKED");
  if (!policy.active || policy.current === false) reasons.push("POLICY_UNAVAILABLE");
  const effectiveFrom = validDate(policy.effectiveFrom);
  const effectiveUntil = policy.effectiveUntil === null ? null : validDate(policy.effectiveUntil);
  if (!effectiveFrom || (policy.effectiveUntil !== null && !effectiveUntil)) reasons.push("POLICY_UNAVAILABLE");
  if (effectiveFrom && cutoff < effectiveFrom) reasons.push("POLICY_OUTSIDE_EFFECTIVE_WINDOW");
  if (effectiveUntil && cutoff >= effectiveUntil) reasons.push("POLICY_OUTSIDE_EFFECTIVE_WINDOW");
  return Object.freeze({ policy, metadata: policyMetadata(policy), reasons: sortedReasons(reasons) });
}

function safetyState(rawSafety: unknown): readonly MemoryPolicyReason[] {
  if (rawSafety === null || rawSafety === undefined) return Object.freeze(["SAFETY_PREFLIGHT_REQUIRED"]);
  const parsed = safetyDecisionSchema.safeParse(rawSafety);
  if (!parsed.success) return Object.freeze([isModelOverride(rawSafety) ? "MODEL_OVERRIDE" : "SAFETY_PREFLIGHT_INVALID"]);
  if (parsed.data.decision === "urgent") return Object.freeze(["URGENT_PREFLIGHT"]);
  if (parsed.data.decision !== "not_urgent") return Object.freeze(["SAFETY_NON_CONTINUE"]);
  return Object.freeze([]);
}

function candidateState(rawCandidate: unknown): Readonly<{ candidate: z.infer<typeof candidateSchema> | null; reasons: readonly MemoryPolicyReason[] }> {
  const parsed = candidateSchema.safeParse(rawCandidate);
  if (parsed.success) return Object.freeze({ candidate: parsed.data, reasons: Object.freeze([]) });
  return Object.freeze({ candidate: null, reasons: Object.freeze([isModelOverride(rawCandidate) ? "MODEL_OVERRIDE" : "INVALID_INPUT"] as MemoryPolicyReason[]) });
}

function classifyText(candidate: z.infer<typeof candidateSchema>): Readonly<{ prohibition: readonly MemoryPolicyReason[]; review: readonly MemoryPolicyReason[] }> {
  const text = normalizeText(candidate.text);
  const prohibition: MemoryPolicyReason[] = [];
  const review: MemoryPolicyReason[] = [];
  if (!KNOWN_TYPES.has(candidate.memoryType as PolicyMemoryType)) prohibition.push("UNKNOWN_MEMORY_TYPE");
  if (candidate.subject === "other" || thirdPartyPattern.test(text)) prohibition.push("THIRD_PARTY_DATA");
  if (candidate.subject === "unknown") review.push("UNKNOWN_SUBJECT");
  if (diagnosisPattern.test(text)) prohibition.push("DIAGNOSIS_GUESS");
  if (medicationPattern.test(text)) prohibition.push("MEDICATION_RECOMMENDATION");
  if (dosePattern.test(text)) prohibition.push("DOSE_OR_ADMINISTRATION_AUTHORIZATION");
  if (urgentPattern.test(text)) prohibition.push("URGENT_CONTENT");
  if (secretPattern.test(text)) prohibition.push("SECRET_OR_CREDENTIAL");
  if (operationalPattern.test(text)) prohibition.push("OPERATIONAL_ABUSE");
  if (ambiguityPattern.test(text)) review.push("AMBIGUOUS_CONTENT");
  return Object.freeze({ prohibition: sortedReasons(prohibition), review: sortedReasons(review) });
}

function decisionDigest(value: Readonly<Record<string, unknown>>): Sha256Hex {
  return hash({ schemaVersion: POLICY_SCHEMA_VERSION, decision: value });
}

function baseClassification(
  candidate: z.infer<typeof candidateSchema> | null,
  cutoff: Date,
  metadata: MemoryPolicyMetadata | null,
  policy: z.infer<typeof policySchema> | null,
  prohibition: readonly MemoryPolicyReason[],
  review: readonly MemoryPolicyReason[],
): MemoryPolicyClassification {
  const memoryType = candidate?.memoryType ?? "unknown";
  const sensitivity = sensitivityFor(memoryType);
  const confirmation = confirmationFor(sensitivity);
  const allProhibitions = sortedReasons(prohibition);
  const allReview = sortedReasons(review);
  const status: MemoryPolicyClassification["status"] = allProhibitions.length > 0 ? "denied" : allReview.length > 0 ? "review_required" : "allowed";
  const policyUsable = policy !== null && metadata !== null;
  const maxDays = policyUsable ? policy.retentionDays[sensitivity] : null;
  const allowedPurpose = status === "allowed" && policyUsable ? PURPOSE : null;
  const retention = Object.freeze({ eligible: status === "allowed" && policyUsable, maxDays, cutoffAt: cutoff.toISOString(), expiresAt: null });
  const candidateInputSha256 = candidate?.inputSha256
    ? candidate.inputSha256 as Sha256Hex
    : candidate ? candidateDigest(candidate) : null;
  const payload = {
    status,
    sensitivity,
    allowedPurpose,
    confirmation,
    retention,
    prohibitionReasons: allProhibitions,
    reviewReasons: allReview,
    policy: metadata,
    candidateInputSha256,
  };
  return deepFreeze({ ...payload, decisionSha256: decisionDigest(payload) });
}

export const DEFAULT_MEMORY_CONFIRMATION_POLICY: MemoryConfirmationPolicy = deepFreeze({
  policyId: POLICY_ID,
  policyVersion: DEFAULT_POLICY_VERSION,
  policySha256: hash(policyArtifact({
    policyId: POLICY_ID,
    policyVersion: DEFAULT_POLICY_VERSION,
    allowedPurpose: PURPOSE,
    retentionDays: { low: 365, medium: 180, high: 90 },
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
  })) as Sha256Hex,
  allowedPurpose: PURPOSE,
  retentionDays: { low: 365, medium: 180, high: 90 },
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveUntil: null,
  active: true,
  current: true,
  revoked: false,
});

export function classifyMemoryCandidate(input: MemoryCandidatePolicyInput): MemoryPolicyClassification {
  const envelope = envelopeSchema.safeParse(input);
  const cutoff = validDate(input?.cutoff);
  const rawCandidate = input && typeof input === "object" ? input.candidate : null;
  const candidateResult = candidateState(rawCandidate);
  const safeCutoff = cutoff ?? new Date(0);
  const policyResult = policyState(input && typeof input === "object" ? input.policy : null, safeCutoff);
  const safetyReasons = safetyState(input && typeof input === "object" ? input.safetyDecision : null);
  const content = candidateResult.candidate ? classifyText(candidateResult.candidate) : { prohibition: [], review: [] };
  const digestReasons: readonly MemoryPolicyReason[] = candidateResult.candidate?.inputSha256
    && candidateResult.candidate.inputSha256 !== computeMemoryCandidateInputDigest(candidateResult.candidate)
    ? ["CANDIDATE_DIGEST_MISMATCH"]
    : [];
  const invalidCutoff: readonly MemoryPolicyReason[] = cutoff ? [] : ["INVALID_INPUT"];
  const envelopeReasons: readonly MemoryPolicyReason[] = envelope.success
    ? []
    : [isModelOverride(input) ? "MODEL_OVERRIDE" : "INVALID_INPUT"];
  return baseClassification(
    candidateResult.candidate,
    safeCutoff,
    policyResult.metadata,
    policyResult.policy,
    [...candidateResult.reasons, ...policyResult.reasons, ...safetyReasons, ...content.prohibition, ...digestReasons, ...invalidCutoff, ...envelopeReasons],
    content.review,
  );
}

export function computeMemoryConfirmationDigest(input: Readonly<{
  candidateId: string | null;
  candidateInputSha256: string;
  purpose: MemoryAllowedPurpose;
  expiresAt: string;
  policy: MemoryPolicyMetadata;
}>): Sha256Hex {
  return hash({ schemaVersion: "clinical-memory-confirmation.v1", ...input });
}

function evaluateExpiry(
  candidate: z.infer<typeof candidateSchema>,
  confirmation: z.infer<typeof confirmationSchema>,
  cutoff: Date,
  maxDays: number,
): readonly MemoryPolicyReason[] {
  const reasons: MemoryPolicyReason[] = [];
  const expiry = validDate(confirmation.expiresAt);
  if (!expiry) reasons.push("EXPIRY_INVALID");
  if (expiry && (expiry <= cutoff || expiry.getTime() > cutoff.getTime() + maxDays * DAY_MS)) reasons.push("EXPIRY_OUTSIDE_POLICY");
  if (candidate.expiresAt !== undefined) {
    const candidateExpiry = candidate.expiresAt === null ? null : validDate(candidate.expiresAt);
    if (!candidateExpiry
      || candidateExpiry <= cutoff
      || candidateExpiry.getTime() > cutoff.getTime() + maxDays * DAY_MS
      || (expiry && expiry > candidateExpiry)) reasons.push("EXPIRY_OUTSIDE_POLICY");
  }
  return sortedReasons(reasons);
}

function evaluateInvalid(
  classification: MemoryPolicyClassification,
  reasons: readonly MemoryPolicyReason[] = [],
  confirmationSha256: Sha256Hex | null = null,
): MemoryConfirmationEvaluation {
  const prohibition = sortedReasons([...classification.prohibitionReasons, ...reasons]);
  const review = classification.reviewReasons;
  const status: MemoryConfirmationEvaluation["status"] = prohibition.length > 0 ? "denied" : "review_required";
  const payload = {
    ok: false,
    status,
    sensitivity: classification.sensitivity,
    allowedPurpose: classification.allowedPurpose,
    confirmation: classification.confirmation,
    retention: classification.retention,
    prohibitionReasons: prohibition,
    reviewReasons: review,
    policy: classification.policy,
    candidateInputSha256: classification.candidateInputSha256,
    confirmationSha256,
  };
  return deepFreeze({ ...payload, decisionSha256: decisionDigest(payload) });
}

export function evaluateMemoryConfirmation(input: MemoryConfirmationInput): MemoryConfirmationEvaluation {
  const envelope = confirmationEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    const cutoff = validDate(input?.cutoff) ?? new Date(0);
    const classification = classifyMemoryCandidate({
      candidate: (input as { candidate?: unknown } | null)?.candidate as MemoryPolicyCandidate,
      policy: (input as { policy?: MemoryConfirmationPolicy | null } | null)?.policy,
      safetyDecision: (input as { safetyDecision?: unknown } | null)?.safetyDecision as SafetyDecision | undefined,
      cutoff,
    });
    return evaluateInvalid(classification, [hasModelOverrideInConfirmationInput(input) ? "MODEL_OVERRIDE" : "CONFIRMATION_INVALID"]);
  }
  const parsed = envelope.data;
  const classification = classifyMemoryCandidate({ candidate: parsed.candidate, policy: parsed.policy as MemoryConfirmationPolicy | null, safetyDecision: parsed.safetyDecision as SafetyDecision | undefined, cutoff: parsed.cutoff });
  if (classification.status !== "allowed") return evaluateInvalid(classification);
  const policy = policySchema.safeParse(parsed.policy).success ? policySchema.parse(parsed.policy) : null;
  const cutoff = validDate(parsed.cutoff);
  if (!policy || !classification.policy || !cutoff) return evaluateInvalid(classification, ["POLICY_UNAVAILABLE"]);
  const reasons: MemoryPolicyReason[] = [];
  const candidateInputSha256 = parsed.candidate.inputSha256;
  if (!candidateInputSha256) reasons.push("CANDIDATE_DIGEST_REQUIRED");
  if (parsed.confirmation.purpose !== PURPOSE) reasons.push("PURPOSE_NOT_ALLOWED");
  if (parsed.confirmation.candidateInputSha256 !== candidateInputSha256) reasons.push("CANDIDATE_DIGEST_MISMATCH");
  if (parsed.confirmation.mode !== classification.confirmation.mode) reasons.push("CONFIRMATION_MODE_MISMATCH");
  if (parsed.confirmation.explicit !== true) reasons.push("CONFIRMATION_REQUIRED");
  const maxDays = policy.retentionDays[classification.sensitivity];
  reasons.push(...evaluateExpiry(parsed.candidate, parsed.confirmation, cutoff, maxDays));
  if (classification.confirmation.mode === "digest_bound" && candidateInputSha256) {
    const expected = computeMemoryConfirmationDigest({
      candidateId: parsed.candidate.candidateId ?? null,
      candidateInputSha256,
      purpose: PURPOSE,
      expiresAt: parsed.confirmation.expiresAt,
      policy: classification.policy,
    });
    if (parsed.confirmation.confirmationSha256 !== expected) reasons.push("CONFIRMATION_DIGEST_MISMATCH");
  }
  const uniqueReasons = sortedReasons(reasons);
  if (uniqueReasons.length > 0) return evaluateInvalid(classification, uniqueReasons, parsed.confirmation.confirmationSha256 as Sha256Hex);
  const retention = Object.freeze({
    eligible: true,
    maxDays,
    cutoffAt: cutoff.toISOString(),
    expiresAt: new Date(parsed.confirmation.expiresAt).toISOString(),
  });
  const payload = {
    ok: true,
    status: "confirmed" as const,
    sensitivity: classification.sensitivity,
    allowedPurpose: PURPOSE,
    confirmation: classification.confirmation,
    retention,
    prohibitionReasons: Object.freeze([]) as readonly MemoryPolicyReason[],
    reviewReasons: Object.freeze([]) as readonly MemoryPolicyReason[],
    policy: classification.policy,
    candidateInputSha256: candidateInputSha256 as Sha256Hex,
    confirmationSha256: parsed.confirmation.confirmationSha256 as Sha256Hex,
  };
  return deepFreeze({ ...payload, decisionSha256: decisionDigest(payload) });
}
