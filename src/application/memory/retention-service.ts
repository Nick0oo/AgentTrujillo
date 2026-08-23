import { z } from "zod";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";

const UUID = z.string().uuid();
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const REQUEST_INPUT = z.object({
  memoryItemId: UUID,
  requestId: UUID,
  idempotencyKey: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/u),
  requestSha256: DIGEST,
}).strict();
const EXECUTE_INPUT = z.object({ memoryItemId: UUID, requestId: UUID, proofSha256: DIGEST }).strict();

export type MemoryRetentionContext = Readonly<{ scope: AuthorizedChildScope; sessionId: string; cutoffAt: string }>;
export type MemoryDeletionRequestInput = Readonly<z.infer<typeof REQUEST_INPUT>>;
export type MemoryDeletionExecuteInput = Readonly<z.infer<typeof EXECUTE_INPUT>>;

export type MemoryDeletionRequestRow = Readonly<{
  outcome: "created" | "idempotent_replay" | "conflict";
  requestId: string | null;
  memoryItemId: string | null;
  careSpaceId: string | null;
  childId: string | null;
  status: "pending" | "legal_hold" | "completed" | null;
}>;
export type MemoryDeletionExecutionRow = Readonly<{
  outcome: "completed" | "idempotent_replay" | "legal_hold";
  requestId: string;
  memoryItemId: string;
  careSpaceId: string;
  childId: string;
  status: "completed" | "legal_hold";
  deletedEmbeddings: number;
  deletedLinks: number;
}>;

export interface MemoryRetentionRepository {
  requestDeletion(context: MemoryRetentionContext, input: MemoryDeletionRequestInput): Promise<MemoryDeletionRequestRow>;
  execute(context: MemoryRetentionContext, input: MemoryDeletionExecuteInput): Promise<MemoryDeletionExecutionRow>;
}

export type MemoryRetentionResult = Readonly<{
  ok: true;
  outcome: MemoryDeletionRequestRow["outcome"] | MemoryDeletionExecutionRow["outcome"];
  requestId: string;
  memoryItemId: string;
  status: "pending" | "legal_hold" | "completed";
  deletedEmbeddings?: number;
  deletedLinks?: number;
}> | Readonly<{ ok: false; code: "INVALID_INPUT" | "NOT_AUTHORIZED" | "REPLAY_CONFLICT" | "STORAGE_UNAVAILABLE" }>;

function validContext(context: MemoryRetentionContext): boolean {
  return context.scope.permissions.includes("record")
    && UUID.safeParse(context.sessionId).success
    && INSTANT.safeParse(context.cutoffAt).success;
}

function sameScope(context: MemoryRetentionContext, row: { careSpaceId: string | null; childId: string | null }): boolean {
  return row.careSpaceId === context.scope.careSpaceId && row.childId === context.scope.childId;
}

export class MemoryRetentionService {
  constructor(private readonly repository: MemoryRetentionRepository) {}

  async requestDeletion(context: MemoryRetentionContext, raw: MemoryDeletionRequestInput): Promise<MemoryRetentionResult> {
    if (!validContext(context)) return Object.freeze({ ok: false, code: "NOT_AUTHORIZED" });
    const parsed = REQUEST_INPUT.safeParse(raw);
    if (!parsed.success) return Object.freeze({ ok: false, code: "INVALID_INPUT" });
    try {
      const row = await this.repository.requestDeletion(context, parsed.data);
      if (row.outcome === "conflict") return Object.freeze({ ok: false, code: "REPLAY_CONFLICT" });
      if (!row.requestId || !row.memoryItemId || !row.status || !sameScope(context, row)
        || row.requestId !== parsed.data.requestId || row.memoryItemId !== parsed.data.memoryItemId) {
        return Object.freeze({ ok: false, code: "STORAGE_UNAVAILABLE" });
      }
      return Object.freeze({ ok: true, outcome: row.outcome, requestId: row.requestId, memoryItemId: row.memoryItemId, status: row.status });
    } catch {
      return Object.freeze({ ok: false, code: "STORAGE_UNAVAILABLE" });
    }
  }

  async execute(context: MemoryRetentionContext, raw: MemoryDeletionExecuteInput): Promise<MemoryRetentionResult> {
    if (!validContext(context)) return Object.freeze({ ok: false, code: "NOT_AUTHORIZED" });
    const parsed = EXECUTE_INPUT.safeParse(raw);
    if (!parsed.success) return Object.freeze({ ok: false, code: "INVALID_INPUT" });
    try {
      const row = await this.repository.execute(context, parsed.data);
      if (!sameScope(context, row) || row.requestId !== parsed.data.requestId || row.memoryItemId !== parsed.data.memoryItemId) {
        return Object.freeze({ ok: false, code: "STORAGE_UNAVAILABLE" });
      }
      return Object.freeze({ ok: true, outcome: row.outcome, requestId: row.requestId, memoryItemId: row.memoryItemId, status: row.status, deletedEmbeddings: row.deletedEmbeddings, deletedLinks: row.deletedLinks });
    } catch {
      return Object.freeze({ ok: false, code: "STORAGE_UNAVAILABLE" });
    }
  }
}
