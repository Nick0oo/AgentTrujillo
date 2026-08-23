import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
  type ChildPermission,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import {
  validateDevelopmentObservation,
  type DevelopmentObservationValidationContext,
  type DevelopmentObservationWarning,
} from "../../clinical/development/observation-validation.ts";
import {
  developmentDomainSchema,
  developmentObservationDraftSchema,
  type DevelopmentDomain,
  type DevelopmentObservationDraft,
} from "../../clinical/development/types.ts";
import type { Sha256Hex } from "../../clinical/governance/source-types.ts";

const DIGEST = /^[a-f0-9]{64}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const digestSchema = z.string().regex(DIGEST);
const idempotencyKeySchema = z.string().regex(CODE);
const observationIdSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });

const previewSchema = z.object({
  draftId: digestSchema,
  draft: developmentObservationDraftSchema,
  confirmationDigest: digestSchema,
  warnings: z.array(z.enum(["attachment_pending", "quoted_clinical_language_neutral"])).max(2).readonly(),
}).strict();

const confirmationCommandSchema = z.object({
  preview: previewSchema,
  confirmationDigest: digestSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict();

const withdrawalCommandSchema = z.object({
  observationId: observationIdSchema,
  reason: z.enum(["entered_by_mistake", "wrong_date", "other"]),
  confirmationDigest: digestSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
}).strict().superRefine((value, issue) => {
  if ((value.confirmationDigest === undefined) !== (value.idempotencyKey === undefined)) {
    issue.addIssue({ code: "custom", message: "confirmation and idempotency key must be supplied together" });
  }
});

const repositoryRowSchema = z.object({
  id: observationIdSchema,
  careSpaceId: observationIdSchema,
  childId: observationIdSchema,
  recordedBy: observationIdSchema,
  milestoneCode: z.string().regex(CODE).nullable(),
  domain: developmentDomainSchema,
  title: z.string().min(1).max(200).nullable(),
  observation: z.string().min(1).max(2_000),
  observedOn: z.string().date(),
  status: z.enum(["observed", "entered_in_error"]),
  createdAt: instantSchema,
  confirmedAt: instantSchema,
  supersedesObservationId: observationIdSchema.nullable(),
}).strict();

const writeResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    observationId: observationIdSchema,
    outcome: z.enum(["created", "idempotent_replay"]),
  }).strict(),
  z.object({
    ok: z.literal(false),
    code: z.enum(["IDEMPOTENCY_CONFLICT", "UNAVAILABLE"]),
  }).strict(),
]);

export type DevelopmentObservationPreview = Readonly<{
  draftId: Sha256Hex;
  draft: DevelopmentObservationDraft;
  confirmationDigest: Sha256Hex;
  warnings: readonly DevelopmentObservationWarning[];
}>;

export type DevelopmentObservationWrite = Readonly<{
  milestoneCode: string | null;
  domain: DevelopmentDomain;
  title: string | null;
  observation: string;
  observedOn: string;
  status: "observed" | "entered_in_error";
  provenanceType: "guardian";
  idempotencyKey: string;
  inputSha256: Sha256Hex;
  confirmationSha256: Sha256Hex;
  supersedesObservationId: string | null;
  attachmentObjectPaths: readonly string[];
}>;

export type DevelopmentObservationRepositoryRow = Readonly<{
  id: string;
  careSpaceId: string;
  childId: string;
  recordedBy: string;
  milestoneCode: string | null;
  domain: DevelopmentDomain;
  title: string | null;
  observation: string;
  observedOn: string;
  status: "observed" | "entered_in_error";
  createdAt: string;
  confirmedAt: string;
  supersedesObservationId: string | null;
}>;

export type DevelopmentObservationRepositoryWriteResult =
  | Readonly<{ ok: true; observationId: string; outcome: "created" | "idempotent_replay" }>
  | Readonly<{ ok: false; code: "IDEMPOTENCY_CONFLICT" | "UNAVAILABLE" }>;

export interface DevelopmentObservationRepository {
  record(scope: AuthorizedChildScope, write: DevelopmentObservationWrite): Promise<DevelopmentObservationRepositoryWriteResult>;
  find(scope: AuthorizedChildScope, observationId: string): Promise<DevelopmentObservationRepositoryRow | null>;
  list(scope: AuthorizedChildScope): Promise<readonly DevelopmentObservationRepositoryRow[]>;
}

export interface DevelopmentObservationTransactionPort {
  /** The adapter starts a transaction and revalidates access before invoking operation. */
  run<T>(
    scope: AuthorizedChildScope,
    currentInstant: string,
    operation: (freshScope: AuthorizedChildScope) => Promise<T>,
  ): Promise<T | null>;
}

export interface DevelopmentObservationValidationContextPort {
  resolve(
    scope: AuthorizedChildScope,
    draft: DevelopmentObservationDraft,
    cutoff: string,
  ): Promise<DevelopmentObservationValidationContext | null>;
}

export type DevelopmentObservationServiceDependencies = Readonly<{
  transaction: DevelopmentObservationTransactionPort;
  validationContext: DevelopmentObservationValidationContextPort;
  repository: DevelopmentObservationRepository;
}>;

export type DevelopmentObservationFailure = Readonly<{
  ok: false;
  status: "unavailable";
  code: "NOT_AUTHORIZED" | "INVALID_OBSERVATION" | "CONFIRMATION_DRIFT" | "IDEMPOTENCY_CONFLICT" | "STORAGE_UNAVAILABLE";
}>;

export type DevelopmentObservationRecorded = Readonly<{
  ok: true;
  status: "recorded";
  observationId: string;
  outcome: "created" | "idempotent_replay";
}>;

export type DevelopmentObservationDraftResult =
  | Readonly<{ ok: true; status: "draft"; preview: DevelopmentObservationPreview; warnings: readonly DevelopmentObservationWarning[] }>
  | DevelopmentObservationFailure;

export type DevelopmentObservationRecordResult = DevelopmentObservationRecorded | DevelopmentObservationFailure;

export type DevelopmentObservationWithdrawalResult =
  | Readonly<{
      ok: true;
      status: "confirmation_required";
      confirmationDigest: Sha256Hex;
      confirmationMaterial: Readonly<{
        schemaVersion: "development-observation-withdrawal.v1";
        action: "withdraw";
        observationId: string;
        reason: "entered_by_mistake" | "wrong_date" | "other";
      }>;
    }>
  | DevelopmentObservationRecordResult;

export type DevelopmentObservationListItem = Readonly<{
  id: string;
  milestoneCode: string | null;
  domain: DevelopmentDomain;
  title: string | null;
  observation: string;
  observedOn: string;
  status: "observed" | "entered_in_error";
  createdAt: string;
  confirmedAt: string;
  supersedesObservationId: string | null;
}>;

export type DevelopmentObservationListResult =
  | Readonly<{ ok: true; status: "available"; observations: readonly DevelopmentObservationListItem[] }>
  | DevelopmentObservationFailure;

export interface DevelopmentObservationService {
  createDraft(scope: AuthorizedChildScope, draft: DevelopmentObservationDraft): Promise<DevelopmentObservationDraftResult>;
  confirm(scope: AuthorizedChildScope, command: Readonly<{
    preview: DevelopmentObservationPreview;
    confirmationDigest: Sha256Hex;
    idempotencyKey: string;
  }>): Promise<DevelopmentObservationRecordResult>;
  correct(scope: AuthorizedChildScope, predecessorId: string, command: Readonly<{
    preview: DevelopmentObservationPreview;
    confirmationDigest: Sha256Hex;
    idempotencyKey: string;
  }>): Promise<DevelopmentObservationRecordResult>;
  list(scope: AuthorizedChildScope): Promise<DevelopmentObservationListResult>;
  governedDelete(scope: AuthorizedChildScope, command: Readonly<{
    observationId: string;
    reason: "entered_by_mistake" | "wrong_date" | "other";
    confirmationDigest?: Sha256Hex;
    idempotencyKey?: string;
  }>): Promise<DevelopmentObservationWithdrawalResult>;
}

const failures = {
  notAuthorized: Object.freeze({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" } as const),
  invalid: Object.freeze({ ok: false, status: "unavailable", code: "INVALID_OBSERVATION" } as const),
  drift: Object.freeze({ ok: false, status: "unavailable", code: "CONFIRMATION_DRIFT" } as const),
  conflict: Object.freeze({ ok: false, status: "unavailable", code: "IDEMPOTENCY_CONFLICT" } as const),
  storage: Object.freeze({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" } as const),
};

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(new TextEncoder().encode(canonicalize(value))).digest("hex") as Sha256Hex;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function validScope(
  requestScope: AuthorizedChildScope,
  freshScope: AuthorizedChildScope,
  permission: ChildPermission,
  now: Date,
): boolean {
  return hasPermission(requestScope, permission, now)
    && hasPermission(freshScope, permission, now)
    && sameAuthorizedChildScope(requestScope, freshScope)
    && requestScope.countryOfCare === freshScope.countryOfCare
    && requestScope.timezone === freshScope.timezone
    && freshScope.permissions.every((candidate) => requestScope.permissions.includes(candidate));
}

function contextIsBound(context: DevelopmentObservationValidationContext, scope: AuthorizedChildScope, cutoff: string): boolean {
  const contextCutoff = context.cutoff instanceof Date ? context.cutoff.toISOString() : context.cutoff;
  return context.timeZone === scope.timezone
    && contextCutoff === cutoff
    && (context.milestoneEvidence === null
      || context.milestoneEvidence === undefined
      || context.milestoneEvidence.jurisdiction === scope.countryOfCare);
}

function rowIsBound(row: DevelopmentObservationRepositoryRow, scope: AuthorizedChildScope): boolean {
  return row.careSpaceId === scope.careSpaceId
    && row.childId === scope.childId
    && row.recordedBy === scope.actorUserId;
}

function observationText(draft: DevelopmentObservationDraft): string {
  return draft.concern === null || draft.concern === undefined
    ? draft.text
    : `${draft.text}\nCaregiver question: ${draft.concern.text}`;
}

function projectRow(row: DevelopmentObservationRepositoryRow): DevelopmentObservationListItem {
  return Object.freeze({
    id: row.id,
    milestoneCode: row.milestoneCode,
    domain: row.domain,
    title: row.title,
    observation: row.observation,
    observedOn: row.observedOn,
    status: row.status,
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
    supersedesObservationId: row.supersedesObservationId,
  });
}

export function createDevelopmentObservationService(
  dependencies: DevelopmentObservationServiceDependencies,
  options: Readonly<{ now?: () => Date }> = {},
): DevelopmentObservationService {
  const now = options.now ?? (() => new Date());

  async function authorized<T>(
    scope: AuthorizedChildScope,
    permission: ChildPermission,
    operation: (freshScope: AuthorizedChildScope, cutoff: string) => Promise<T>,
  ): Promise<T | null> {
    const current = now();
    if (!Number.isFinite(current.getTime()) || !hasPermission(scope, permission, current)) return null;
    const cutoff = current.toISOString();
    return dependencies.transaction.run(scope, cutoff, async (freshScope) => validScope(scope, freshScope, permission, current)
      ? operation(freshScope, cutoff)
      : null) as Promise<T | null>;
  }

  async function validatePreview(
    freshScope: AuthorizedChildScope,
    cutoff: string,
    rawPreview: unknown,
    requestedDigest: unknown,
  ): Promise<Readonly<{
    ok: true;
    draft: DevelopmentObservationDraft;
    confirmationDigest: Sha256Hex;
    inputSha256: Sha256Hex;
  }> | DevelopmentObservationFailure> {
    const parsed = previewSchema.safeParse(rawPreview);
    if (!parsed.success || !digestSchema.safeParse(requestedDigest).success) return failures.invalid;
    const preview = {
      ...parsed.data,
      draftId: parsed.data.draftId as Sha256Hex,
      draft: parsed.data.draft as DevelopmentObservationDraft,
      confirmationDigest: parsed.data.confirmationDigest as Sha256Hex,
    };
    const expectedDraftId = digest({
      schemaVersion: "development-observation-draft.v1",
      actorUserId: freshScope.actorUserId,
      careSpaceId: freshScope.careSpaceId,
      childId: freshScope.childId,
      confirmationDigest: preview.confirmationDigest,
    });
    if (preview.draftId !== expectedDraftId || requestedDigest !== preview.confirmationDigest) return failures.drift;
    const context = await dependencies.validationContext.resolve(freshScope, preview.draft, cutoff);
    if (context === null || !contextIsBound(context, freshScope, cutoff)) return failures.invalid;
    const accepted = validateDevelopmentObservation(preview.draft, {
      ...context,
      expectedConfirmationDigest: preview.confirmationDigest,
    });
    if (!accepted.ok
      || accepted.confirmationDigest !== requestedDigest
      || canonicalize(accepted.draft) !== canonicalize(preview.draft)) return failures.drift;
    return Object.freeze({
      ok: true as const,
      draft: accepted.draft,
      confirmationDigest: accepted.confirmationDigest,
      inputSha256: digest(accepted.draft),
    });
  }

  async function writeConfirmed(
    freshScope: AuthorizedChildScope,
    accepted: Readonly<{
      ok: true;
      draft: DevelopmentObservationDraft;
      confirmationDigest: Sha256Hex;
      inputSha256: Sha256Hex;
    }>,
    idempotencyKey: string,
    supersedesObservationId: string | null,
  ): Promise<DevelopmentObservationRecordResult> {
    const draft = accepted.draft;
    const rawResult = await dependencies.repository.record(freshScope, {
      milestoneCode: draft.milestoneId ?? null,
      domain: draft.domain,
      title: null,
      observation: observationText(draft),
      observedOn: draft.date,
      status: "observed",
      provenanceType: "guardian",
      idempotencyKey,
      inputSha256: accepted.inputSha256,
      confirmationSha256: accepted.confirmationDigest,
      supersedesObservationId,
      attachmentObjectPaths: Object.freeze((draft.attachments ?? []).map((attachment) => attachment.objectPath)),
    });
    const result = writeResultSchema.safeParse(rawResult);
    if (!result.success || (!result.data.ok && result.data.code === "UNAVAILABLE")) return failures.storage;
    if (!result.data.ok) return failures.conflict;
    return Object.freeze({ ok: true, status: "recorded", observationId: result.data.observationId, outcome: result.data.outcome });
  }

  const service: DevelopmentObservationService = {
    async createDraft(scope: AuthorizedChildScope, rawDraft: DevelopmentObservationDraft) {
      try {
        const parsed = developmentObservationDraftSchema.safeParse(rawDraft);
        if (!parsed.success) return failures.invalid;
        const candidate = parsed.data as DevelopmentObservationDraft;
        const result = await authorized(scope, "record", async (freshScope, cutoff) => {
          const validationContext = await dependencies.validationContext.resolve(freshScope, candidate, cutoff);
          if (validationContext === null || !contextIsBound(validationContext, freshScope, cutoff)) return failures.invalid;
          const accepted = validateDevelopmentObservation(candidate, validationContext);
          if (!accepted.ok) return failures.invalid;
          const preview: DevelopmentObservationPreview = {
            draftId: digest({
              schemaVersion: "development-observation-draft.v1",
              actorUserId: freshScope.actorUserId,
              careSpaceId: freshScope.careSpaceId,
              childId: freshScope.childId,
              confirmationDigest: accepted.confirmationDigest,
            }),
            draft: accepted.draft,
            confirmationDigest: accepted.confirmationDigest,
            warnings: accepted.warnings,
          };
          return deepFreeze({ ok: true as const, status: "draft" as const, preview, warnings: accepted.warnings });
        });
        return result ?? failures.notAuthorized;
      } catch {
        return failures.storage;
      }
    },

    async confirm(scope, rawCommand) {
      try {
        const command = confirmationCommandSchema.safeParse(rawCommand);
        if (!command.success) return failures.invalid;
        const result = await authorized(scope, "record", async (freshScope, cutoff) => {
          const accepted = await validatePreview(freshScope, cutoff, command.data.preview, command.data.confirmationDigest);
          return accepted.ok === false
            ? accepted
            : writeConfirmed(freshScope, accepted, command.data.idempotencyKey, null);
        });
        return result ?? failures.notAuthorized;
      } catch {
        return failures.storage;
      }
    },

    async correct(scope, predecessorId, rawCommand) {
      try {
        if (!observationIdSchema.safeParse(predecessorId).success) return failures.invalid;
        const command = confirmationCommandSchema.safeParse(rawCommand);
        if (!command.success) return failures.invalid;
        const result = await authorized(scope, "record", async (freshScope, cutoff) => {
          const predecessorRaw = await dependencies.repository.find(freshScope, predecessorId);
          const predecessor = repositoryRowSchema.safeParse(predecessorRaw);
          if (!predecessor.success || !rowIsBound(predecessor.data, freshScope) || predecessor.data.status === "entered_in_error") return failures.notAuthorized;
          const accepted = await validatePreview(freshScope, cutoff, command.data.preview, command.data.confirmationDigest);
          return accepted.ok === false
            ? accepted
            : writeConfirmed(freshScope, accepted, command.data.idempotencyKey, predecessorId);
        });
        return result ?? failures.notAuthorized;
      } catch {
        return failures.storage;
      }
    },

    async list(scope) {
      try {
        const result = await authorized(scope, "read", async (freshScope) => {
          const rawRows = await dependencies.repository.list(freshScope);
          const rows = z.array(repositoryRowSchema).max(1_000).safeParse(rawRows);
          if (!rows.success || rows.data.some((row) => !rowIsBound(row, freshScope))) return failures.notAuthorized;
          const observations = rows.data.map(projectRow).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
          return deepFreeze({ ok: true as const, status: "available" as const, observations });
        });
        return result ?? failures.notAuthorized;
      } catch {
        return failures.storage;
      }
    },

    async governedDelete(scope, rawCommand) {
      try {
        const command = withdrawalCommandSchema.safeParse(rawCommand);
        if (!command.success) return failures.invalid;
        const result = await authorized(scope, "record", async (freshScope) => {
          const targetRaw = await dependencies.repository.find(freshScope, command.data.observationId);
          const target = repositoryRowSchema.safeParse(targetRaw);
          if (!target.success || !rowIsBound(target.data, freshScope) || target.data.status === "entered_in_error") return failures.notAuthorized;
          const confirmationMaterial = Object.freeze({
            schemaVersion: "development-observation-withdrawal.v1" as const,
            action: "withdraw" as const,
            observationId: command.data.observationId,
            reason: command.data.reason,
          });
          const confirmationDigest = digest(confirmationMaterial);
          if (command.data.confirmationDigest === undefined) {
            return deepFreeze({ ok: true as const, status: "confirmation_required" as const, confirmationDigest, confirmationMaterial });
          }
          if (command.data.confirmationDigest !== confirmationDigest || command.data.idempotencyKey === undefined) return failures.drift;
          const rawWrite = await dependencies.repository.record(freshScope, {
            milestoneCode: null,
            domain: target.data.domain,
            title: null,
            observation: "Caregiver withdrew this diary entry.",
            observedOn: target.data.observedOn,
            status: "entered_in_error",
            provenanceType: "guardian",
            idempotencyKey: command.data.idempotencyKey,
            inputSha256: digest(confirmationMaterial),
            confirmationSha256: confirmationDigest,
            supersedesObservationId: target.data.id,
            attachmentObjectPaths: Object.freeze([]),
          });
          const write = writeResultSchema.safeParse(rawWrite);
          if (!write.success || (!write.data.ok && write.data.code === "UNAVAILABLE")) return failures.storage;
          if (!write.data.ok) return failures.conflict;
          return Object.freeze({ ok: true as const, status: "recorded" as const, observationId: write.data.observationId, outcome: write.data.outcome });
        });
        return result ?? failures.notAuthorized;
      } catch {
        return failures.storage;
      }
    },
  };
  return Object.freeze(service);
}
