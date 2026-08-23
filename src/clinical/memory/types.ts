import { z } from "zod";

import type { CareSpaceId, ChildId } from "../../../agent/lib/access/authorized-child-scope";
import type { Sha256Hex } from "../governance/source-types";

declare const memoryCandidateIdBrand: unique symbol;
declare const memoryItemIdBrand: unique symbol;
declare const memoryChunkIdBrand: unique symbol;
declare const memoryEmbeddingIdBrand: unique symbol;

export type MemoryCandidateId = string & { readonly [memoryCandidateIdBrand]: true };
export type MemoryItemId = string & { readonly [memoryItemIdBrand]: true };
export type MemoryChunkId = string & { readonly [memoryChunkIdBrand]: true };
export type MemoryEmbeddingId = string & { readonly [memoryEmbeddingIdBrand]: true };

export type MemorySensitivity = "low" | "medium" | "high";
export type MemoryType =
  | "symptom"
  | "history"
  | "allergy"
  | "medication"
  | "vaccine"
  | "measurement"
  | "development"
  | "preference"
  | "summary";
export type MemoryProvenanceType = "guardian" | "professional" | "import" | "document" | "chat" | "system";
export type MemoryCandidateLifecycle = "pending" | "rejected" | "expired";
export type MemoryLifecycle = "active" | "superseded" | "deleted";
export type RetrievalEligibility = "eligible" | "ineligible";
export type MemoryConfirmationAction = "confirm" | "reject" | "correct" | "revoke";

export type MemoryScope = Readonly<{
  careSpaceId: CareSpaceId;
  childId: ChildId;
}>;

export type MemorySourceSpan = Readonly<{ start: number; end: number }>;

export type MemoryProvenance = Readonly<{
  type: MemoryProvenanceType;
  sourceId: string;
  capturedAt: string;
  sourceSpan?: MemorySourceSpan;
}>;

export type MemoryCandidateContent = Readonly<{
  text: string;
  sourceSpan: MemorySourceSpan;
}>;

export type MemoryCandidateInput = Readonly<{
  memoryType: MemoryType;
  content: MemoryCandidateContent;
  provenance: MemoryProvenance;
}>;

export type MemoryCandidate = MemoryCandidateInput & Readonly<{
  id: MemoryCandidateId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  extractionConfidence: number;
  sensitivity: MemorySensitivity;
  inputSha256: Sha256Hex;
  lifecycle: MemoryCandidateLifecycle;
  createdAt: string;
  expiresAt: string;
}>;

export type MemoryConfirmationDecision = Readonly<{
  decision: MemoryConfirmationAction;
  candidateId: MemoryCandidateId;
  candidateInputSha256: Sha256Hex;
  confirmationSha256: Sha256Hex;
  decidedAt: string;
}>;

export type ConfirmedMemoryItem = Readonly<{
  id: MemoryItemId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  memoryType: MemoryType;
  structuredContent: Readonly<Record<string, unknown>>;
  searchableText: string;
  provenance: MemoryProvenance;
  extractionConfidence: number;
  sensitivity: MemorySensitivity;
  lifecycle: MemoryLifecycle;
  retrievalEligibility: RetrievalEligibility;
  inputSha256: Sha256Hex;
  contentSha256: Sha256Hex;
  confirmationSha256: Sha256Hex;
  confirmedAt: string;
  validFrom: string;
  validUntil: string | null;
  supersedesId: MemoryItemId | null;
}>;

export type MemoryChunk = Readonly<{
  id: MemoryChunkId;
  memoryItemId: MemoryItemId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  ordinal: number;
  text: string;
  textSha256: Sha256Hex;
  chunkerVersion: string;
}>;

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export type EmbeddingIdentity = Readonly<{
  provider: "google";
  model: string;
  taskType: EmbeddingTaskType;
  dimensions: 768;
  normalization: "none" | "l2";
  metric: "cosine";
  compatibilityVersion: string;
}>;

export type MemoryEmbedding = Readonly<{
  id: MemoryEmbeddingId;
  memoryItemId: MemoryItemId;
  chunkId: MemoryChunkId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  identity: EmbeddingIdentity & Readonly<{ taskType: "RETRIEVAL_DOCUMENT" }>;
  inputSha256: Sha256Hex;
  vectorSha256: Sha256Hex;
  vector: readonly number[];
  createdAt: string;
}>;

export type RetrievalQueryInput = Readonly<{
  text: string;
}>;

export type RetrievalQuery = RetrievalQueryInput & Readonly<{
  inputSha256: Sha256Hex;
  scope: MemoryScope;
  identity: EmbeddingIdentity & Readonly<{ taskType: "RETRIEVAL_QUERY" }>;
  queryEmbedding: readonly number[];
  cutoffAt: string;
  threshold: number;
  limit: number;
}>;

export type MemoryCitation = Readonly<{
  kind: "memory" | "document" | "chat";
  referenceId: string;
  label: string;
  observedAt: string;
}>;

export type RetrievalHit = Readonly<{
  memoryItemId: MemoryItemId;
  chunkId: MemoryChunkId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  text: string;
  similarity: number;
  rank: number;
  cutoffAt: string;
  lifecycle: "active";
  confirmationStatus: "confirmed";
  citation: MemoryCitation;
}>;

export type PromptMemoryEntry = Readonly<{
  memoryItemId: MemoryItemId;
  chunkId: MemoryChunkId;
  text: string;
  observedAt: string;
  sourceLabel: string;
  confirmation: "confirmed";
  uncertainty: string;
  citations: readonly MemoryCitation[];
}>;

export type MemoryOmission = Readonly<{
  reason: "token_budget" | "stale" | "revoked" | "deleted" | "scope" | "policy";
  memoryItemId: MemoryItemId | null;
}>;

export type PromptMemoryContext = Readonly<{
  entries: readonly PromptMemoryEntry[];
  omitted: readonly MemoryOmission[];
  cutoffAt: string;
  tokenBudget: number;
  contextSha256: Sha256Hex;
  policyVersion: string;
}>;

const UUID = z.string().uuid();
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/);
const INSTANT = z.string().datetime({ offset: true });
const TEXT = (max: number) => z.string().min(1).max(max).refine((value) => value.trim().length > 0, "non-empty text");
const OPAQUE_ID = TEXT(256).refine((value) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(value), "opaque identifier");
const MEMORY_TYPE = z.enum([
  "symptom",
  "history",
  "allergy",
  "medication",
  "vaccine",
  "measurement",
  "development",
  "preference",
  "summary",
]);
const SENSITIVITY = z.enum(["low", "medium", "high"]);
const PROVENANCE_TYPE = z.enum(["guardian", "professional", "import", "document", "chat", "system"]);
const SPAN = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (value.end <= value.start) context.addIssue({ code: "custom", path: ["end"], message: "span_end" });
});
const PROVENANCE = z.object({
  type: PROVENANCE_TYPE,
  sourceId: OPAQUE_ID,
  capturedAt: INSTANT,
  sourceSpan: SPAN.optional(),
}).strict();
const CANDIDATE_CONTENT = z.object({
  text: TEXT(8_000),
  sourceSpan: SPAN,
}).strict();
const SCOPE = z.object({ careSpaceId: UUID, childId: UUID }).strict();

export const memoryTypeSchema = MEMORY_TYPE;
export const memorySensitivitySchema = SENSITIVITY;
export const memoryProvenanceSchema = PROVENANCE;
export const memoryCandidateContentSchema = CANDIDATE_CONTENT;
export const memoryScopeSchema = SCOPE;

const CANDIDATE_INPUT = z.object({
  memoryType: MEMORY_TYPE,
  content: CANDIDATE_CONTENT,
  provenance: PROVENANCE,
}).strict();

function validateCandidateSourceSpan(
  value: { content: { sourceSpan: { start: number; end: number } }; provenance: { sourceSpan?: { start: number; end: number } } },
  context: z.RefinementCtx,
): void {
  if (value.provenance.sourceSpan
    && (value.provenance.sourceSpan.start !== value.content.sourceSpan.start
      || value.provenance.sourceSpan.end !== value.content.sourceSpan.end)) {
    context.addIssue({ code: "custom", path: ["provenance", "sourceSpan"], message: "source_span_mismatch" });
  }
}

export const memoryCandidateInputSchema = CANDIDATE_INPUT.superRefine(validateCandidateSourceSpan);

export const memoryCandidateSchema = CANDIDATE_INPUT.extend({
  id: UUID,
  careSpaceId: UUID,
  childId: UUID,
  extractionConfidence: z.number().finite().min(0).max(1),
  sensitivity: SENSITIVITY,
  inputSha256: DIGEST,
  lifecycle: z.enum(["pending", "rejected", "expired"]),
  createdAt: INSTANT,
  expiresAt: INSTANT,
}).strict().superRefine((value, context) => {
  validateCandidateSourceSpan(value, context);
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "candidate_expiry" });
  }
});

export const memoryConfirmationDecisionSchema = z.object({
  decision: z.enum(["confirm", "reject", "correct", "revoke"]),
  candidateId: UUID,
  candidateInputSha256: DIGEST,
  confirmationSha256: DIGEST,
  decidedAt: INSTANT,
}).strict();

const STRUCTURED_CONTENT = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  const forbidden = new Set(["diagnosis", "prescription", "dose", "safeToAdminister", "reasoning", "chainOfThought", "rawPrompt"]);
  for (const key of Object.keys(value)) {
    if (forbidden.has(key)) context.addIssue({ code: "custom", path: [key], message: "forbidden_memory_field" });
  }
});

export const confirmedMemoryItemSchema = z.object({
  id: UUID,
  careSpaceId: UUID,
  childId: UUID,
  memoryType: MEMORY_TYPE,
  structuredContent: STRUCTURED_CONTENT,
  searchableText: TEXT(8_000),
  provenance: PROVENANCE,
  extractionConfidence: z.number().finite().min(0).max(1),
  sensitivity: SENSITIVITY,
  lifecycle: z.enum(["active", "superseded", "deleted"]),
  retrievalEligibility: z.enum(["eligible", "ineligible"]),
  inputSha256: DIGEST,
  contentSha256: DIGEST,
  confirmationSha256: DIGEST,
  confirmedAt: INSTANT,
  validFrom: INSTANT,
  validUntil: INSTANT.nullable(),
  supersedesId: UUID.nullable(),
}).strict().superRefine((value, context) => {
  if (value.lifecycle !== "active" && value.retrievalEligibility === "eligible") {
    context.addIssue({ code: "custom", path: ["retrievalEligibility"], message: "inactive_memory_must_be_ineligible" });
  }
  if (value.validUntil !== null && Date.parse(value.validUntil) <= Date.parse(value.validFrom)) {
    context.addIssue({ code: "custom", path: ["validUntil"], message: "validity_window" });
  }
});

export const memoryChunkSchema = z.object({
  id: UUID,
  memoryItemId: UUID,
  careSpaceId: UUID,
  childId: UUID,
  ordinal: z.number().int().nonnegative(),
  text: TEXT(8_000),
  textSha256: DIGEST,
  chunkerVersion: TEXT(128),
}).strict();

export const embeddingIdentitySchema = z.object({
  provider: z.literal("google"),
  model: TEXT(128),
  taskType: z.enum(["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]),
  dimensions: z.literal(768),
  normalization: z.enum(["none", "l2"]),
  metric: z.literal("cosine"),
  compatibilityVersion: TEXT(128),
}).strict();

const VECTOR = z.array(z.number().finite()).length(768).readonly();

export const memoryEmbeddingSchema = z.object({
  id: UUID,
  memoryItemId: UUID,
  chunkId: UUID,
  careSpaceId: UUID,
  childId: UUID,
  identity: embeddingIdentitySchema.extend({ taskType: z.literal("RETRIEVAL_DOCUMENT") }).strict(),
  inputSha256: DIGEST,
  vectorSha256: DIGEST,
  vector: VECTOR,
  createdAt: INSTANT,
}).strict();

export const retrievalQueryInputSchema = z.object({
  text: TEXT(8_000),
}).strict();

export const retrievalQuerySchema = z.object({
  scope: SCOPE,
  text: TEXT(8_000),
  inputSha256: DIGEST,
  identity: embeddingIdentitySchema.extend({ taskType: z.literal("RETRIEVAL_QUERY") }).strict(),
  queryEmbedding: VECTOR,
  cutoffAt: INSTANT,
  threshold: z.number().finite().min(0).max(1),
  limit: z.number().int().min(1).max(20),
}).strict();

export const memoryCitationSchema = z.object({
  kind: z.enum(["memory", "document", "chat"]),
  referenceId: OPAQUE_ID,
  label: TEXT(256),
  observedAt: INSTANT,
}).strict();

export const retrievalHitSchema = z.object({
  memoryItemId: UUID,
  chunkId: UUID,
  careSpaceId: UUID,
  childId: UUID,
  text: TEXT(8_000),
  similarity: z.number().finite().min(-1).max(1),
  rank: z.number().int().min(1),
  cutoffAt: INSTANT,
  lifecycle: z.literal("active"),
  confirmationStatus: z.literal("confirmed"),
  citation: memoryCitationSchema,
}).strict();

const PROMPT_ENTRY = z.object({
  memoryItemId: UUID,
  chunkId: UUID,
  text: TEXT(8_000),
  observedAt: INSTANT,
  sourceLabel: TEXT(256),
  confirmation: z.literal("confirmed"),
  uncertainty: TEXT(256),
  citations: z.array(memoryCitationSchema).max(16).readonly(),
}).strict();
const OMISSION = z.object({
  reason: z.enum(["token_budget", "stale", "revoked", "deleted", "scope", "policy"]),
  memoryItemId: UUID.nullable(),
}).strict();

export const promptMemoryContextSchema = z.object({
  entries: z.array(PROMPT_ENTRY).max(100).readonly(),
  omitted: z.array(OMISSION).max(100).readonly(),
  cutoffAt: INSTANT,
  tokenBudget: z.number().int().min(1).max(32_000),
  contextSha256: DIGEST,
  policyVersion: TEXT(128),
}).strict();
