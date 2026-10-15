import { FatalError, RetryableError } from "workflow";

export type MemoryEmbeddingInput = Readonly<{
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  sessionId: string;
  memoryItemId: string;
  contentSha256: string;
  compatibilityVersion: string;
  operation: "upsert" | "remove";
}>;

export type MemoryEligibility = Readonly<{ eligible: true; searchableText: string; contentSha256: string } | { eligible: false; reason: "revoked" | "deleted" | "expired" | "scope_mismatch" }>;
export type MemoryEmbeddingPorts = Readonly<{
  loadEligibility(input: MemoryEmbeddingInput): Promise<MemoryEligibility>;
  embedMemory(text: string, compatibilityVersion: string): Promise<Readonly<{ vector: readonly number[]; vectorSha256: string; inputSha256: string }>>;
  persistEmbedding(input: MemoryEmbeddingInput, embedding: Readonly<{ vector: readonly number[]; vectorSha256: string; inputSha256: string }>): Promise<"indexed" | "idempotent_replay" | "conflict">;
  removeEmbedding(input: MemoryEmbeddingInput): Promise<"removed" | "idempotent_replay">;
}>;

let ports: MemoryEmbeddingPorts | null = null;
export function configureMemoryEmbeddingPorts(value: MemoryEmbeddingPorts | null): void { ports = value; }
function runtime(): MemoryEmbeddingPorts { if (!ports) throw new FatalError("MEMORY_EMBEDDING_RUNTIME_UNCONFIGURED"); return ports; }
function validInput(value: MemoryEmbeddingInput): boolean {
  return Object.values(value).every((item) => typeof item === "string" && item.length > 0 && item.length <= 512)
    && /^[a-f0-9]{64}$/u.test(value.contentSha256)
    && (value.operation === "upsert" || value.operation === "remove");
}

export async function loadEligibility(input: MemoryEmbeddingInput): Promise<MemoryEligibility> {
  "use step";
  if (!validInput(input)) throw new FatalError("MEMORY_EMBEDDING_INVALID_INPUT");
  try { return await runtime().loadEligibility(input); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("MEMORY_EMBEDDING_SOURCE_UNAVAILABLE", { retryAfter: "10s" });
  }
}

export async function embedMemory(input: MemoryEmbeddingInput, eligibility: MemoryEligibility): Promise<Readonly<{ vector: readonly number[]; vectorSha256: string; inputSha256: string }>> {
  "use step";
  if (!validInput(input) || !eligibility.eligible || eligibility.contentSha256 !== input.contentSha256) throw new FatalError("MEMORY_EMBEDDING_NOT_ELIGIBLE");
  if (eligibility.searchableText.length === 0 || eligibility.searchableText.length > 8_000) throw new FatalError("MEMORY_EMBEDDING_TEXT_INVALID");
  let result: Awaited<ReturnType<MemoryEmbeddingPorts["embedMemory"]>>;
  try { result = await runtime().embedMemory(eligibility.searchableText, input.compatibilityVersion); } catch {
    throw new RetryableError("MEMORY_EMBEDDING_PROVIDER_UNAVAILABLE", { retryAfter: "30s" });
  }
  if (!Array.isArray(result.vector) || result.vector.length !== 768 || result.vector.some((value) => !Number.isFinite(value))
    || !/^[a-f0-9]{64}$/u.test(result.vectorSha256) || !/^[a-f0-9]{64}$/u.test(result.inputSha256)) {
    throw new FatalError("MEMORY_EMBEDDING_RESULT_INVALID");
  }
  return Object.freeze({ vector: Object.freeze([...result.vector]), vectorSha256: result.vectorSha256, inputSha256: result.inputSha256 });
}

export async function persistEmbedding(input: MemoryEmbeddingInput, embedding: Readonly<{ vector: readonly number[]; vectorSha256: string; inputSha256: string }>): Promise<"indexed" | "idempotent_replay"> {
  "use step";
  if (!validInput(input) || input.operation !== "upsert") throw new FatalError("MEMORY_EMBEDDING_INVALID_OPERATION");
  const outcome = await runtime().persistEmbedding(input, embedding);
  if (outcome === "conflict") throw new FatalError("MEMORY_EMBEDDING_REPLAY_CONFLICT");
  return outcome;
}

export async function removeEmbedding(input: MemoryEmbeddingInput): Promise<"removed" | "idempotent_replay"> {
  "use step";
  if (!validInput(input) || input.operation !== "remove") throw new FatalError("MEMORY_EMBEDDING_INVALID_OPERATION");
  return runtime().removeEmbedding(input);
}

export async function memoryEmbeddingWorkflow(input: MemoryEmbeddingInput): Promise<Readonly<{ status: "indexed" | "removed" | "idempotent_replay" }>> {
  "use workflow";
  const eligibility = await loadEligibility(input);
  if (input.operation === "remove") return Object.freeze({ status: await removeEmbedding(input) });
  const embedding = await embedMemory(input, eligibility);
  return Object.freeze({ status: await persistEmbedding(input, embedding) });
}
