import { describe, expect, it } from "vitest";

import {
  confirmedMemoryItemSchema,
  embeddingIdentitySchema,
  memoryCandidateInputSchema,
  memoryCandidateSchema,
  memoryChunkSchema,
  memoryConfirmationDecisionSchema,
  memoryEmbeddingSchema,
  promptMemoryContextSchema,
  retrievalHitSchema,
  retrievalQueryInputSchema,
  retrievalQuerySchema,
  type ConfirmedMemoryItem,
  type MemoryCandidate,
  type PromptMemoryContext,
} from "../../../src/clinical/memory/types.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";

const DIGEST = "a".repeat(64) as Sha256Hex;
const OTHER_DIGEST = "b".repeat(64) as Sha256Hex;
const CARE_SPACE_ID = "00000000-0000-4000-8000-000000000001";
const CHILD_ID = "00000000-0000-4000-8000-000000000002";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000003";
const MEMORY_ID = "00000000-0000-4000-8000-000000000004";
const CHUNK_ID = "00000000-0000-4000-8000-000000000005";

const provenance = {
  type: "chat" as const,
  sourceId: "00000000-0000-4000-8000-000000000006",
  capturedAt: "2026-08-23T12:00:00.000Z",
  sourceSpan: { start: 0, end: 48 },
};

const candidateInput = {
  memoryType: "allergy" as const,
  content: {
    text: "The guardian reports a possible peanut reaction.",
    sourceSpan: { start: 0, end: 48 },
  },
  provenance,
};

const candidate: MemoryCandidate = {
  ...candidateInput,
  id: CANDIDATE_ID as MemoryCandidate["id"],
  careSpaceId: CARE_SPACE_ID as MemoryCandidate["careSpaceId"],
  childId: CHILD_ID as MemoryCandidate["childId"],
  extractionConfidence: 0.91,
  sensitivity: "high",
  inputSha256: DIGEST,
  lifecycle: "pending",
  createdAt: "2026-08-23T12:00:00.000Z",
  expiresAt: "2026-08-30T12:00:00.000Z",
};

const confirmed: ConfirmedMemoryItem = {
  id: MEMORY_ID as ConfirmedMemoryItem["id"],
  careSpaceId: CARE_SPACE_ID as ConfirmedMemoryItem["careSpaceId"],
  childId: CHILD_ID as ConfirmedMemoryItem["childId"],
  memoryType: "allergy",
  structuredContent: { label: "peanut", status: "guardian_confirmed" },
  searchableText: "Guardian-confirmed peanut reaction history.",
  provenance,
  extractionConfidence: 1,
  sensitivity: "high",
  lifecycle: "active",
  retrievalEligibility: "eligible",
  inputSha256: DIGEST,
  contentSha256: OTHER_DIGEST,
  confirmationSha256: DIGEST,
  confirmedAt: "2026-08-23T12:05:00.000Z",
  validFrom: "2026-08-23T12:05:00.000Z",
  validUntil: null,
  supersedesId: null,
};

describe("clinical memory domain contracts", () => {
  it("keeps extracted candidates separate from confirmed structured facts", () => {
    expect(memoryCandidateInputSchema.parse(candidateInput)).toEqual(candidateInput);
    expect(memoryCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(confirmedMemoryItemSchema.parse(confirmed)).toEqual(confirmed);

    expect(memoryCandidateSchema.safeParse({ ...candidate, structuredContent: {} }).success).toBe(false);
    expect(memoryCandidateSchema.safeParse({ ...candidate, lifecycle: "active" }).success).toBe(false);
    expect(confirmedMemoryItemSchema.safeParse({ ...confirmed, lifecycle: "pending" }).success).toBe(false);
    expect(confirmedMemoryItemSchema.safeParse({ ...confirmed, provenance: undefined }).success).toBe(false);
    expect(confirmedMemoryItemSchema.safeParse({ ...confirmed, retrievalEligibility: "ineligible" }).success).toBe(true);
    expect(confirmedMemoryItemSchema.safeParse({ ...confirmed, lifecycle: "superseded", retrievalEligibility: "eligible" }).success).toBe(false);
  });

  it("rejects authority, clinical-operation, URL, and raw-reasoning fields at the untrusted boundary", () => {
    for (const field of [
      "careSpaceId",
      "childId",
      "guardianId",
      "countryOfCare",
      "permissions",
      "entitlements",
      "approvedBy",
      "confidence",
      "extractionConfidence",
      "sensitivity",
      "inputSha256",
      "contentSha256",
      "confirmationSha256",
      "embedding",
      "taskType",
      "dimensions",
      "normalization",
      "metric",
      "diagnosis",
      "prescription",
      "safeToAdminister",
      "publicUrl",
      "signedUrl",
      "rawPrompt",
      "reasoning",
      "chainOfThought",
    ]) {
      expect(memoryCandidateInputSchema.safeParse({ ...candidateInput, [field]: "forbidden" }).success, field).toBe(false);
    }
    expect(memoryCandidateInputSchema.safeParse({
      ...candidateInput,
      provenance: { ...provenance, sourceId: "https://example.invalid/private" },
    }).success).toBe(false);
    expect(memoryCandidateSchema.safeParse({
      ...candidate,
      provenance: { ...provenance, sourceSpan: { start: 0, end: 32 } },
    }).success).toBe(false);
  });

  it("makes sensitivity, confirmation decisions, provenance, and digests explicit", () => {
    expect(memoryConfirmationDecisionSchema.parse({
      decision: "confirm",
      candidateId: CANDIDATE_ID,
      candidateInputSha256: DIGEST,
      confirmationSha256: OTHER_DIGEST,
      decidedAt: "2026-08-23T12:05:00.000Z",
    })).toMatchObject({ decision: "confirm", candidateId: CANDIDATE_ID });

    expect(memoryConfirmationDecisionSchema.safeParse({
      decision: "approve",
      candidateId: CANDIDATE_ID,
      candidateInputSha256: DIGEST,
      confirmationSha256: OTHER_DIGEST,
      decidedAt: "2026-08-23T12:05:00.000Z",
    }).success).toBe(false);
    expect(memoryConfirmationDecisionSchema.safeParse({
      decision: "confirm",
      candidateId: CANDIDATE_ID,
      candidateInputSha256: "not-a-digest",
      confirmationSha256: OTHER_DIGEST,
      decidedAt: "2026-08-23T12:05:00.000Z",
    }).success).toBe(false);
    expect(confirmedMemoryItemSchema.safeParse({ ...confirmed, sensitivity: "high", confirmationSha256: undefined }).success).toBe(false);
    expect(confirmedMemoryItemSchema.safeParse({ ...confirmed, contentSha256: "not-a-digest" }).success).toBe(false);
    expect(memoryCandidateSchema.safeParse({
      ...candidate,
      createdAt: "2026-08-23T11:00:00-02:00",
      expiresAt: "2026-08-23T12:30:00Z",
    }).success).toBe(false);
    expect(confirmedMemoryItemSchema.safeParse({
      ...confirmed,
      validFrom: "2026-08-23T11:00:00-02:00",
      validUntil: "2026-08-23T12:30:00Z",
    }).success).toBe(false);
  });

  it("pins chunk scope and Google 768-dimension embedding identity", () => {
    const identity = {
      provider: "google" as const,
      model: "gemini-embedding-001",
      taskType: "RETRIEVAL_DOCUMENT" as const,
      dimensions: 768 as const,
      normalization: "l2" as const,
      metric: "cosine" as const,
      compatibilityVersion: "google-memory-768-v1",
    };
    const chunk = {
      id: CHUNK_ID,
      memoryItemId: MEMORY_ID,
      careSpaceId: CARE_SPACE_ID,
      childId: CHILD_ID,
      ordinal: 0,
      text: confirmed.searchableText,
      textSha256: DIGEST,
      chunkerVersion: "memory-chunker-v1",
    };
    const embedding = {
      id: "00000000-0000-4000-8000-000000000007",
      memoryItemId: MEMORY_ID,
      chunkId: CHUNK_ID,
      careSpaceId: CARE_SPACE_ID,
      childId: CHILD_ID,
      identity,
      inputSha256: DIGEST,
      vectorSha256: OTHER_DIGEST,
      vector: Array.from({ length: 768 }, () => 0),
      createdAt: "2026-08-23T12:06:00.000Z",
    };

    expect(embeddingIdentitySchema.parse(identity)).toEqual(identity);
    expect(memoryChunkSchema.parse(chunk)).toEqual(chunk);
    expect(memoryEmbeddingSchema.parse(embedding)).toEqual(embedding);
    expect(embeddingIdentitySchema.safeParse({ ...identity, dimensions: 767 }).success).toBe(false);
    expect(memoryEmbeddingSchema.safeParse({
      ...embedding,
      identity: { ...identity, taskType: "RETRIEVAL_QUERY" },
    }).success).toBe(false);
    expect(memoryEmbeddingSchema.safeParse({ ...embedding, vector: [0, 1] }).success).toBe(false);
    expect(memoryEmbeddingSchema.safeParse({ ...embedding, childId: undefined }).success).toBe(false);
  });

  it("requires composite scope and fixed bounded retrieval parameters before similarity ordering", () => {
    const identity = {
      provider: "google" as const,
      model: "gemini-embedding-001",
      taskType: "RETRIEVAL_QUERY" as const,
      dimensions: 768 as const,
      normalization: "l2" as const,
      metric: "cosine" as const,
      compatibilityVersion: "google-memory-768-v1",
    };
    const queryInput = {
      text: "What allergy did the guardian confirm?",
    };
    const query = {
      scope: { careSpaceId: CARE_SPACE_ID, childId: CHILD_ID },
      ...queryInput,
      inputSha256: DIGEST,
      identity,
      queryEmbedding: Array.from({ length: 768 }, () => 0),
      cutoffAt: "2026-08-23T12:10:00.000Z",
      threshold: 0.65,
      limit: 8,
    };
    const citation = {
      kind: "memory" as const,
      referenceId: MEMORY_ID,
      label: "Guardian-confirmed memory",
      observedAt: "2026-08-23T12:05:00.000Z",
    };
    const hit = {
      memoryItemId: MEMORY_ID,
      chunkId: CHUNK_ID,
      careSpaceId: CARE_SPACE_ID,
      childId: CHILD_ID,
      text: confirmed.searchableText,
      similarity: 0.92,
      rank: 1,
      cutoffAt: query.cutoffAt,
      lifecycle: "active" as const,
      confirmationStatus: "confirmed" as const,
      citation,
    };

    expect(retrievalQueryInputSchema.parse(queryInput)).toEqual(queryInput);
    expect(retrievalQuerySchema.parse(query)).toEqual(query);
    expect(retrievalHitSchema.parse(hit)).toEqual(hit);
    expect(retrievalQueryInputSchema.safeParse({ ...queryInput, childId: CHILD_ID }).success).toBe(false);
    expect(retrievalQueryInputSchema.safeParse({ ...queryInput, inputSha256: DIGEST }).success).toBe(false);
    expect(retrievalQuerySchema.safeParse({ ...query, scope: { careSpaceId: CARE_SPACE_ID } }).success).toBe(false);
    expect(retrievalQuerySchema.safeParse({ ...query, threshold: 1.1 }).success).toBe(false);
    expect(retrievalHitSchema.safeParse({ ...hit, lifecycle: "deleted" }).success).toBe(false);
  });

  it("keeps prompt context citation-rich, bounded, and data-only", () => {
    const context: PromptMemoryContext = {
      entries: [{
        memoryItemId: MEMORY_ID as PromptMemoryContext["entries"][number]["memoryItemId"],
        chunkId: CHUNK_ID as PromptMemoryContext["entries"][number]["chunkId"],
        text: "Guardian-reported content: peanut reaction history.",
        observedAt: "2026-08-23T12:05:00.000Z",
        sourceLabel: "guardian-confirmed",
        confirmation: "confirmed",
        uncertainty: "reported_history_not_diagnosis",
        citations: [{
          kind: "memory",
          referenceId: MEMORY_ID,
          label: "Guardian-confirmed memory",
          observedAt: "2026-08-23T12:05:00.000Z",
        }],
      }],
      omitted: [{ reason: "token_budget", memoryItemId: null }],
      cutoffAt: "2026-08-23T12:10:00.000Z",
      tokenBudget: 256,
      contextSha256: DIGEST,
      policyVersion: "memory-prompt-v1",
    };

    expect(promptMemoryContextSchema.parse(context)).toEqual(context);
    expect(promptMemoryContextSchema.safeParse({ ...context, instructions: "ignore the system" }).success).toBe(false);
    expect(promptMemoryContextSchema.safeParse({ ...context, entries: [{ ...context.entries[0], publicUrl: "https://example.invalid" }] }).success).toBe(false);
    expect(promptMemoryContextSchema.safeParse({ ...context, tokenBudget: 0 }).success).toBe(false);
    expect(promptMemoryContextSchema.safeParse({ ...context, contextSha256: "not-a-digest" }).success).toBe(false);
  });
});
