import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  isAuthorizedChildScopeActive,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import {
  classifyMemoryCandidate,
  computeMemoryCandidateInputDigest,
  DEFAULT_MEMORY_CONFIRMATION_POLICY,
  type MemoryConfirmationPolicy,
  type MemoryPolicyClassification,
  type MemoryPolicyMetadata,
} from "../../clinical/memory/confirmation-policy.ts";
import {
  memoryCandidateInputSchema,
  type MemoryCandidate,
  type MemorySensitivity,
  type MemoryType,
} from "../../clinical/memory/types.ts";
import type { Sha256Hex } from "../../clinical/governance/source-types.ts";
import type { SafetyDecision } from "../../safety/message-types.ts";

const UUID = z.string().uuid();
const INSTANT = z.string().datetime({ offset: true });
const IDEMPOTENCY_KEY = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u);
const ACTOR_SCOPE_VERSION = z.string().regex(/^m:[1-9][0-9]*:a:[1-9][0-9]*$/u);
const SOURCE_TEXT = z.string().min(1).max(64_000);
// The service only records a verified guardian message span; model confidence is not accepted.
const TRUSTED_CAPTURE_CONFIDENCE = 1;
const SAFETY_DECISION = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("urgent"),
    responseMode: z.literal("emergency_recommendation"),
    ruleCodes: z.array(z.string().min(1).max(128)).min(1).max(100),
    copyKey: z.enum(["emergency_department_es_co_v1", "emergency_department_en_us_v1"]),
  }).strict(),
  z.object({
    decision: z.literal("clarification_required"),
    responseMode: z.literal("clarify"),
    question: z.enum(["clarify_subject_or_timing_v1", "clarify_temperature_unit_v1"]),
  }).strict(),
  z.object({
    decision: z.literal("professional_review"),
    responseMode: z.literal("pediatrician_recommendation"),
    reasonCode: z.string().min(1).max(128),
  }).strict(),
  z.object({ decision: z.literal("not_urgent"), responseMode: z.literal("continue") }).strict(),
  z.object({
    decision: z.literal("indeterminate"),
    responseMode: z.literal("abstain"),
    reasonCode: z.string().min(1).max(128),
  }).strict(),
]);

const SESSION_CONTEXT = z.object({
  sessionId: UUID,
  ownerUserId: UUID,
  careSpaceId: UUID,
  childId: UUID,
  authorizationVersion: ACTOR_SCOPE_VERSION,
  status: z.literal("active"),
  cutoffAt: INSTANT,
  sourceMessage: z.object({
    id: UUID,
    agentSessionId: UUID,
    text: SOURCE_TEXT,
    capturedAt: INSTANT,
    actorType: z.literal("guardian"),
    actorUserId: UUID,
    status: z.literal("completed"),
  }).strict(),
  safetyDecision: SAFETY_DECISION,
}).strict();

const CAPTURE_INPUT = z.object({
  memoryType: z.enum([
    "symptom",
    "history",
    "allergy",
    "medication",
    "vaccine",
    "measurement",
    "development",
    "preference",
    "summary",
  ]),
  content: memoryCandidateInputSchema.shape.content,
  idempotencyKey: IDEMPOTENCY_KEY,
}).strict();

const ROW = z.object({
  id: UUID,
  careSpaceId: UUID,
  childId: UUID,
  createdBy: UUID,
  memoryType: CAPTURE_INPUT.shape.memoryType,
  candidateText: z.string().min(1).max(8_000),
  provenanceType: z.literal("chat"),
  provenanceSourceId: z.string().min(1).max(256).refine((value) => !/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)),
  provenanceCapturedAt: INSTANT,
  sourceSpanStart: z.number().int().nonnegative(),
  sourceSpanEnd: z.number().int().positive(),
  sourceSessionId: UUID,
  sourceMessageId: UUID,
  extractionConfidence: z.number().finite().min(0).max(1),
  sensitivity: z.enum(["low", "medium", "high"]),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  idempotencyKey: IDEMPOTENCY_KEY,
  lifecycle: z.literal("pending"),
  expiresAt: INSTANT,
  createdAt: INSTANT,
}).strict().superRefine((value, context) => {
  if (value.sourceSpanEnd <= value.sourceSpanStart) {
    context.addIssue({ code: "custom", path: ["sourceSpanEnd"], message: "source_span" });
  }
  if (new Date(value.expiresAt) <= new Date(value.createdAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "expiry" });
  }
});

const MEMORY_PERMISSIONS = new Set(["read", "record", "manage_documents", "manage_medication", "manage_guardians"]);
const POLICY_FAILURES = new Set([
  "POLICY_UNAVAILABLE",
  "POLICY_REVOKED",
  "POLICY_DIGEST_DRIFT",
  "POLICY_OUTSIDE_EFFECTIVE_WINDOW",
]);
const SAFETY_FAILURES = new Set([
  "SAFETY_PREFLIGHT_REQUIRED",
  "SAFETY_PREFLIGHT_INVALID",
  "SAFETY_NON_CONTINUE",
  "URGENT_PREFLIGHT",
]);

type CandidatePolicyType = MemoryType;

export type MemoryCandidateSessionContext = Readonly<z.infer<typeof SESSION_CONTEXT> & {
  safetyDecision: SafetyDecision;
}>;

export type MemoryCandidateCaptureInput = Readonly<z.infer<typeof CAPTURE_INPUT>>;

export type MemoryCandidateRepositoryRow = Readonly<z.infer<typeof ROW>>;

export type MemoryCandidateWrite = Readonly<{
  id: string;
  careSpaceId: string;
  childId: string;
  createdBy: string;
  memoryType: CandidatePolicyType;
  candidateText: string;
  provenanceType: "chat";
  provenanceSourceId: string;
  provenanceCapturedAt: string;
  sourceSpanStart: number;
  sourceSpanEnd: number;
  sourceSessionId: string;
  sourceMessageId: string;
  extractionConfidence: number;
  sensitivity: MemorySensitivity;
  inputSha256: Sha256Hex;
  idempotencyKey: string;
  lifecycle: "pending";
  expiresAt: string;
  createdAt: string;
}>;

export type MemoryCandidateTransactionContext = Readonly<{
  scope: AuthorizedChildScope;
  sessionContext: MemoryCandidateSessionContext;
}>;

export type MemoryCandidateRepositoryResult =
  | Readonly<{ outcome: "created" | "idempotent_replay" | "source_replay"; row: MemoryCandidateRepositoryRow }>
  | Readonly<{ outcome: "conflict" }>;

export interface MemoryCandidateRepository {
  /** The adapter must enforce scope predicates and exact source/idempotency convergence atomically. */
  capturePending(context: MemoryCandidateTransactionContext, write: MemoryCandidateWrite): Promise<MemoryCandidateRepositoryResult>;
  listPending(context: MemoryCandidateTransactionContext): Promise<readonly MemoryCandidateRepositoryRow[]>;
}

export type MemoryCandidateServiceDependencies = Readonly<{
  repository: MemoryCandidateRepository;
  policy?: MemoryConfirmationPolicy | null;
}>;

export type MemoryCandidateFailureCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "SOURCE_SPAN_MISMATCH"
  | "SAFETY_BLOCKED"
  | "POLICY_DENIED"
  | "POLICY_REVIEW_REQUIRED"
  | "POLICY_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "STORAGE_UNAVAILABLE";

export type MemoryCandidateFailure = Readonly<{
  ok: false;
  status: "unavailable";
  code: MemoryCandidateFailureCode;
}>;

export type MemoryCandidateConfirmationPreview = Readonly<{
  candidateId: string;
  candidateInputSha256: Sha256Hex;
  sensitivity: MemorySensitivity;
  allowedPurpose: "guardian_controlled_memory";
  confirmation: Readonly<{ required: true; mode: "explicit" | "digest_bound" }>;
  expiresAt: string;
  policy: MemoryPolicyMetadata;
  policyDecisionSha256: Sha256Hex;
}>;

export type MemoryCandidateCaptureSuccess = Readonly<{
  ok: true;
  status: "pending";
  outcome: "created" | "idempotent_replay" | "source_replay";
  candidate: MemoryCandidate;
  confirmationPreview: MemoryCandidateConfirmationPreview;
}>;

export type MemoryCandidateCaptureResult = MemoryCandidateCaptureSuccess | MemoryCandidateFailure;

export type MemoryCandidateListSuccess = Readonly<{
  ok: true;
  status: "available";
  candidates: readonly MemoryCandidate[];
}>;

export type MemoryCandidateListResult = MemoryCandidateListSuccess | MemoryCandidateFailure;

export type MemoryCandidateServiceOptions = Readonly<{ now?: () => Date }>;

function hash(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function canonicalText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function deterministicCandidateId(value: unknown): string {
  const hex = hash({ schemaVersion: "clinical-memory-candidate-id.v1", value }).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function sameInstant(left: string, right: string): boolean {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return Number.isFinite(leftDate.getTime())
    && Number.isFinite(rightDate.getTime())
    && leftDate.getTime() === rightDate.getTime();
}

function validScope(scope: AuthorizedChildScope, permission: "read" | "record", now: Date): boolean {
  try {
    return Object.isFrozen(scope)
      && Object.isFrozen(scope.permissions)
      && Object.isFrozen(scope.issuedAt)
      && Object.isFrozen(scope.expiresAt)
      && validDate(scope.issuedAt)
      && validDate(scope.expiresAt)
      && typeof scope.actorUserId === "string"
      && UUID.safeParse(scope.actorUserId).success
      && typeof scope.careSpaceId === "string"
      && UUID.safeParse(scope.careSpaceId).success
      && typeof scope.childId === "string"
      && UUID.safeParse(scope.childId).success
      && Array.isArray(scope.permissions)
      && scope.permissions.length > 0
      && scope.permissions.every((value) => typeof value === "string" && MEMORY_PERMISSIONS.has(value))
      && new Set(scope.permissions).size === scope.permissions.length
      && ACTOR_SCOPE_VERSION.safeParse(scope.authorizationVersion).success
      && (scope.countryOfCare === "CO" || scope.countryOfCare === "US")
      && typeof scope.timezone === "string"
      && (() => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: scope.timezone }).format();
          return true;
        } catch {
          return false;
        }
      })()
      && scope.expiresAt > scope.issuedAt
      && isAuthorizedChildScopeActive(scope, now)
      && hasPermission(scope, permission, now);
  } catch {
    return false;
  }
}

function parseSessionContext(value: unknown): MemoryCandidateSessionContext | null {
  const parsed = SESSION_CONTEXT.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data as MemoryCandidateSessionContext;
}

function sameSessionContext(scope: AuthorizedChildScope, context: MemoryCandidateSessionContext): boolean {
  return context.ownerUserId === scope.actorUserId
    && context.careSpaceId === scope.careSpaceId
    && context.childId === scope.childId
    && context.authorizationVersion === scope.authorizationVersion
    && context.status === "active";
}

function trustedSourceIsBound(
  scope: AuthorizedChildScope,
  context: MemoryCandidateSessionContext,
  current: Date,
): boolean {
  const cutoff = new Date(context.cutoffAt);
  const capturedAt = new Date(context.sourceMessage.capturedAt);
  return context.sourceMessage.agentSessionId === context.sessionId
    && context.sourceMessage.actorType === "guardian"
    && context.sourceMessage.actorUserId === scope.actorUserId
    && context.sourceMessage.status === "completed"
    && Number.isFinite(cutoff.getTime())
    && Number.isFinite(capturedAt.getTime())
    && capturedAt <= cutoff
    && cutoff <= current;
}

function safePolicy(policy: MemoryConfirmationPolicy | null | undefined): MemoryConfirmationPolicy | null {
  return policy ?? null;
}

function policyFailure(classification: MemoryPolicyClassification): MemoryCandidateFailureCode {
  if (classification.prohibitionReasons.some((reason) => SAFETY_FAILURES.has(reason))) return "SAFETY_BLOCKED";
  if (classification.prohibitionReasons.some((reason) => POLICY_FAILURES.has(reason))) return "POLICY_UNAVAILABLE";
  if (classification.reviewReasons.length > 0) return "POLICY_REVIEW_REQUIRED";
  return "POLICY_DENIED";
}

function rowMatchesWrite(row: MemoryCandidateRepositoryRow, write: MemoryCandidateWrite, allowDifferentIdempotencyKey = false): boolean {
  return row.id === write.id
    && row.careSpaceId === write.careSpaceId
    && row.childId === write.childId
    && row.createdBy === write.createdBy
    && row.memoryType === write.memoryType
    && row.candidateText === write.candidateText
    && row.provenanceType === write.provenanceType
    && row.provenanceSourceId === write.provenanceSourceId
    && sameInstant(row.provenanceCapturedAt, write.provenanceCapturedAt)
    && row.sourceSpanStart === write.sourceSpanStart
    && row.sourceSpanEnd === write.sourceSpanEnd
    && row.sourceSessionId === write.sourceSessionId
    && row.sourceMessageId === write.sourceMessageId
    && row.extractionConfidence === write.extractionConfidence
    && row.sensitivity === write.sensitivity
    && row.inputSha256 === write.inputSha256
    && (allowDifferentIdempotencyKey || row.idempotencyKey === write.idempotencyKey)
    && row.lifecycle === "pending"
    && sameInstant(row.expiresAt, write.expiresAt);
}

function projectCandidate(row: MemoryCandidateRepositoryRow): MemoryCandidate {
  return Object.freeze({
    memoryType: row.memoryType,
    content: Object.freeze({
      text: row.candidateText,
      sourceSpan: Object.freeze({ start: row.sourceSpanStart, end: row.sourceSpanEnd }),
    }),
    provenance: Object.freeze({
      type: row.provenanceType,
      sourceId: row.provenanceSourceId,
      capturedAt: row.provenanceCapturedAt,
      sourceSpan: Object.freeze({ start: row.sourceSpanStart, end: row.sourceSpanEnd }),
    }),
    id: row.id as MemoryCandidate["id"],
    careSpaceId: row.careSpaceId as MemoryCandidate["careSpaceId"],
    childId: row.childId as MemoryCandidate["childId"],
    extractionConfidence: row.extractionConfidence,
    sensitivity: row.sensitivity,
    inputSha256: row.inputSha256 as Sha256Hex,
    lifecycle: row.lifecycle,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  });
}

function confirmationPreview(
  candidate: MemoryCandidate,
  classification: MemoryPolicyClassification,
  expiresAt: string,
): MemoryCandidateConfirmationPreview | null {
  if (!classification.policy || classification.allowedPurpose !== "guardian_controlled_memory" || classification.retention.maxDays === null) return null;
  return Object.freeze({
    candidateId: candidate.id,
    candidateInputSha256: candidate.inputSha256,
    sensitivity: classification.sensitivity,
    allowedPurpose: "guardian_controlled_memory",
    confirmation: classification.confirmation,
    expiresAt,
    policy: classification.policy,
    policyDecisionSha256: classification.decisionSha256,
  });
}

export class MemoryCandidateService {
  private readonly policy: MemoryConfirmationPolicy | null;
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: MemoryCandidateServiceDependencies,
    options: MemoryCandidateServiceOptions = {},
  ) {
    this.policy = safePolicy(dependencies.policy === undefined ? DEFAULT_MEMORY_CONFIRMATION_POLICY : dependencies.policy);
    this.now = options.now ?? (() => new Date());
  }

  async capture(
    scope: AuthorizedChildScope,
    rawSessionContext: MemoryCandidateSessionContext,
    rawInput: MemoryCandidateCaptureInput,
  ): Promise<MemoryCandidateCaptureResult> {
    const current = this.readNow();
    if (!current) return this.failure("NOT_AUTHORIZED");
    const sessionContext = parseSessionContext(rawSessionContext);
    if (!validScope(scope, "record", current)
      || sessionContext === null
      || !sameSessionContext(scope, sessionContext)
      || !trustedSourceIsBound(scope, sessionContext, current)) {
      return this.failure("NOT_AUTHORIZED");
    }
    const cutoff = new Date(sessionContext.cutoffAt);
    if (!validDate(cutoff) || new Date(sessionContext.sourceMessage.capturedAt) > cutoff || cutoff > current) {
      return this.failure("INVALID_INPUT");
    }
    const parsed = CAPTURE_INPUT.safeParse(rawInput);
    if (!parsed.success) return this.failure("INVALID_INPUT");
    const candidateInput = parsed.data;
    const sourceSpan = candidateInput.content.sourceSpan;
    const sourceSlice = sessionContext.sourceMessage.text.slice(sourceSpan.start, sourceSpan.end);
    if (sourceSpan.end > sessionContext.sourceMessage.text.length || sourceSlice !== candidateInput.content.text) {
      return this.failure("SOURCE_SPAN_MISMATCH");
    }
    const text = canonicalText(candidateInput.content.text);
    if (text.length === 0 || text.length > 8_000) return this.failure("INVALID_INPUT");
    const candidateId = deterministicCandidateId({
      actorUserId: scope.actorUserId,
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      sourceSessionId: sessionContext.sessionId,
      sourceMessageId: sessionContext.sourceMessage.id,
      sourceSpan,
      memoryType: candidateInput.memoryType,
      text,
    });
    const policyCandidate = {
      memoryType: candidateInput.memoryType,
      text,
      provenanceType: "chat" as const,
      candidateId,
    };
    const inputSha256 = computeMemoryCandidateInputDigest(policyCandidate);
    const classification = classifyMemoryCandidate({
      candidate: { ...policyCandidate, inputSha256 },
      policy: this.policy,
      safetyDecision: sessionContext.safetyDecision,
      cutoff,
    });
    if (classification.status !== "allowed" || !classification.retention.eligible || classification.retention.maxDays === null) {
      return this.failure(policyFailure(classification));
    }
    const expiresAt = new Date(cutoff.getTime() + classification.retention.maxDays * 24 * 60 * 60 * 1_000);
    if (!validDate(expiresAt) || expiresAt <= cutoff) return this.failure("POLICY_UNAVAILABLE");
    const write: MemoryCandidateWrite = Object.freeze({
      id: candidateId,
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      createdBy: scope.actorUserId,
      memoryType: candidateInput.memoryType,
      candidateText: text,
      provenanceType: "chat",
      provenanceSourceId: sessionContext.sourceMessage.id,
      provenanceCapturedAt: new Date(sessionContext.sourceMessage.capturedAt).toISOString(),
      sourceSpanStart: sourceSpan.start,
      sourceSpanEnd: sourceSpan.end,
      sourceSessionId: sessionContext.sessionId,
      sourceMessageId: sessionContext.sourceMessage.id,
      extractionConfidence: TRUSTED_CAPTURE_CONFIDENCE,
      sensitivity: classification.sensitivity,
      inputSha256,
      idempotencyKey: candidateInput.idempotencyKey,
      lifecycle: "pending",
      expiresAt: expiresAt.toISOString(),
      createdAt: cutoff.toISOString(),
    });

    try {
      const stored = await this.dependencies.repository.capturePending({ scope, sessionContext }, write);
      if (stored.outcome === "conflict") return this.failure("IDEMPOTENCY_CONFLICT");
      const row = ROW.safeParse(stored.row);
      if (!row.success
        || !rowMatchesWrite(row.data, write, stored.outcome === "source_replay")
        || new Date(row.data.expiresAt) <= current) return this.failure("STORAGE_UNAVAILABLE");
      const candidate = projectCandidate(row.data);
      const preview = confirmationPreview(candidate, classification, row.data.expiresAt);
      if (!preview) return this.failure("POLICY_UNAVAILABLE");
      return Object.freeze({
        ok: true as const,
        status: "pending" as const,
        outcome: stored.outcome,
        candidate,
        confirmationPreview: preview,
      });
    } catch {
      return this.failure("STORAGE_UNAVAILABLE");
    }
  }

  async listPending(
    scope: AuthorizedChildScope,
    rawSessionContext: MemoryCandidateSessionContext,
  ): Promise<MemoryCandidateListResult> {
    const current = this.readNow();
    if (!current) return this.failure("NOT_AUTHORIZED");
    const sessionContext = parseSessionContext(rawSessionContext);
    if (!validScope(scope, "read", current)
      || sessionContext === null
      || !sameSessionContext(scope, sessionContext)
      || !trustedSourceIsBound(scope, sessionContext, current)) {
      return this.failure("NOT_AUTHORIZED");
    }
    try {
      const rows = await this.dependencies.repository.listPending({ scope, sessionContext });
      if (!Array.isArray(rows) || rows.length > 1_000) return this.failure("STORAGE_UNAVAILABLE");
      const candidates: MemoryCandidate[] = [];
      for (const rawRow of rows) {
        const row = ROW.safeParse(rawRow);
        if (!row.success
          || row.data.careSpaceId !== scope.careSpaceId
          || row.data.childId !== scope.childId
          || row.data.lifecycle !== "pending"
          || !Number.isFinite(new Date(row.data.expiresAt).getTime())
          || new Date(row.data.expiresAt) <= current) return this.failure("STORAGE_UNAVAILABLE");
        candidates.push(projectCandidate(row.data));
      }
      candidates.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
      return Object.freeze({ ok: true as const, status: "available" as const, candidates: Object.freeze(candidates) });
    } catch {
      return this.failure("STORAGE_UNAVAILABLE");
    }
  }

  private readNow(): Date | null {
    try {
      const value = this.now();
      return validDate(value) ? new Date(value.getTime()) : null;
    } catch {
      return null;
    }
  }

  private failure(code: MemoryCandidateFailureCode): MemoryCandidateFailure {
    return Object.freeze({ ok: false as const, status: "unavailable" as const, code });
  }
}

export function createMemoryCandidateService(
  dependencies: MemoryCandidateServiceDependencies,
  options: MemoryCandidateServiceOptions = {},
): MemoryCandidateService {
  return new MemoryCandidateService(dependencies, options);
}
