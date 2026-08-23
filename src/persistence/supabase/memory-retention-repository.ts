import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  MemoryDeletionExecuteInput,
  MemoryDeletionExecutionRow,
  MemoryDeletionRequestInput,
  MemoryDeletionRequestRow,
  MemoryRetentionContext,
  MemoryRetentionRepository,
} from "../../application/memory/retention-service.ts";
import type { Database } from "./database.types.ts";

type Client = SupabaseClient<Database>;
type RpcClient = Readonly<{ rpc(name: string, args: Record<string, unknown>): Promise<Readonly<{ data: unknown; error: Readonly<{ message: string }> | null }>> }>;
const UUID = z.string().uuid();
const SCOPE = { care_space_id: UUID.nullable(), child_id: UUID.nullable(), memory_item_id: UUID.nullable(), request_id: UUID.nullable() } as const;
const REQUEST_ROW = z.object({ outcome: z.enum(["created", "idempotent_replay", "conflict"]), ...SCOPE, status: z.enum(["pending", "legal_hold", "completed"]).nullable() }).strict();
const EXECUTION_ROW = z.object({
  outcome: z.enum(["completed", "idempotent_replay", "legal_hold"]),
  care_space_id: UUID, child_id: UUID, memory_item_id: UUID, request_id: UUID,
  status: z.enum(["completed", "legal_hold"]),
  deleted_embeddings: z.number().int().nonnegative(), deleted_links: z.number().int().nonnegative(),
}).strict();

function dynamic(client: Client): RpcClient { return client as unknown as RpcClient; }
function first(data: unknown): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== "object" || Array.isArray(data[0])) throw new Error("MEMORY_RETENTION_RESULT_INVALID");
  return data[0] as Record<string, unknown>;
}

export function createMemoryRetentionRepository(requestClient: Client, privilegedJobClient: Client): MemoryRetentionRepository {
  const requestRpc = dynamic(requestClient);
  const jobRpc = dynamic(privilegedJobClient);
  return Object.freeze({
    async requestDeletion(context: MemoryRetentionContext, input: MemoryDeletionRequestInput): Promise<MemoryDeletionRequestRow> {
      const result = await requestRpc.rpc("request_memory_deletion", {
        p_care_space_id: context.scope.careSpaceId, p_child_id: context.scope.childId,
        p_session_id: context.sessionId, p_authorization_version: context.scope.authorizationVersion,
        p_cutoff_at: context.cutoffAt, p_memory_item_id: input.memoryItemId, p_request_id: input.requestId,
        p_idempotency_key: input.idempotencyKey, p_request_sha256: input.requestSha256,
      });
      if (result.error) throw new Error("MEMORY_RETENTION_RPC_FAILED");
      const parsed = REQUEST_ROW.safeParse(first(result.data));
      if (!parsed.success) throw new Error("MEMORY_RETENTION_RESULT_INVALID");
      const row = parsed.data;
      return Object.freeze({ outcome: row.outcome, requestId: row.request_id, memoryItemId: row.memory_item_id, careSpaceId: row.care_space_id, childId: row.child_id, status: row.status });
    },
    async execute(context: MemoryRetentionContext, input: MemoryDeletionExecuteInput): Promise<MemoryDeletionExecutionRow> {
      const result = await jobRpc.rpc("execute_memory_deletion", {
        p_care_space_id: context.scope.careSpaceId, p_child_id: context.scope.childId,
        p_request_id: input.requestId, p_memory_item_id: input.memoryItemId, p_proof_sha256: input.proofSha256,
      });
      if (result.error) throw new Error("MEMORY_RETENTION_RPC_FAILED");
      const parsed = EXECUTION_ROW.safeParse(first(result.data));
      if (!parsed.success) throw new Error("MEMORY_RETENTION_RESULT_INVALID");
      const row = parsed.data;
      return Object.freeze({ outcome: row.outcome, requestId: row.request_id, memoryItemId: row.memory_item_id, careSpaceId: row.care_space_id, childId: row.child_id, status: row.status, deletedEmbeddings: row.deleted_embeddings, deletedLinks: row.deleted_links });
    },
  });
}
