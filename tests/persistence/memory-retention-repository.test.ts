import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createMemoryRetentionRepository } from "../../src/persistence/supabase/memory-retention-repository";

const SPACE = "00000000-0000-4000-8000-000000001102";
const CHILD = "00000000-0000-4000-8000-000000001103";
const SESSION = "00000000-0000-4000-8000-000000001104";
const ITEM = "00000000-0000-4000-8000-000000001105";
const REQUEST = "00000000-0000-4000-8000-000000001106";
const DIGEST = "b".repeat(64);
const scope = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "00000000-0000-4000-8000-000000001101", careSpaceId: SPACE, childId: CHILD, permissions: ["record"], countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-08-23T20:56:00Z"), expiresAt: new Date("2026-08-23T21:01:00Z") });
const context = { scope, sessionId: SESSION, cutoffAt: "2026-08-23T21:00:00.000Z" };

describe("Cloud memory retention repository", () => {
  it("uses separate guardian and privileged RPC clients with exact composite scope", async () => {
    const requestRpc = vi.fn().mockResolvedValue({ data: [{ outcome: "created", request_id: REQUEST, memory_item_id: ITEM, care_space_id: SPACE, child_id: CHILD, status: "pending" }], error: null });
    const jobRpc = vi.fn().mockResolvedValue({ data: [{ outcome: "completed", request_id: REQUEST, memory_item_id: ITEM, care_space_id: SPACE, child_id: CHILD, status: "completed", deleted_embeddings: 1, deleted_links: 2 }], error: null });
    const repository = createMemoryRetentionRepository({ rpc: requestRpc } as never, { rpc: jobRpc } as never);

    await repository.requestDeletion(context, { memoryItemId: ITEM, requestId: REQUEST, idempotencyKey: "delete-1", requestSha256: DIGEST });
    await repository.execute(context, { memoryItemId: ITEM, requestId: REQUEST, proofSha256: DIGEST });

    expect(requestRpc).toHaveBeenCalledWith("request_memory_deletion", expect.objectContaining({ p_care_space_id: SPACE, p_child_id: CHILD, p_session_id: SESSION, p_authorization_version: "m:1:a:1", p_memory_item_id: ITEM }));
    expect(jobRpc).toHaveBeenCalledWith("execute_memory_deletion", { p_care_space_id: SPACE, p_child_id: CHILD, p_request_id: REQUEST, p_memory_item_id: ITEM, p_proof_sha256: DIGEST });
  });

  it("does not expose Cloud errors or accept malformed result rows", async () => {
    const requestRpc = vi.fn().mockResolvedValue({ data: [{}], error: null });
    const jobRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "sensitive" } });
    const repository = createMemoryRetentionRepository({ rpc: requestRpc } as never, { rpc: jobRpc } as never);
    await expect(repository.requestDeletion(context, { memoryItemId: ITEM, requestId: REQUEST, idempotencyKey: "delete-1", requestSha256: DIGEST })).rejects.toThrow("MEMORY_RETENTION_RESULT_INVALID");
    await expect(repository.execute(context, { memoryItemId: ITEM, requestId: REQUEST, proofSha256: DIGEST })).rejects.toThrow("MEMORY_RETENTION_RPC_FAILED");
  });
});
