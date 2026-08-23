import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Database } from "./database.types.ts";
import type {
  MemoryCandidateRepository,
  MemoryCandidateRepositoryResult,
  MemoryCandidateRepositoryRow,
  MemoryCandidateTransactionContext,
  MemoryCandidateWrite,
} from "../../application/memory/candidate-service.ts";

type Client = SupabaseClient<Database>;
type RpcResult = Readonly<{ data: unknown; error: Readonly<{ message: string }> | null }>;
type RpcClient = Readonly<{ rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> }>;

const UUID = z.string().uuid();
const ROW = z.object({
  id: UUID,
  care_space_id: UUID,
  child_id: UUID,
  created_by: UUID,
  memory_type: z.enum([
    "symptom", "history", "allergy", "medication", "vaccine",
    "measurement", "development", "preference", "summary",
  ]),
  candidate_text: z.string().min(1).max(8_000),
  provenance_type: z.literal("chat"),
  provenance_source_id: z.string().min(1).max(256),
  provenance_captured_at: z.string().datetime({ offset: true }),
  source_span_start: z.number().int().nonnegative(),
  source_span_end: z.number().int().positive(),
  source_session_id: UUID,
  source_message_id: UUID,
  extraction_confidence: z.number().finite().min(0).max(1),
  sensitivity: z.enum(["low", "medium", "high"]),
  input_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  idempotency_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u),
  lifecycle: z.literal("pending"),
  expires_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.source_span_end <= value.source_span_start) {
    context.addIssue({ code: "custom", path: ["source_span_end"], message: "source_span" });
  }
  if (new Date(value.expires_at) <= new Date(value.created_at)) {
    context.addIssue({ code: "custom", path: ["expires_at"], message: "expiry" });
  }
});

function rpcClient(client: Client): RpcClient {
  return client as unknown as RpcClient;
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data)) return null;
  const value = data[0];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function canonicalInstant(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("MEMORY_CANDIDATE_INSTANT_INVALID");
  return parsed.toISOString();
}

function rowFrom(value: unknown): MemoryCandidateRepositoryRow {
  const rowValue = value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "outcome"))
    : value;
  const parsed = ROW.safeParse(rowValue);
  if (!parsed.success) throw new Error("MEMORY_CANDIDATE_ROW_INVALID");
  const row = parsed.data;
  return Object.freeze({
    id: row.id,
    careSpaceId: row.care_space_id,
    childId: row.child_id,
    createdBy: row.created_by,
    memoryType: row.memory_type,
    candidateText: row.candidate_text,
    provenanceType: row.provenance_type,
    provenanceSourceId: row.provenance_source_id,
    provenanceCapturedAt: canonicalInstant(row.provenance_captured_at),
    sourceSpanStart: row.source_span_start,
    sourceSpanEnd: row.source_span_end,
    sourceSessionId: row.source_session_id,
    sourceMessageId: row.source_message_id,
    extractionConfidence: row.extraction_confidence,
    sensitivity: row.sensitivity,
    inputSha256: row.input_sha256,
    idempotencyKey: row.idempotency_key,
    lifecycle: row.lifecycle,
    expiresAt: canonicalInstant(row.expires_at),
    createdAt: canonicalInstant(row.created_at),
  });
}

function writeArgs(context: MemoryCandidateTransactionContext, write: MemoryCandidateWrite): Record<string, unknown> {
  return {
    p_care_space_id: context.scope.careSpaceId,
    p_child_id: context.scope.childId,
    p_session_id: context.sessionContext.sessionId,
    p_authorization_version: context.sessionContext.authorizationVersion,
    p_source_message_id: write.sourceMessageId,
    p_cutoff_at: context.sessionContext.cutoffAt,
    p_candidate_id: write.id,
    p_memory_type: write.memoryType,
    p_candidate_text: write.candidateText,
    p_source_span_start: write.sourceSpanStart,
    p_source_span_end: write.sourceSpanEnd,
    p_extraction_confidence: write.extractionConfidence,
    p_sensitivity: write.sensitivity,
    p_input_sha256: write.inputSha256,
    p_idempotency_key: write.idempotencyKey,
    p_expires_at: write.expiresAt,
  };
}

function listArgs(context: MemoryCandidateTransactionContext): Record<string, unknown> {
  return {
    p_care_space_id: context.scope.careSpaceId,
    p_child_id: context.scope.childId,
    p_session_id: context.sessionContext.sessionId,
    p_authorization_version: context.sessionContext.authorizationVersion,
    p_cutoff_at: context.sessionContext.cutoffAt,
  };
}

function requirePermission(scope: AuthorizedChildScope, permission: "read" | "record"): void {
  if (!scope.permissions.includes(permission)) throw new Error("MEMORY_CANDIDATE_NOT_AUTHORIZED");
}

export function createMemoryCandidateRepository(client: Client): MemoryCandidateRepository {
  const dynamic = rpcClient(client);
  return Object.freeze({
    async capturePending(context: MemoryCandidateTransactionContext, write: MemoryCandidateWrite): Promise<MemoryCandidateRepositoryResult> {
      requirePermission(context.scope, "record");
      const result = await dynamic.rpc("capture_memory_candidate", writeArgs(context, write));
      if (result.error) throw new Error("MEMORY_CANDIDATE_RPC_FAILED");
      const raw = firstRow(result.data);
      if (!raw || typeof raw.outcome !== "string") throw new Error("MEMORY_CANDIDATE_RPC_EMPTY");
      if (raw.outcome === "conflict") return { outcome: "conflict" };
      if (raw.outcome !== "created" && raw.outcome !== "idempotent_replay" && raw.outcome !== "source_replay") {
        throw new Error("MEMORY_CANDIDATE_OUTCOME_INVALID");
      }
      return { outcome: raw.outcome, row: rowFrom(raw) };
    },
    async listPending(context: MemoryCandidateTransactionContext): Promise<readonly MemoryCandidateRepositoryRow[]> {
      requirePermission(context.scope, "read");
      const result = await dynamic.rpc("list_pending_memory_candidates", listArgs(context));
      if (result.error || !Array.isArray(result.data)) throw new Error("MEMORY_CANDIDATE_RPC_FAILED");
      return Object.freeze(result.data.map(rowFrom));
    },
  });
}
