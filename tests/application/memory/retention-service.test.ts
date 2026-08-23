import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope";
import { MemoryRetentionService, type MemoryRetentionRepository } from "../../../src/application/memory/retention-service";

const ACTOR = "00000000-0000-4000-8000-000000001001";
const SPACE = "00000000-0000-4000-8000-000000001002";
const CHILD = "00000000-0000-4000-8000-000000001003";
const SESSION = "00000000-0000-4000-8000-000000001004";
const ITEM = "00000000-0000-4000-8000-000000001005";
const REQUEST = "00000000-0000-4000-8000-000000001006";
const CUTOFF = "2026-08-23T21:00:00.000Z";
const DIGEST = "a".repeat(64);

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: ACTOR, careSpaceId: SPACE, childId: CHILD, permissions: ["read", "record"],
  countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-23T20:56:00.000Z"), expiresAt: new Date("2026-08-23T21:01:00.000Z"),
});
const context = Object.freeze({ scope, sessionId: SESSION, cutoffAt: CUTOFF });

function repository(): MemoryRetentionRepository {
  return {
    requestDeletion: vi.fn().mockResolvedValue({ outcome: "created", requestId: REQUEST, memoryItemId: ITEM, status: "pending", careSpaceId: SPACE, childId: CHILD }),
    execute: vi.fn().mockResolvedValue({ outcome: "completed", requestId: REQUEST, memoryItemId: ITEM, status: "completed", careSpaceId: SPACE, childId: CHILD, deletedEmbeddings: 1, deletedLinks: 1 }),
  };
}

describe("memory retention service", () => {
  it("requests immediate retrieval revocation with trusted scope and stable replay identity", async () => {
    const port = repository();
    const service = new MemoryRetentionService(port);
    await expect(service.requestDeletion(context, { memoryItemId: ITEM, requestId: REQUEST, idempotencyKey: "delete-1", requestSha256: DIGEST }))
      .resolves.toEqual(expect.objectContaining({ ok: true, outcome: "created", status: "pending" }));
    expect(port.requestDeletion).toHaveBeenCalledWith(context, { memoryItemId: ITEM, requestId: REQUEST, idempotencyKey: "delete-1", requestSha256: DIGEST });
  });

  it("executes cleanup idempotently while preserving legal-hold status", async () => {
    const port = repository();
    const service = new MemoryRetentionService(port);
    await expect(service.execute(context, { memoryItemId: ITEM, requestId: REQUEST, proofSha256: DIGEST }))
      .resolves.toEqual(expect.objectContaining({ ok: true, outcome: "completed", deletedEmbeddings: 1, deletedLinks: 1 }));
    vi.mocked(port.execute).mockResolvedValueOnce({ outcome: "legal_hold", requestId: REQUEST, memoryItemId: ITEM, status: "legal_hold", careSpaceId: SPACE, childId: CHILD, deletedEmbeddings: 0, deletedLinks: 0 });
    await expect(service.execute(context, { memoryItemId: ITEM, requestId: REQUEST, proofSha256: DIGEST }))
      .resolves.toEqual(expect.objectContaining({ ok: true, outcome: "legal_hold" }));
  });

  it("fails closed before Cloud for invalid input, missing permission, conflict, or mixed scope", async () => {
    const port = repository();
    const service = new MemoryRetentionService(port);
    await expect(service.requestDeletion(context, { memoryItemId: "bad", requestId: REQUEST, idempotencyKey: "delete-1", requestSha256: DIGEST }))
      .resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    vi.mocked(port.requestDeletion).mockResolvedValueOnce({ outcome: "conflict", requestId: null, memoryItemId: null, status: null, careSpaceId: null, childId: null });
    await expect(service.requestDeletion(context, { memoryItemId: ITEM, requestId: REQUEST, idempotencyKey: "delete-1", requestSha256: DIGEST }))
      .resolves.toEqual({ ok: false, code: "REPLAY_CONFLICT" });
    vi.mocked(port.requestDeletion).mockResolvedValueOnce({ outcome: "created", requestId: REQUEST, memoryItemId: ITEM, status: "pending", careSpaceId: SPACE, childId: "00000000-0000-4000-8000-000000001099" });
    await expect(service.requestDeletion(context, { memoryItemId: ITEM, requestId: REQUEST, idempotencyKey: "delete-2", requestSha256: DIGEST }))
      .resolves.toEqual({ ok: false, code: "STORAGE_UNAVAILABLE" });
  });
});
