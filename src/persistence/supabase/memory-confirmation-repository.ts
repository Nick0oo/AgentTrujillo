import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Database } from "./database.types.ts";

type Client = SupabaseClient<Database>;
type RpcResult = Readonly<{ data: unknown; error: Readonly<{ message: string }> | null }>;
type RpcClient = Readonly<{ rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> }>;

const UUID = z.string().uuid();
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const MEMORY_TYPE = z.enum([
  "symptom", "history", "allergy", "medication", "vaccine",
  "measurement", "development", "preference", "summary",
]);
const SENSITIVITY = z.enum(["low", "medium", "high"]);
const ITEM = z.object({
  id: UUID,
  care_space_id: UUID,
  child_id: UUID,
  memory_type: MEMORY_TYPE,
  structured_content: z.record(z.string(), z.unknown()),
  searchable_text: z.string().min(1).max(8_000),
  provenance_type: z.enum(["guardian", "professional", "import", "document", "chat", "system"]),
  provenance_source_id: z.string().min(1).max(256),
  provenance_captured_at: INSTANT,
  source_span_start: z.number().int().nonnegative(),
  source_span_end: z.number().int().positive(),
  source_session_id: UUID.nullable(),
  source_message_id: UUID.nullable(),
  extraction_confidence: z.number().finite().min(0).max(1),
  sensitivity: SENSITIVITY,
  lifecycle: z.enum(["active", "superseded", "deleted"]),
  retrieval_eligibility: z.enum(["eligible", "ineligible"]),
  input_sha256: DIGEST,
  content_sha256: DIGEST,
  confirmation_sha256: DIGEST,
  confirmed_at: INSTANT,
  valid_from: INSTANT,
  valid_until: INSTANT.nullable(),
  supersedes_id: UUID.nullable(),
}).strict().superRefine((value, context) => {
  if (value.source_span_end <= value.source_span_start) {
    context.addIssue({ code: "custom", path: ["source_span_end"], message: "source_span" });
  }
  if (value.valid_until !== null && new Date(value.valid_until) <= new Date(value.valid_from)) {
    context.addIssue({ code: "custom", path: ["valid_until"], message: "validity" });
  }
});

const ACTION_RESULT = z.object({
  outcome: z.enum(["confirmed", "rejected", "corrected", "revoked", "idempotent_replay", "conflict"]),
  decision_id: UUID.nullable(),
  event_id: UUID.nullable(),
  event_kind: z.string().min(1).max(64).nullable(),
  event_version: z.number().int().positive().nullable(),
  candidate_id: UUID.nullable(),
  memory_item_id: UUID.nullable(),
  care_space_id: UUID.nullable(),
  child_id: UUID.nullable(),
  candidate_input_sha256: DIGEST.nullable(),
  policy_sha256: DIGEST.nullable(),
  content_sha256: DIGEST.nullable(),
  confirmation_sha256: DIGEST.nullable(),
  event_payload_sha256: DIGEST.nullable(),
}).passthrough();

function rpcClient(client: Client): RpcClient {
  return client as unknown as RpcClient;
}

function rows(data: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((value): value is Record<string, unknown> => (
    value !== null && typeof value === "object" && !Array.isArray(value)
  ));
}

function instant(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("MEMORY_CONFIRMATION_INSTANT_INVALID");
  return parsed.toISOString();
}

function mapItem(value: Record<string, unknown>): MemoryConfirmationItem {
  const itemKeys = [
    "id", "care_space_id", "child_id", "memory_type", "structured_content", "searchable_text",
    "provenance_type", "provenance_source_id", "provenance_captured_at", "source_span_start",
    "source_span_end", "source_session_id", "source_message_id", "extraction_confidence", "sensitivity",
    "lifecycle", "retrieval_eligibility", "input_sha256", "content_sha256", "confirmation_sha256",
    "confirmed_at", "valid_from", "valid_until", "supersedes_id",
  ] as const;
  const itemValue = Object.fromEntries(itemKeys.map((key) => [key, value[key]]));
  if (itemValue.id === undefined) itemValue.id = value.memory_item_id;
  const parsed = ITEM.safeParse(itemValue);
  if (!parsed.success) throw new Error("MEMORY_CONFIRMATION_ITEM_INVALID");
  const row = parsed.data;
  return Object.freeze({
    id: row.id,
    careSpaceId: row.care_space_id,
    childId: row.child_id,
    memoryType: row.memory_type,
    structuredContent: Object.freeze(row.structured_content),
    searchableText: row.searchable_text,
    provenanceType: row.provenance_type,
    sourceSessionId: row.source_session_id,
    sourceMessageId: row.source_message_id,
    provenanceSourceId: row.provenance_source_id,
    provenanceCapturedAt: instant(row.provenance_captured_at),
    sourceSpanStart: row.source_span_start,
    sourceSpanEnd: row.source_span_end,
    extractionConfidence: row.extraction_confidence,
    sensitivity: row.sensitivity,
    lifecycle: row.lifecycle,
    retrievalEligibility: row.retrieval_eligibility,
    inputSha256: row.input_sha256,
    contentSha256: row.content_sha256,
    confirmationSha256: row.confirmation_sha256,
    confirmedAt: instant(row.confirmed_at),
    validFrom: instant(row.valid_from),
    validUntil: row.valid_until === null ? null : instant(row.valid_until),
    supersedesId: row.supersedes_id,
  });
}

function requirePermission(scope: AuthorizedChildScope, permission: "read" | "record"): void {
  if (!scope.permissions.includes(permission)) throw new Error("MEMORY_CONFIRMATION_NOT_AUTHORIZED");
}

function firstActionRow(data: unknown): Record<string, unknown> {
  const value = rows(data)[0];
  if (!value) throw new Error("MEMORY_CONFIRMATION_RPC_EMPTY");
  return value;
}

function actionProjection(value: Record<string, unknown>): MemoryConfirmationResult {
  if (value.outcome === "conflict") return { outcome: "conflict" };
  const parsed = ACTION_RESULT.safeParse(value);
  if (!parsed.success) throw new Error("MEMORY_CONFIRMATION_RESULT_INVALID");
  const row = parsed.data;
  const item = row.memory_item_id === null ? null : mapItem(value);
  return Object.freeze({
    outcome: row.outcome,
    decisionId: row.decision_id,
    eventId: row.event_id,
    eventKind: row.event_kind,
    eventVersion: row.event_version,
    item,
  });
}

export type MemoryConfirmationContext = Readonly<{
  scope: AuthorizedChildScope;
  sessionId: string;
  authorizationVersion: string;
  cutoffAt: string;
}>;

export type MemoryConfirmationDecisionInput = Readonly<{
  candidateId: string;
  candidateInputSha256: string;
  policySha256: string;
  confirmationSha256: string;
  idempotencyKey: string;
  memoryItemId: string | null;
  contentSha256?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}>;

export type MemoryConfirmationCorrection = MemoryConfirmationDecisionInput & Readonly<{
  memoryType: MemoryConfirmationItem["memoryType"];
  structuredContent: Readonly<Record<string, unknown>>;
  searchableText: string;
  provenanceType: MemoryConfirmationItem["provenanceType"];
  provenanceSourceId: string;
  provenanceCapturedAt: string;
  sourceSpanStart: number;
  sourceSpanEnd: number;
  sourceSessionId: string | null;
  sourceMessageId: string | null;
  extractionConfidence: number;
  sensitivity: MemoryConfirmationItem["sensitivity"];
  validFrom: string;
  validUntil: string | null;
  supersedesId: string;
}>;

export type MemoryConfirmationItem = Readonly<{
  id: string;
  careSpaceId: string;
  childId: string;
  memoryType: "symptom" | "history" | "allergy" | "medication" | "vaccine" | "measurement" | "development" | "preference" | "summary";
  structuredContent: Readonly<Record<string, unknown>>;
  searchableText: string;
  provenanceType: "guardian" | "professional" | "import" | "document" | "chat" | "system";
  sourceSessionId: string | null;
  sourceMessageId: string | null;
  provenanceSourceId: string;
  provenanceCapturedAt: string;
  sourceSpanStart: number;
  sourceSpanEnd: number;
  extractionConfidence: number;
  sensitivity: "low" | "medium" | "high";
  lifecycle: "active" | "superseded" | "deleted";
  retrievalEligibility: "eligible" | "ineligible";
  inputSha256: string;
  contentSha256: string;
  confirmationSha256: string;
  confirmedAt: string;
  validFrom: string;
  validUntil: string | null;
  supersedesId: string | null;
}>;

export type MemoryConfirmationResult = Readonly<{
  outcome: "confirmed" | "rejected" | "corrected" | "revoked" | "idempotent_replay";
  decisionId: string | null;
  eventId: string | null;
  eventKind: string | null;
  eventVersion: number | null;
  item: MemoryConfirmationItem | null;
}> | Readonly<{ outcome: "conflict" }>;

export interface MemoryConfirmationRepository {
  confirm(context: MemoryConfirmationContext, input: MemoryConfirmationDecisionInput): Promise<MemoryConfirmationResult>;
  reject(context: MemoryConfirmationContext, input: MemoryConfirmationDecisionInput): Promise<MemoryConfirmationResult>;
  correct(context: MemoryConfirmationContext, input: MemoryConfirmationCorrection): Promise<MemoryConfirmationResult>;
  revoke(context: MemoryConfirmationContext, input: MemoryConfirmationDecisionInput): Promise<MemoryConfirmationResult>;
  get(context: MemoryConfirmationContext, memoryItemId: string): Promise<MemoryConfirmationItem | null>;
  list(context: MemoryConfirmationContext): Promise<readonly MemoryConfirmationItem[]>;
}

function decisionArgs(
  context: MemoryConfirmationContext,
  decision: "confirm" | "reject" | "correct" | "revoke",
  input: MemoryConfirmationDecisionInput,
  correction?: MemoryConfirmationCorrection,
): Record<string, unknown> {
  return {
    p_care_space_id: context.scope.careSpaceId,
    p_child_id: context.scope.childId,
    p_session_id: context.sessionId,
    p_authorization_version: context.authorizationVersion,
    p_cutoff_at: context.cutoffAt,
    p_decision: decision,
    p_candidate_id: input.candidateId,
    p_candidate_input_sha256: input.candidateInputSha256,
    p_policy_sha256: input.policySha256,
    p_confirmation_sha256: input.confirmationSha256,
    p_idempotency_key: input.idempotencyKey,
    p_memory_item_id: decision === "reject" ? null : input.memoryItemId,
    p_memory_type: correction?.memoryType ?? null,
    p_structured_content: correction?.structuredContent ?? null,
    p_searchable_text: correction?.searchableText ?? null,
    p_provenance_type: correction?.provenanceType ?? null,
    p_provenance_source_id: correction?.provenanceSourceId ?? null,
    p_provenance_captured_at: correction?.provenanceCapturedAt ?? null,
    p_source_span_start: correction?.sourceSpanStart ?? null,
    p_source_span_end: correction?.sourceSpanEnd ?? null,
    p_source_session_id: correction?.sourceSessionId ?? null,
    p_source_message_id: correction?.sourceMessageId ?? null,
    p_extraction_confidence: correction?.extractionConfidence ?? null,
    p_sensitivity: correction?.sensitivity ?? null,
    p_content_sha256: input.contentSha256 ?? correction?.contentSha256 ?? null,
    p_valid_from: correction?.validFrom ?? input.validFrom ?? null,
    p_valid_until: correction?.validUntil ?? input.validUntil ?? null,
    p_supersedes_id: correction?.supersedesId ?? null,
  };
}

export function createMemoryConfirmationRepository(client: Client): MemoryConfirmationRepository {
  const dynamic = rpcClient(client);
  const decide = async (
    context: MemoryConfirmationContext,
    action: "confirm" | "reject" | "correct" | "revoke",
    input: MemoryConfirmationDecisionInput,
    correction?: MemoryConfirmationCorrection,
  ): Promise<MemoryConfirmationResult> => {
    requirePermission(context.scope, "record");
    const result = await dynamic.rpc("decide_memory_candidate", decisionArgs(context, action, input, correction));
    if (result.error) throw new Error("MEMORY_CONFIRMATION_RPC_FAILED");
    return actionProjection(firstActionRow(result.data));
  };

  return Object.freeze({
    confirm: (context: MemoryConfirmationContext, input: MemoryConfirmationDecisionInput) => decide(context, "confirm", input),
    reject: (context: MemoryConfirmationContext, input: MemoryConfirmationDecisionInput) => decide(context, "reject", input),
    correct: (context: MemoryConfirmationContext, input: MemoryConfirmationCorrection) => decide(context, "correct", input, input),
    revoke: (context: MemoryConfirmationContext, input: MemoryConfirmationDecisionInput) => decide(context, "revoke", input),
    async get(context: MemoryConfirmationContext, memoryItemId: string): Promise<MemoryConfirmationItem | null> {
      requirePermission(context.scope, "read");
      const result = await dynamic.rpc("get_confirmed_memory", {
        p_care_space_id: context.scope.careSpaceId,
        p_child_id: context.scope.childId,
        p_session_id: context.sessionId,
        p_authorization_version: context.authorizationVersion,
        p_cutoff_at: context.cutoffAt,
        p_memory_item_id: memoryItemId,
      });
      if (result.error) throw new Error("MEMORY_CONFIRMATION_RPC_FAILED");
      const value = rows(result.data)[0];
      return value ? mapItem(value) : null;
    },
    async list(context: MemoryConfirmationContext): Promise<readonly MemoryConfirmationItem[]> {
      requirePermission(context.scope, "read");
      const result = await dynamic.rpc("list_confirmed_memory", {
        p_care_space_id: context.scope.careSpaceId,
        p_child_id: context.scope.childId,
        p_session_id: context.sessionId,
        p_authorization_version: context.authorizationVersion,
        p_cutoff_at: context.cutoffAt,
      });
      if (result.error || !Array.isArray(result.data)) throw new Error("MEMORY_CONFIRMATION_RPC_FAILED");
      return Object.freeze(rows(result.data).map(mapItem));
    },
  });
}
