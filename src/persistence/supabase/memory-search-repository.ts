import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { CLINICAL_EMBEDDING_COMPATIBILITY_VERSION } from "../../providers/google/embedding-provider.ts";
import type { Database } from "./database.types.ts";

type Client = SupabaseClient<Database>;
type RpcClient = Readonly<{
  rpc(name: string, args: Record<string, unknown>): Promise<Readonly<{
    data: unknown;
    error: Readonly<{ message: string }> | null;
  }>>;
}>;

const UUID = z.string().uuid();
const INSTANT = z.string().datetime({ offset: true });
const HIT = z.object({
  memory_item_id: UUID,
  memory_type: z.enum(["symptom", "history", "allergy", "medication", "vaccine", "measurement", "development", "preference", "summary"]),
  searchable_text: z.string().min(1).max(8_000),
  provenance_type: z.enum(["guardian", "professional", "import", "document", "chat", "system"]),
  provenance_source_id: z.string().min(1).max(256),
  provenance_captured_at: INSTANT,
  confirmed_at: INSTANT,
  similarity: z.number().finite().min(0).max(1),
}).strict();

export type MemorySearchContext = Readonly<{
  scope: AuthorizedChildScope;
  sessionId: string;
  cutoffAt: string;
}>;

export type MemorySearchQuery = Readonly<{
  vector: readonly number[];
  compatibilityVersion: string;
}>;

export type MemorySearchPolicy = Readonly<{
  threshold: number;
  limit: number;
}>;

export type MemorySearchHit = Readonly<{
  memoryItemId: string;
  memoryType: z.infer<typeof HIT>["memory_type"];
  text: string;
  provenance: Readonly<{
    type: z.infer<typeof HIT>["provenance_type"];
    sourceId: string;
    capturedAt: string;
  }>;
  confirmedAt: string;
  similarity: number;
}>;

export interface MemorySearchRepository {
  search(context: MemorySearchContext, query: MemorySearchQuery, policy: MemorySearchPolicy): Promise<readonly MemorySearchHit[]>;
}

function rpcClient(client: Client): RpcClient {
  return client as unknown as RpcClient;
}

function queryVector(query: MemorySearchQuery): string {
  if (query.compatibilityVersion !== CLINICAL_EMBEDDING_COMPATIBILITY_VERSION
    || !Array.isArray(query.vector)
    || query.vector.length !== 768
    || query.vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("MEMORY_SEARCH_QUERY_INVALID");
  }
  const norm = Math.sqrt(query.vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-6) throw new Error("MEMORY_SEARCH_QUERY_INVALID");
  return `[${query.vector.map((value) => Object.is(value, -0) ? 0 : value).join(",")}]`;
}

function validatedPolicy(policy: MemorySearchPolicy): MemorySearchPolicy {
  if (!policy || typeof policy !== "object"
    || typeof policy.threshold !== "number" || !Number.isFinite(policy.threshold)
    || policy.threshold < 0 || policy.threshold > 1
    || !Number.isInteger(policy.limit) || policy.limit < 1 || policy.limit > 20) {
    throw new Error("MEMORY_SEARCH_POLICY_INVALID");
  }
  return policy;
}

function instant(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("MEMORY_SEARCH_RESULT_INVALID");
  return parsed.toISOString();
}

export function createMemorySearchRepository(client: Client): MemorySearchRepository {
  const dynamic = rpcClient(client);
  return Object.freeze({
    async search(context: MemorySearchContext, query: MemorySearchQuery, rawPolicy: MemorySearchPolicy): Promise<readonly MemorySearchHit[]> {
      if (!context.scope.permissions.includes("read")) throw new Error("MEMORY_SEARCH_NOT_AUTHORIZED");
      const parsedContext = z.object({ sessionId: UUID, cutoffAt: INSTANT }).safeParse(context);
      if (!parsedContext.success) throw new Error("MEMORY_SEARCH_QUERY_INVALID");
      const vector = queryVector(query);
      const policy = validatedPolicy(rawPolicy);
      const result = await dynamic.rpc("match_clinical_memory", {
        p_care_space_id: context.scope.careSpaceId,
        p_child_id: context.scope.childId,
        p_session_id: context.sessionId,
        p_authorization_version: context.scope.authorizationVersion,
        p_cutoff_at: new Date(context.cutoffAt).toISOString(),
        p_query_embedding: vector,
        p_embedding_model: query.compatibilityVersion,
        p_match_threshold: policy.threshold,
        p_match_count: policy.limit,
      });
      if (result.error || !Array.isArray(result.data)) throw new Error("MEMORY_SEARCH_RPC_FAILED");
      const parsed = z.array(HIT).safeParse(result.data);
      if (!parsed.success) throw new Error("MEMORY_SEARCH_RESULT_INVALID");
      return Object.freeze(parsed.data.map((row) => Object.freeze({
        memoryItemId: row.memory_item_id,
        memoryType: row.memory_type,
        text: row.searchable_text,
        provenance: Object.freeze({
          type: row.provenance_type,
          sourceId: row.provenance_source_id,
          capturedAt: instant(row.provenance_captured_at),
        }),
        confirmedAt: instant(row.confirmed_at),
        similarity: row.similarity,
      })));
    },
  });
}
