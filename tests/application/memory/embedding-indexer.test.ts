import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope";
import {
  createMemoryEmbeddingIndexer,
  type MemoryEmbeddingIndexRepository,
} from "../../../src/application/memory/embedding-indexer";
import type { MemoryConfirmationItem } from "../../../src/persistence/supabase/memory-confirmation-repository";
import type { ClinicalEmbeddingProvider } from "../../../src/providers/google/embedding-provider";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const ITEM = "00000000-0000-4000-8000-000000000004";
const VERSION = "google.gemini-embedding-2.768.l2.cosine.v1";
const TEXT = "The child prefers blue cups.";
const TEXT_SHA = createHash("sha256").update(TEXT, "utf8").digest("hex");

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: ACTOR, careSpaceId: SPACE, childId: CHILD, permissions: ["read", "record"],
  countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-23T11:56:00.000Z"), expiresAt: new Date("2026-08-23T12:01:00.000Z"),
});

const item: MemoryConfirmationItem = {
  id: ITEM, careSpaceId: SPACE, childId: CHILD, memoryType: "preference",
  structuredContent: { text: TEXT }, searchableText: TEXT, provenanceType: "chat",
  sourceSessionId: null, sourceMessageId: null, provenanceSourceId: "message-1",
  provenanceCapturedAt: "2026-08-23T11:59:00.000Z", sourceSpanStart: 0,
  sourceSpanEnd: TEXT.length, extractionConfidence: 1, sensitivity: "low",
  lifecycle: "active", retrievalEligibility: "eligible", inputSha256: "a".repeat(64),
  contentSha256: "b".repeat(64), confirmationSha256: "c".repeat(64),
  confirmedAt: "2026-08-23T11:59:00.000Z", validFrom: "2026-08-23T11:59:00.000Z",
  validUntil: null, supersedesId: null,
};

const identity = {
  provider: "google" as const, model: "gemini-embedding-2", taskType: "RETRIEVAL_DOCUMENT" as const,
  dimensions: 768 as const, normalization: "l2" as const, metric: "cosine" as const,
  compatibilityVersion: VERSION,
};

function provider(overrides: Partial<ClinicalEmbeddingProvider> = {}): ClinicalEmbeddingProvider {
  return {
    documentIdentity: identity,
    queryIdentity: { ...identity, taskType: "RETRIEVAL_QUERY" },
    embedDocument: vi.fn().mockResolvedValue({
      identity, inputSha256: TEXT_SHA, vectorSha256: "e".repeat(64),
      vector: Object.freeze([1, ...Array.from({ length: 767 }, () => 0)]), usageTokens: null,
    }),
    embedDocuments: vi.fn(),
    embedQuery: vi.fn(),
    ...overrides,
  };
}

function repository(overrides: Partial<MemoryEmbeddingIndexRepository> = {}): MemoryEmbeddingIndexRepository {
  return {
    load: vi.fn().mockResolvedValue(item),
    replaceIfEligible: vi.fn().mockResolvedValue("indexed"),
    remove: vi.fn().mockResolvedValue("removed"),
    ...overrides,
  };
}

describe("MemoryEmbeddingIndexer", () => {
  it("indexes one deterministic chunk only from an active confirmed eligible fact", async () => {
    const embeddingProvider = provider();
    const indexRepository = repository();
    const indexer = createMemoryEmbeddingIndexer({ provider: embeddingProvider, repository: indexRepository }, { now: () => new Date("2026-08-23T12:00:00.000Z") });

    const result = await indexer.index(scope, ITEM, VERSION);

    expect(result).toEqual(expect.objectContaining({ ok: true, outcome: "indexed", chunkCount: 1 }));
    expect(embeddingProvider.embedDocument).toHaveBeenCalledWith(TEXT);
    expect(indexRepository.replaceIfEligible).toHaveBeenCalledWith(scope, expect.objectContaining({
      memoryItemId: ITEM, expectedContentSha256: item.contentSha256, compatibilityVersion: VERSION,
    }), [expect.objectContaining({
      careSpaceId: SPACE, childId: CHILD, memoryItemId: ITEM, ordinal: 0,
      text: TEXT, chunkerVersion: "memory-single-chunk.v1", identity,
      vector: expect.arrayContaining([1]),
    })]);
  });

  it.each([
    ["revoked", { retrievalEligibility: "ineligible" }],
    ["superseded", { lifecycle: "superseded", retrievalEligibility: "ineligible" }],
    ["expired", { validUntil: "2026-08-23T11:59:00.000Z" }],
    ["foreign", { childId: "00000000-0000-4000-8000-000000000099" }],
  ])("does not embed %s memory", async (_label, override) => {
    const embeddingProvider = provider();
    const indexRepository = repository({ load: vi.fn().mockResolvedValue({ ...item, ...override }) });

    const result = await createMemoryEmbeddingIndexer({ provider: embeddingProvider, repository: indexRepository }, { now: () => new Date("2026-08-23T12:00:00.000Z") })
      .index(scope, ITEM, VERSION);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "MEMORY_NOT_ELIGIBLE" });
    expect(embeddingProvider.embedDocument).not.toHaveBeenCalled();
    expect(indexRepository.replaceIfEligible).not.toHaveBeenCalled();
  });

  it("fails closed when the pinned version is stale or provider identity/vector drifts", async () => {
    const stale = await createMemoryEmbeddingIndexer({ provider: provider(), repository: repository() }, { now: () => new Date("2026-08-23T12:00:00.000Z") })
      .index(scope, ITEM, "old-space.v1");
    const driftProvider = provider({
      embedDocument: vi.fn().mockResolvedValue({
        identity: { ...identity, model: "other-model" }, inputSha256: TEXT_SHA,
        vectorSha256: "e".repeat(64), vector: [1], usageTokens: null,
      }),
    });
    const drift = await createMemoryEmbeddingIndexer({ provider: driftProvider, repository: repository() }, { now: () => new Date("2026-08-23T12:00:00.000Z") })
      .index(scope, ITEM, VERSION);

    expect(stale).toEqual({ ok: false, status: "unavailable", code: "EMBEDDING_VERSION_MISMATCH" });
    expect(drift).toEqual({ ok: false, status: "unavailable", code: "EMBEDDING_UNAVAILABLE" });
  });

  it("rechecks eligibility atomically after embedding and commits nothing on revocation race", async () => {
    const indexRepository = repository({ replaceIfEligible: vi.fn().mockResolvedValue("ineligible") });
    const result = await createMemoryEmbeddingIndexer({ provider: provider(), repository: indexRepository }, { now: () => new Date("2026-08-23T12:00:00.000Z") })
      .index(scope, ITEM, VERSION);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "MEMORY_NOT_ELIGIBLE" });
  });

  it("converges identical retries and produces stable row identities", async () => {
    const writes: unknown[] = [];
    const indexRepository = repository({
      replaceIfEligible: vi.fn(async (_scope, _expected, rows) => {
        writes.push(rows);
        return writes.length === 1 ? "indexed" as const : "idempotent_replay" as const;
      }),
    });
    let call = 0;
    const indexer = createMemoryEmbeddingIndexer({ provider: provider(), repository: indexRepository }, {
      now: () => new Date(call++ === 0 ? "2026-08-23T12:00:00.000Z" : "2026-08-23T12:00:30.000Z"),
    });

    const first = await indexer.index(scope, ITEM, VERSION);
    const replay = await indexer.index(scope, ITEM, VERSION);

    expect(first).toEqual(expect.objectContaining({ ok: true, outcome: "indexed" }));
    expect(replay).toEqual(expect.objectContaining({ ok: true, outcome: "idempotent_replay" }));
    expect(writes[0]).toEqual(writes[1]);
  });

  it("removes derived rows through the same trusted scope and maps storage failures", async () => {
    const indexRepository = repository();
    const indexer = createMemoryEmbeddingIndexer({ provider: provider(), repository: indexRepository }, { now: () => new Date("2026-08-23T12:00:00.000Z") });

    await expect(indexer.remove(scope, ITEM, VERSION)).resolves.toEqual({ ok: true, status: "available", outcome: "removed" });
    expect(indexRepository.remove).toHaveBeenCalledWith(scope, ITEM, VERSION);

    const failed = createMemoryEmbeddingIndexer({ provider: provider(), repository: repository({ remove: vi.fn().mockRejectedValue(new Error("db")) }) }, { now: () => new Date("2026-08-23T12:00:00.000Z") });
    await expect(failed.remove(scope, ITEM, VERSION)).resolves.toEqual({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" });
  });
});
