import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createMemorySearchRepository } from "../../src/persistence/supabase/memory-search-repository";

const ACTOR = "00000000-0000-4000-8000-000000000801";
const SPACE = "00000000-0000-4000-8000-000000000802";
const CHILD = "00000000-0000-4000-8000-000000000803";
const SESSION = "00000000-0000-4000-8000-000000000804";
const ITEM = "00000000-0000-4000-8000-000000000805";
const CUTOFF = "2026-08-23T20:00:00.000Z";
const VERSION = "google.gemini-embedding-2.768.l2.cosine.v1";
const vector = Object.freeze([1, ...Array<number>(767).fill(0)]);

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: ACTOR,
  careSpaceId: SPACE,
  childId: CHILD,
  permissions: ["read"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-23T19:56:00.000Z"),
  expiresAt: new Date("2026-08-23T20:01:00.000Z"),
});

const context = Object.freeze({ scope, sessionId: SESSION, cutoffAt: CUTOFF });

describe("child-scoped memory search repository", () => {
  it("sends trusted scope and pinned embedding identity to one bounded RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        memory_item_id: ITEM,
        memory_type: "preference",
        searchable_text: "Prefers blue cups.",
        provenance_type: "chat",
        provenance_source_id: "source-1",
        provenance_captured_at: "2026-08-23T19:55:00+00:00",
        confirmed_at: "2026-08-23T19:56:00+00:00",
        similarity: 1,
      }],
      error: null,
    });
    const repository = createMemorySearchRepository({ rpc } as never);

    await expect(repository.search(context, { vector, compatibilityVersion: VERSION }, { threshold: 0.7, limit: 4 }))
      .resolves.toEqual([{
        memoryItemId: ITEM,
        memoryType: "preference",
        text: "Prefers blue cups.",
        provenance: {
          type: "chat",
          sourceId: "source-1",
          capturedAt: "2026-08-23T19:55:00.000Z",
        },
        confirmedAt: "2026-08-23T19:56:00.000Z",
        similarity: 1,
      }]);
    expect(rpc).toHaveBeenCalledWith("match_clinical_memory", {
      p_care_space_id: SPACE,
      p_child_id: CHILD,
      p_session_id: SESSION,
      p_authorization_version: "m:1:a:1",
      p_cutoff_at: CUTOFF,
      p_query_embedding: `[${vector.join(",")}]`,
      p_embedding_model: VERSION,
      p_match_threshold: 0.7,
      p_match_count: 4,
    });
  });

  it.each([
    [[Number.NaN, ...Array<number>(767).fill(0)], "MEMORY_SEARCH_QUERY_INVALID"],
    [[1], "MEMORY_SEARCH_QUERY_INVALID"],
    [Array<number>(768).fill(0), "MEMORY_SEARCH_QUERY_INVALID"],
  ])("rejects an invalid query vector without calling Cloud", async (invalid, code) => {
    const rpc = vi.fn();
    const repository = createMemorySearchRepository({ rpc } as never);
    await expect(repository.search(context, { vector: invalid, compatibilityVersion: VERSION }, { threshold: 0.7, limit: 4 }))
      .rejects.toThrow(code);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed for missing permission, provider drift, invalid policy, RPC errors, or malformed rows", async () => {
    const unreadableScope = createAuthorizedChildScopeFromTrustedRow({
      actorUserId: ACTOR,
      careSpaceId: SPACE,
      childId: CHILD,
      permissions: ["record"],
      countryOfCare: "CO",
      timezone: "America/Bogota",
      authorizationVersion: "m:1:a:1",
      issuedAt: new Date("2026-08-23T19:56:00.000Z"),
      expiresAt: new Date("2026-08-23T20:01:00.000Z"),
    });
    const rpc = vi.fn().mockResolvedValue({ data: [{}], error: null });
    const repository = createMemorySearchRepository({ rpc } as never);

    await expect(repository.search({ ...context, scope: unreadableScope }, { vector, compatibilityVersion: VERSION }, { threshold: 0.7, limit: 4 }))
      .rejects.toThrow("MEMORY_SEARCH_NOT_AUTHORIZED");
    await expect(repository.search(context, { vector, compatibilityVersion: "other" }, { threshold: 0.7, limit: 4 }))
      .rejects.toThrow("MEMORY_SEARCH_QUERY_INVALID");
    await expect(repository.search(context, { vector, compatibilityVersion: VERSION }, { threshold: -1, limit: 99 }))
      .rejects.toThrow("MEMORY_SEARCH_POLICY_INVALID");
    await expect(repository.search(context, { vector, compatibilityVersion: VERSION }, { threshold: 0.7, limit: 4 }))
      .rejects.toThrow("MEMORY_SEARCH_RESULT_INVALID");

    rpc.mockResolvedValueOnce({ data: null, error: { message: "sensitive provider detail" } });
    await expect(repository.search(context, { vector, compatibilityVersion: VERSION }, { threshold: 0.7, limit: 4 }))
      .rejects.toThrow("MEMORY_SEARCH_RPC_FAILED");
  });
});
