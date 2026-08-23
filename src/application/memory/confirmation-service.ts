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
  DEFAULT_MEMORY_CONFIRMATION_POLICY,
  evaluateMemoryConfirmation,
  type MemoryConfirmationPolicy,
} from "../../clinical/memory/confirmation-policy.ts";
import {
  confirmedMemoryItemSchema,
  type ConfirmedMemoryItem,
} from "../../clinical/memory/types.ts";
import type { SafetyDecision } from "../../safety/message-types.ts";
import type {
  MemoryConfirmationContext,
  MemoryConfirmationCorrection,
  MemoryConfirmationDecisionInput,
  MemoryConfirmationItem,
  MemoryConfirmationRepository,
  MemoryConfirmationResult as RepositoryResult,
} from "../../persistence/supabase/memory-confirmation-repository.ts";

const UUID = z.string().uuid();
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const AUTHORIZATION_VERSION = z.string().regex(/^m:[1-9][0-9]*:a:[1-9][0-9]*$/u);
const IDEMPOTENCY_KEY = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u);
const MEMORY_TYPE = z.enum([
  "symptom", "history", "allergy", "medication", "vaccine",
  "measurement", "development", "preference", "summary",
]);
const PROVENANCE_TYPE = z.enum(["guardian", "professional", "import", "document", "chat", "system"]);
const SENSITIVITY = z.enum(["low", "medium", "high"]);
const SAFETY_DECISION = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("urgent"), responseMode: z.literal("emergency_recommendation"), ruleCodes: z.array(z.string().min(1).max(128)).min(1).max(100), copyKey: z.enum(["emergency_department_es_co_v1", "emergency_department_en_us_v1"]) }).strict(),
  z.object({ decision: z.literal("clarification_required"), responseMode: z.literal("clarify"), question: z.enum(["clarify_subject_or_timing_v1", "clarify_temperature_unit_v1"]) }).strict(),
  z.object({ decision: z.literal("professional_review"), responseMode: z.literal("pediatrician_recommendation"), reasonCode: z.string().min(1).max(128) }).strict(),
  z.object({ decision: z.literal("not_urgent"), responseMode: z.literal("continue") }).strict(),
  z.object({ decision: z.literal("indeterminate"), responseMode: z.literal("abstain"), reasonCode: z.string().min(1).max(128) }).strict(),
]);

const SESSION_CONTEXT = z.object({
  sessionId: UUID,
  ownerUserId: UUID,
  careSpaceId: UUID,
  childId: UUID,
  authorizationVersion: AUTHORIZATION_VERSION,
  status: z.literal("active"),
  cutoffAt: INSTANT,
  safetyDecision: SAFETY_DECISION,
}).strict();

const CANDIDATE = z.object({
  id: UUID,
  memoryType: MEMORY_TYPE,
  text: z.string().min(1).max(8_000).refine((value) => value.trim().length > 0),
  provenanceType: PROVENANCE_TYPE,
  provenanceSourceId: z.string().min(1).max(256).refine((value) => !/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)),
  provenanceCapturedAt: INSTANT,
  sourceSpanStart: z.number().int().nonnegative(),
  sourceSpanEnd: z.number().int().positive(),
  sourceSessionId: UUID.nullable(),
  sourceMessageId: UUID.nullable(),
  extractionConfidence: z.number().finite().min(0).max(1),
  sensitivity: SENSITIVITY,
  inputSha256: DIGEST,
  expiresAt: INSTANT,
}).strict().superRefine((value, context) => {
  if (value.sourceSpanEnd <= value.sourceSpanStart) {
    context.addIssue({ code: "custom", path: ["sourceSpanEnd"], message: "source_span" });
  }
});

const CONFIRM_INPUT = z.object({
  candidate: CANDIDATE,
  candidateInputSha256: DIGEST,
  policyDecisionSha256: DIGEST,
  confirmationSha256: DIGEST,
  purpose: z.literal("guardian_controlled_memory"),
  expiresAt: INSTANT,
  idempotencyKey: IDEMPOTENCY_KEY,
}).strict();

const CORRECT_INPUT = CONFIRM_INPUT.extend({
  correctedText: z.string().min(1).max(8_000).refine((value) => value.trim().length > 0),
  supersedesId: UUID,
}).strict();

const TERMINAL_INPUT = z.object({
  candidateId: UUID,
  candidateInputSha256: DIGEST,
  policySha256: DIGEST,
  confirmationSha256: DIGEST,
  idempotencyKey: IDEMPOTENCY_KEY,
}).strict();

const REVOKE_INPUT = TERMINAL_INPUT.extend({ memoryItemId: UUID }).strict();

export type MemoryConfirmationSessionContext = Readonly<z.infer<typeof SESSION_CONTEXT> & { safetyDecision: SafetyDecision }>;
export type MemoryConfirmationCandidateSnapshot = Readonly<z.infer<typeof CANDIDATE>>;
export type MemoryConfirmInput = Readonly<z.infer<typeof CONFIRM_INPUT>>;
export type MemoryCorrectInput = Readonly<z.infer<typeof CORRECT_INPUT>>;
export type MemoryRejectInput = Readonly<z.infer<typeof TERMINAL_INPUT>>;
export type MemoryRevokeInput = Readonly<z.infer<typeof REVOKE_INPUT>>;

export type MemoryConfirmationFailureCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "CANDIDATE_EXPIRED"
  | "PREVIEW_DRIFT"
  | "POLICY_DENIED"
  | "POLICY_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "STORAGE_UNAVAILABLE";

export type MemoryConfirmationFailure = Readonly<{
  ok: false;
  status: "unavailable";
  code: MemoryConfirmationFailureCode;
}>;

export type MemoryConfirmationSuccess = Readonly<{
  ok: true;
  status: "available";
  outcome: Exclude<RepositoryResult["outcome"], "conflict">;
  decisionId: string | null;
  eventId: string | null;
  eventKind: string | null;
  eventVersion: number | null;
  item: ConfirmedMemoryItem | null;
}>;

export type MemoryConfirmationActionResult = MemoryConfirmationSuccess | MemoryConfirmationFailure;
export type MemoryConfirmationGetResult = Readonly<{ ok: true; status: "available"; item: ConfirmedMemoryItem | null }> | MemoryConfirmationFailure;
export type MemoryConfirmationListResult = Readonly<{ ok: true; status: "available"; items: readonly ConfirmedMemoryItem[] }> | MemoryConfirmationFailure;

export type MemoryConfirmationServiceDependencies = Readonly<{
  repository: MemoryConfirmationRepository;
  policy?: MemoryConfirmationPolicy | null;
}>;

export type MemoryConfirmationServiceOptions = Readonly<{ now?: () => Date }>;

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function canonicalText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function deterministicUuid(value: unknown): string {
  const hex = createHash("sha256").update(canonicalize(value), "utf8").digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function scopeAllows(scope: AuthorizedChildScope, permission: "read" | "record", now: Date): boolean {
  try {
    return Object.isFrozen(scope)
      && Object.isFrozen(scope.permissions)
      && isAuthorizedChildScopeActive(scope, now)
      && hasPermission(scope, permission, now);
  } catch {
    return false;
  }
}

function trustedContext(
  scope: AuthorizedChildScope,
  rawContext: unknown,
  permission: "read" | "record",
  now: Date,
): MemoryConfirmationSessionContext | null {
  const parsed = SESSION_CONTEXT.safeParse(rawContext);
  if (!parsed.success || !scopeAllows(scope, permission, now)) return null;
  const context = parsed.data;
  const cutoff = new Date(context.cutoffAt);
  if (!validDate(cutoff)
    || cutoff > now
    || context.ownerUserId !== scope.actorUserId
    || context.careSpaceId !== scope.careSpaceId
    || context.childId !== scope.childId
    || context.authorizationVersion !== scope.authorizationVersion) return null;
  return context as MemoryConfirmationSessionContext;
}

function repositoryContext(scope: AuthorizedChildScope, context: MemoryConfirmationSessionContext): MemoryConfirmationContext {
  return Object.freeze({
    scope,
    sessionId: context.sessionId,
    authorizationVersion: context.authorizationVersion,
    cutoffAt: new Date(context.cutoffAt).toISOString(),
  });
}

function projectItem(raw: MemoryConfirmationItem, scope: AuthorizedChildScope): ConfirmedMemoryItem | null {
  if (raw.careSpaceId !== scope.careSpaceId || raw.childId !== scope.childId) return null;
  const parsed = confirmedMemoryItemSchema.safeParse({
    id: raw.id,
    careSpaceId: raw.careSpaceId,
    childId: raw.childId,
    memoryType: raw.memoryType,
    structuredContent: raw.structuredContent,
    searchableText: raw.searchableText,
    provenance: {
      type: raw.provenanceType,
      sourceId: raw.provenanceSourceId,
      capturedAt: raw.provenanceCapturedAt,
      sourceSpan: { start: raw.sourceSpanStart, end: raw.sourceSpanEnd },
    },
    extractionConfidence: raw.extractionConfidence,
    sensitivity: raw.sensitivity,
    lifecycle: raw.lifecycle,
    retrievalEligibility: raw.retrievalEligibility,
    inputSha256: raw.inputSha256,
    contentSha256: raw.contentSha256,
    confirmationSha256: raw.confirmationSha256,
    confirmedAt: raw.confirmedAt,
    validFrom: raw.validFrom,
    validUntil: raw.validUntil,
    supersedesId: raw.supersedesId,
  });
  return parsed.success ? Object.freeze(parsed.data) as ConfirmedMemoryItem : null;
}

function policyCandidate(candidate: MemoryConfirmationCandidateSnapshot) {
  return {
    candidateId: candidate.id,
    memoryType: candidate.memoryType,
    text: candidate.text,
    provenanceType: candidate.provenanceType,
    inputSha256: candidate.inputSha256,
  } as const;
}

export class MemoryConfirmationService {
  private readonly policy: MemoryConfirmationPolicy | null;
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: MemoryConfirmationServiceDependencies,
    options: MemoryConfirmationServiceOptions = {},
  ) {
    this.policy = dependencies.policy === undefined ? DEFAULT_MEMORY_CONFIRMATION_POLICY : dependencies.policy;
    this.now = options.now ?? (() => new Date());
  }

  async confirm(scope: AuthorizedChildScope, rawContext: unknown, rawInput: unknown): Promise<MemoryConfirmationActionResult> {
    return this.confirmOrCorrect("confirm", scope, rawContext, rawInput);
  }

  async correct(scope: AuthorizedChildScope, rawContext: unknown, rawInput: unknown): Promise<MemoryConfirmationActionResult> {
    return this.confirmOrCorrect("correct", scope, rawContext, rawInput);
  }

  async reject(scope: AuthorizedChildScope, rawContext: unknown, rawInput: unknown): Promise<MemoryConfirmationActionResult> {
    const prepared = this.prepareTerminal(scope, rawContext, rawInput, false);
    if (!prepared.ok) return prepared.failure;
    const input: MemoryConfirmationDecisionInput = {
      candidateId: prepared.input.candidateId,
      candidateInputSha256: prepared.input.candidateInputSha256,
      policySha256: prepared.input.policySha256,
      confirmationSha256: prepared.input.confirmationSha256,
      idempotencyKey: prepared.input.idempotencyKey,
      memoryItemId: null,
    };
    return this.persist("reject", prepared.scope, input);
  }

  async revoke(scope: AuthorizedChildScope, rawContext: unknown, rawInput: unknown): Promise<MemoryConfirmationActionResult> {
    const prepared = this.prepareTerminal(scope, rawContext, rawInput, true);
    if (!prepared.ok) return prepared.failure;
    const input = prepared.input as MemoryRevokeInput;
    return this.persist("revoke", prepared.scope, {
      candidateId: input.candidateId,
      candidateInputSha256: input.candidateInputSha256,
      policySha256: input.policySha256,
      confirmationSha256: input.confirmationSha256,
      idempotencyKey: input.idempotencyKey,
      memoryItemId: input.memoryItemId,
    });
  }

  async get(scope: AuthorizedChildScope, rawContext: unknown, memoryItemId: unknown): Promise<MemoryConfirmationGetResult> {
    const current = this.readNow();
    if (!current) return this.failure("NOT_AUTHORIZED");
    const context = trustedContext(scope, rawContext, "read", current);
    if (!context) return this.failure("NOT_AUTHORIZED");
    const id = UUID.safeParse(memoryItemId);
    if (!id.success) return this.failure("INVALID_INPUT");
    try {
      const raw = await this.dependencies.repository.get(repositoryContext(scope, context), id.data);
      if (raw === null) return Object.freeze({ ok: true as const, status: "available" as const, item: null });
      const item = projectItem(raw, scope);
      return item
        ? Object.freeze({ ok: true as const, status: "available" as const, item })
        : this.failure("STORAGE_UNAVAILABLE");
    } catch {
      return this.failure("STORAGE_UNAVAILABLE");
    }
  }

  async list(scope: AuthorizedChildScope, rawContext: unknown): Promise<MemoryConfirmationListResult> {
    const current = this.readNow();
    if (!current) return this.failure("NOT_AUTHORIZED");
    const context = trustedContext(scope, rawContext, "read", current);
    if (!context) return this.failure("NOT_AUTHORIZED");
    try {
      const rawItems = await this.dependencies.repository.list(repositoryContext(scope, context));
      if (!Array.isArray(rawItems) || rawItems.length > 1_000) return this.failure("STORAGE_UNAVAILABLE");
      const items: ConfirmedMemoryItem[] = [];
      for (const raw of rawItems) {
        const item = projectItem(raw, scope);
        if (!item) return this.failure("STORAGE_UNAVAILABLE");
        items.push(item);
      }
      items.sort((left, right) => right.validFrom.localeCompare(left.validFrom) || left.id.localeCompare(right.id));
      return Object.freeze({ ok: true as const, status: "available" as const, items: Object.freeze(items) });
    } catch {
      return this.failure("STORAGE_UNAVAILABLE");
    }
  }

  private async confirmOrCorrect(
    action: "confirm" | "correct",
    scope: AuthorizedChildScope,
    rawContext: unknown,
    rawInput: unknown,
  ): Promise<MemoryConfirmationActionResult> {
    const current = this.readNow();
    if (!current) return this.failure("NOT_AUTHORIZED");
    const context = trustedContext(scope, rawContext, "record", current);
    if (!context) return this.failure("NOT_AUTHORIZED");
    const schema = action === "correct" ? CORRECT_INPUT : CONFIRM_INPUT;
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) return this.failure("INVALID_INPUT");
    const input = parsed.data;
    const candidate = input.candidate;
    const candidateExpiry = new Date(candidate.expiresAt);
    const chosenExpiry = new Date(input.expiresAt);
    const cutoff = new Date(context.cutoffAt);
    if (candidateExpiry <= cutoff || chosenExpiry <= cutoff || chosenExpiry > candidateExpiry) {
      return this.failure("CANDIDATE_EXPIRED");
    }
    if (candidate.inputSha256 !== input.candidateInputSha256 || !this.policy) {
      return this.failure(this.policy ? "PREVIEW_DRIFT" : "POLICY_UNAVAILABLE");
    }
    const classification = classifyMemoryCandidate({
      candidate: policyCandidate(candidate),
      policy: this.policy,
      safetyDecision: context.safetyDecision,
      cutoff: context.cutoffAt,
    });
    if (classification.status !== "allowed") return this.policyFailure(classification.prohibitionReasons);
    if (classification.decisionSha256 !== input.policyDecisionSha256
      || classification.sensitivity !== candidate.sensitivity
      || classification.policy?.policySha256 !== this.policy.policySha256) {
      return this.failure("PREVIEW_DRIFT");
    }
    const confirmation = evaluateMemoryConfirmation({
      candidate: policyCandidate(candidate),
      confirmation: {
        explicit: true,
        mode: classification.confirmation.mode,
        purpose: input.purpose,
        candidateInputSha256: input.candidateInputSha256,
        confirmationSha256: input.confirmationSha256,
        expiresAt: input.expiresAt,
      },
      policy: this.policy,
      safetyDecision: context.safetyDecision,
      cutoff: context.cutoffAt,
    });
    if (!confirmation.ok) return this.policyFailure(confirmation.prohibitionReasons);

    const memoryItemId = deterministicUuid({
      schemaVersion: "clinical-memory-item-id.v1",
      action,
      candidateId: candidate.id,
      candidateInputSha256: input.candidateInputSha256,
      confirmationSha256: input.confirmationSha256,
    });
    const base: MemoryConfirmationDecisionInput = {
      candidateId: candidate.id,
      candidateInputSha256: input.candidateInputSha256,
      policySha256: this.policy.policySha256,
      confirmationSha256: input.confirmationSha256,
      idempotencyKey: input.idempotencyKey,
      memoryItemId,
      validFrom: new Date(context.cutoffAt).toISOString(),
      validUntil: new Date(input.expiresAt).toISOString(),
    };
    if (action === "confirm") return this.persist("confirm", { context: repositoryContext(scope, context), scope }, base);

    const correctionInput = input as MemoryCorrectInput;
    const correctedText = canonicalText(correctionInput.correctedText);
    const corrected = classifyMemoryCandidate({
      candidate: {
        candidateId: candidate.id,
        memoryType: candidate.memoryType,
        text: correctedText,
        provenanceType: candidate.provenanceType,
      },
      policy: this.policy,
      safetyDecision: context.safetyDecision,
      cutoff: context.cutoffAt,
    });
    if (corrected.status !== "allowed") return this.policyFailure(corrected.prohibitionReasons);
    const correction: MemoryConfirmationCorrection = {
      ...base,
      memoryType: candidate.memoryType,
      structuredContent: Object.freeze({ text: correctedText }),
      searchableText: correctedText,
      provenanceType: candidate.provenanceType,
      provenanceSourceId: candidate.provenanceSourceId,
      provenanceCapturedAt: candidate.provenanceCapturedAt,
      sourceSpanStart: candidate.sourceSpanStart,
      sourceSpanEnd: candidate.sourceSpanEnd,
      sourceSessionId: candidate.sourceSessionId,
      sourceMessageId: candidate.sourceMessageId,
      extractionConfidence: candidate.extractionConfidence,
      sensitivity: candidate.sensitivity,
      validFrom: new Date(context.cutoffAt).toISOString(),
      validUntil: new Date(input.expiresAt).toISOString(),
      supersedesId: correctionInput.supersedesId,
    };
    return this.persist("correct", { context: repositoryContext(scope, context), scope }, correction);
  }

  private prepareTerminal(scope: AuthorizedChildScope, rawContext: unknown, rawInput: unknown, revoke: boolean) {
    const current = this.readNow();
    if (!current) return { ok: false as const, failure: this.failure("NOT_AUTHORIZED") };
    const context = trustedContext(scope, rawContext, "record", current);
    if (!context) return { ok: false as const, failure: this.failure("NOT_AUTHORIZED") };
    const parsed = (revoke ? REVOKE_INPUT : TERMINAL_INPUT).safeParse(rawInput);
    if (!parsed.success) return { ok: false as const, failure: this.failure("INVALID_INPUT") };
    return {
      ok: true as const,
      input: parsed.data as MemoryRejectInput | MemoryRevokeInput,
      scope: { context: repositoryContext(scope, context), scope },
    };
  }

  private async persist(
    action: "confirm" | "reject" | "correct" | "revoke",
    prepared: Readonly<{ context: MemoryConfirmationContext; scope: AuthorizedChildScope }>,
    input: MemoryConfirmationDecisionInput | MemoryConfirmationCorrection,
  ): Promise<MemoryConfirmationActionResult> {
    try {
      const result = action === "correct"
        ? await this.dependencies.repository.correct(prepared.context, input as MemoryConfirmationCorrection)
        : await this.dependencies.repository[action](prepared.context, input as MemoryConfirmationDecisionInput);
      if (result.outcome === "conflict") return this.failure("IDEMPOTENCY_CONFLICT");
      const expected = action === "confirm" ? "confirmed"
        : action === "reject" ? "rejected"
          : action === "correct" ? "corrected" : "revoked";
      if (result.outcome !== expected && result.outcome !== "idempotent_replay") return this.failure("STORAGE_UNAVAILABLE");
      if (action === "reject" && result.item !== null) return this.failure("STORAGE_UNAVAILABLE");
      if (action !== "reject" && result.item === null) return this.failure("STORAGE_UNAVAILABLE");
      const item = result.item === null ? null : projectItem(result.item, prepared.scope);
      if (result.item !== null && !item) return this.failure("STORAGE_UNAVAILABLE");
      if (item && item.inputSha256 !== input.candidateInputSha256) return this.failure("STORAGE_UNAVAILABLE");
      if (item && action !== "revoke" && item.confirmationSha256 !== input.confirmationSha256) return this.failure("STORAGE_UNAVAILABLE");
      if (item && action === "revoke" && item.retrievalEligibility !== "ineligible") return this.failure("STORAGE_UNAVAILABLE");
      if (item && action === "correct" && item.supersedesId !== (input as MemoryConfirmationCorrection).supersedesId) return this.failure("STORAGE_UNAVAILABLE");
      return Object.freeze({
        ok: true as const,
        status: "available" as const,
        outcome: result.outcome,
        decisionId: result.decisionId,
        eventId: result.eventId,
        eventKind: result.eventKind,
        eventVersion: result.eventVersion,
        item,
      });
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

  private policyFailure(reasons: readonly string[]): MemoryConfirmationFailure {
    return this.failure(reasons.some((reason) => reason.startsWith("POLICY_")) ? "POLICY_UNAVAILABLE" : "POLICY_DENIED");
  }

  private failure(code: MemoryConfirmationFailureCode): MemoryConfirmationFailure {
    return Object.freeze({ ok: false as const, status: "unavailable" as const, code });
  }
}

export function createMemoryConfirmationService(
  dependencies: MemoryConfirmationServiceDependencies,
  options: MemoryConfirmationServiceOptions = {},
): MemoryConfirmationService {
  return new MemoryConfirmationService(dependencies, options);
}
