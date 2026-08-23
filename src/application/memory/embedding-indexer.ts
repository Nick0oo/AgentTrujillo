import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";

import {
  hasPermission,
  isAuthorizedChildScopeActive,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import type { EmbeddingProviderIdentity } from "../../providers/google/embedding-provider.ts";
import type { ClinicalEmbeddingProvider } from "../../providers/google/embedding-provider.ts";
import type { MemoryConfirmationItem } from "../../persistence/supabase/memory-confirmation-repository.ts";

export const MEMORY_CHUNKER_VERSION = "memory-single-chunk.v1" as const;

export type MemoryEmbeddingIndexRow = Readonly<{
  id: string;
  memoryItemId: string;
  chunkId: string;
  careSpaceId: string;
  childId: string;
  ordinal: 0;
  text: string;
  textSha256: string;
  chunkerVersion: typeof MEMORY_CHUNKER_VERSION;
  identity: EmbeddingProviderIdentity & Readonly<{ taskType: "RETRIEVAL_DOCUMENT" }>;
  inputSha256: string;
  vectorSha256: string;
  vector: readonly number[];
  createdAt: string;
}>;

export type MemoryEmbeddingReplaceExpectation = Readonly<{
  memoryItemId: string;
  expectedContentSha256: string;
  compatibilityVersion: string;
}>;

export interface MemoryEmbeddingIndexRepository {
  load(scope: AuthorizedChildScope, memoryItemId: string): Promise<MemoryConfirmationItem | null>;
  replaceIfEligible(
    scope: AuthorizedChildScope,
    expectation: MemoryEmbeddingReplaceExpectation,
    rows: readonly MemoryEmbeddingIndexRow[],
  ): Promise<"indexed" | "idempotent_replay" | "ineligible" | "conflict">;
  remove(scope: AuthorizedChildScope, memoryItemId: string, compatibilityVersion: string): Promise<"removed" | "idempotent_replay">;
}

export type MemoryEmbeddingIndexerDependencies = Readonly<{
  provider: ClinicalEmbeddingProvider;
  repository: MemoryEmbeddingIndexRepository;
}>;

export type MemoryEmbeddingIndexerOptions = Readonly<{ now?: () => Date }>;

export type MemoryEmbeddingIndexerFailureCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "MEMORY_NOT_ELIGIBLE"
  | "EMBEDDING_VERSION_MISMATCH"
  | "EMBEDDING_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE";

export type MemoryEmbeddingIndexerResult =
  | Readonly<{
    ok: true;
    status: "available";
    outcome: "indexed" | "idempotent_replay";
    memoryItemId: string;
    chunkCount: 1;
    compatibilityVersion: string;
  }>
  | Readonly<{ ok: false; status: "unavailable"; code: MemoryEmbeddingIndexerFailureCode }>;

export type MemoryEmbeddingRemovalResult =
  | Readonly<{ ok: true; status: "available"; outcome: "removed" | "idempotent_replay" }>
  | Readonly<{ ok: false; status: "unavailable"; code: MemoryEmbeddingIndexerFailureCode }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

function validNow(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function scopeAllows(scope: AuthorizedChildScope, now: Date): boolean {
  try {
    return Object.isFrozen(scope)
      && Object.isFrozen(scope.permissions)
      && isAuthorizedChildScopeActive(scope, now)
      && hasPermission(scope, "record", now);
  } catch {
    return false;
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deterministicUuid(value: unknown): string {
  const hex = hash(canonicalize(value)).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function sameIdentity(left: EmbeddingProviderIdentity, right: EmbeddingProviderIdentity): boolean {
  return left.provider === right.provider
    && left.model === right.model
    && left.taskType === right.taskType
    && left.dimensions === right.dimensions
    && left.normalization === right.normalization
    && left.metric === right.metric
    && left.compatibilityVersion === right.compatibilityVersion;
}

function eligible(item: MemoryConfirmationItem, scope: AuthorizedChildScope, memoryItemId: string, now: Date): boolean {
  const validFrom = new Date(item.validFrom);
  const validUntil = item.validUntil === null ? null : new Date(item.validUntil);
  const confirmedAt = new Date(item.confirmedAt);
  return item.id === memoryItemId
    && item.careSpaceId === scope.careSpaceId
    && item.childId === scope.childId
    && item.lifecycle === "active"
    && item.retrievalEligibility === "eligible"
    && DIGEST.test(item.contentSha256)
    && Number.isFinite(confirmedAt.getTime())
    && confirmedAt <= now
    && Number.isFinite(validFrom.getTime())
    && validFrom <= now
    && (validUntil === null || (Number.isFinite(validUntil.getTime()) && validUntil > now));
}

function validEmbedding(
  result: Awaited<ReturnType<ClinicalEmbeddingProvider["embedDocument"]>>,
  expected: EmbeddingProviderIdentity,
  text: string,
): boolean {
  if (!sameIdentity(result.identity, expected)
    || result.identity.taskType !== "RETRIEVAL_DOCUMENT"
    || result.vector.length !== 768
    || result.vector.some((value) => !Number.isFinite(value))
    || !DIGEST.test(result.vectorSha256)
    || result.inputSha256 !== hash(text)) return false;
  const norm = Math.sqrt(result.vector.reduce((sum, value) => sum + value * value, 0));
  return Number.isFinite(norm) && Math.abs(norm - 1) <= 1e-6;
}

export class MemoryEmbeddingIndexer {
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: MemoryEmbeddingIndexerDependencies,
    options: MemoryEmbeddingIndexerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async index(scope: AuthorizedChildScope, memoryItemId: unknown, compatibilityVersion: unknown): Promise<MemoryEmbeddingIndexerResult> {
    const now = this.readNow();
    if (!now || !scopeAllows(scope, now)) return this.failure("NOT_AUTHORIZED");
    if (typeof memoryItemId !== "string" || !UUID.test(memoryItemId)
      || typeof compatibilityVersion !== "string" || compatibilityVersion.length === 0) {
      return this.failure("INVALID_INPUT");
    }
    const identity = this.dependencies.provider.documentIdentity;
    if (compatibilityVersion !== identity.compatibilityVersion) return this.failure("EMBEDDING_VERSION_MISMATCH");

    let item: MemoryConfirmationItem | null;
    try {
      item = await this.dependencies.repository.load(scope, memoryItemId);
    } catch {
      return this.failure("STORAGE_UNAVAILABLE");
    }
    if (!item || !eligible(item, scope, memoryItemId, now)) return this.failure("MEMORY_NOT_ELIGIBLE");
    const text = normalizeText(item.searchableText);
    if (text.length === 0 || text.length > 8_000) return this.failure("MEMORY_NOT_ELIGIBLE");

    let embedding: Awaited<ReturnType<ClinicalEmbeddingProvider["embedDocument"]>>;
    try {
      embedding = await this.dependencies.provider.embedDocument(text);
    } catch {
      return this.failure("EMBEDDING_UNAVAILABLE");
    }
    if (!validEmbedding(embedding, identity, text)) return this.failure("EMBEDDING_UNAVAILABLE");

    const textSha256 = hash(text);
    const chunkId = deterministicUuid({ schemaVersion: "memory-chunk-id.v1", memoryItemId, contentSha256: item.contentSha256, textSha256, chunkerVersion: MEMORY_CHUNKER_VERSION, ordinal: 0 });
    const id = deterministicUuid({ schemaVersion: "memory-embedding-id.v1", chunkId, compatibilityVersion });
    const row: MemoryEmbeddingIndexRow = Object.freeze({
      id,
      memoryItemId,
      chunkId,
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      ordinal: 0 as const,
      text,
      textSha256,
      chunkerVersion: MEMORY_CHUNKER_VERSION,
      identity: Object.freeze({ ...identity, taskType: "RETRIEVAL_DOCUMENT" as const }),
      inputSha256: embedding.inputSha256,
      vectorSha256: embedding.vectorSha256,
      vector: embedding.vector,
      createdAt: new Date(item.confirmedAt).toISOString(),
    });
    try {
      const outcome = await this.dependencies.repository.replaceIfEligible(
        scope,
        Object.freeze({ memoryItemId, expectedContentSha256: item.contentSha256, compatibilityVersion }),
        Object.freeze([row]),
      );
      if (outcome === "ineligible") return this.failure("MEMORY_NOT_ELIGIBLE");
      if (outcome === "conflict") return this.failure("STORAGE_UNAVAILABLE");
      return Object.freeze({ ok: true as const, status: "available" as const, outcome, memoryItemId, chunkCount: 1 as const, compatibilityVersion });
    } catch {
      return this.failure("STORAGE_UNAVAILABLE");
    }
  }

  async remove(scope: AuthorizedChildScope, memoryItemId: unknown, compatibilityVersion: unknown): Promise<MemoryEmbeddingRemovalResult> {
    const now = this.readNow();
    if (!now || !scopeAllows(scope, now)) return this.failure("NOT_AUTHORIZED");
    if (typeof memoryItemId !== "string" || !UUID.test(memoryItemId)
      || compatibilityVersion !== this.dependencies.provider.documentIdentity.compatibilityVersion) {
      return this.failure("INVALID_INPUT");
    }
    try {
      const outcome = await this.dependencies.repository.remove(scope, memoryItemId, compatibilityVersion);
      return Object.freeze({ ok: true as const, status: "available" as const, outcome });
    } catch {
      return this.failure("STORAGE_UNAVAILABLE");
    }
  }

  private readNow(): Date | null {
    try {
      const value = this.now();
      return validNow(value) ? new Date(value.getTime()) : null;
    } catch {
      return null;
    }
  }

  private failure(code: MemoryEmbeddingIndexerFailureCode) {
    return Object.freeze({ ok: false as const, status: "unavailable" as const, code });
  }
}

export function createMemoryEmbeddingIndexer(
  dependencies: MemoryEmbeddingIndexerDependencies,
  options: MemoryEmbeddingIndexerOptions = {},
): MemoryEmbeddingIndexer {
  return new MemoryEmbeddingIndexer(dependencies, options);
}
