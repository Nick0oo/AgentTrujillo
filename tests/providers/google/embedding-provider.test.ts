import { describe, expect, it, vi } from "vitest";

import {
  CLINICAL_EMBEDDING_MODEL_ID,
  ClinicalEmbeddingProviderError,
  createClinicalEmbeddingProvider,
} from "../../../src/providers/google/embedding-provider";

const vector = (first = 1): number[] => [first, ...Array.from({ length: 767 }, () => 0)];

describe("Google clinical embedding provider", () => {
  it("pins stable gemini-embedding-2, 768 dimensions, document task, L2 and private telemetry", async () => {
    const embedOne = vi.fn().mockResolvedValue({ embedding: vector(2), usage: { tokens: 7 } });
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key" }, { embedOne });

    const result = await provider.embedDocument("Confirmed preference.");

    expect(CLINICAL_EMBEDDING_MODEL_ID).toBe("gemini-embedding-2");
    expect(embedOne).toHaveBeenCalledWith(expect.objectContaining({
      model: expect.objectContaining({ modelId: "gemini-embedding-2", provider: "google.generative-ai" }),
      value: "Confirmed preference.",
      maxRetries: 2,
      providerOptions: { google: { outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" } },
      telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
      abortSignal: expect.any(AbortSignal),
    }));
    expect(result.identity).toEqual({
      provider: "google",
      model: "gemini-embedding-2",
      taskType: "RETRIEVAL_DOCUMENT",
      dimensions: 768,
      normalization: "l2",
      metric: "cosine",
      compatibilityVersion: "google.gemini-embedding-2.768.l2.cosine.v1",
    });
    expect(result.vector).toHaveLength(768);
    expect(result.vector[0]).toBe(1);
    expect(result.usageTokens).toBe(7);
  });

  it("uses RETRIEVAL_QUERY in the same compatible vector space", async () => {
    const embedOne = vi.fn().mockResolvedValue({ embedding: vector(), usage: { tokens: 2 } });
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key" }, { embedOne });

    const result = await provider.embedQuery("What cup does the child prefer?");

    expect(embedOne).toHaveBeenCalledWith(expect.objectContaining({
      providerOptions: { google: { outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" } },
    }));
    expect(result.identity.taskType).toBe("RETRIEVAL_QUERY");
    expect(result.identity.compatibilityVersion).toBe("google.gemini-embedding-2.768.l2.cosine.v1");
  });

  it("normalizes finite vectors deterministically and hashes input/output", async () => {
    const raw = [3, 4, ...Array.from({ length: 766 }, () => 0)];
    const embedOne = vi.fn().mockResolvedValue({ embedding: raw, usage: { tokens: 2 } });
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key" }, { embedOne });

    const first = await provider.embedDocument("  Confirmed   preference.  ");
    const second = await provider.embedDocument("Confirmed preference.");

    expect(first.vector.slice(0, 2)).toEqual([0.6, 0.8]);
    expect(first.inputSha256).toBe(second.inputSha256);
    expect(first.vectorSha256).toBe(second.vectorSha256);
    expect(Object.isFrozen(first.vector)).toBe(true);
  });

  it.each([undefined, null, Number.NaN])("records unavailable provider usage (%s) as null instead of inventing tokens", async (tokens) => {
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key" }, {
      embedOne: vi.fn().mockResolvedValue({ embedding: vector(), usage: { tokens } }),
    });

    await expect(provider.embedDocument("Confirmed fact"))
      .resolves.toEqual(expect.objectContaining({ usageTokens: null }));
  });

  it("embeds bounded document batches in input order and rejects partial batches", async () => {
    const embedBatch = vi.fn().mockResolvedValue({ embeddings: [vector(1), vector(2)], usage: { tokens: 4 } });
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key", maxBatchSize: 2 }, { embedBatch });

    const result = await provider.embedDocuments(["One", "Two"]);

    expect(result).toHaveLength(2);
    expect(result[0].inputSha256).not.toBe(result[1].inputSha256);
    expect(embedBatch).toHaveBeenCalledWith(expect.objectContaining({
      values: ["One", "Two"],
      maxParallelCalls: 1,
      providerOptions: { google: { outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" } },
    }));

    embedBatch.mockResolvedValueOnce({ embeddings: [vector()], usage: { tokens: 1 } });
    await expect(provider.embedDocuments(["One", "Two"]))
      .rejects.toMatchObject({ code: "EMBEDDING_CONTRACT_VIOLATION" });
  });

  it("rejects empty, oversized, object-shaped, and oversized-batch input before a provider call", async () => {
    const embedOne = vi.fn();
    const embedBatch = vi.fn();
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key", maxInputChars: 8, maxBatchSize: 2 }, { embedOne, embedBatch });

    await expect(provider.embedDocument("   ")).rejects.toMatchObject({ code: "EMBEDDING_INPUT_INVALID" });
    await expect(provider.embedQuery("x".repeat(9))).rejects.toMatchObject({ code: "EMBEDDING_INPUT_INVALID" });
    await expect(provider.embedDocument({ childId: "forged" } as never)).rejects.toMatchObject({ code: "EMBEDDING_INPUT_INVALID" });
    await expect(provider.embedDocuments(["a", "b", "c"])).rejects.toMatchObject({ code: "EMBEDDING_INPUT_INVALID" });
    expect(embedOne).not.toHaveBeenCalled();
    expect(embedBatch).not.toHaveBeenCalled();
  });

  it.each([
    [vector().slice(0, 767), "dimension"],
    [[Number.NaN, ...Array.from({ length: 767 }, () => 0)], "non-finite"],
    [Array.from({ length: 768 }, () => 0), "zero norm"],
  ])("fails closed on %s vector contract drift", async (embedding) => {
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key" }, {
      embedOne: vi.fn().mockResolvedValue({ embedding, usage: { tokens: 1 } }),
    });

    await expect(provider.embedDocument("Confirmed fact"))
      .rejects.toMatchObject({ code: "EMBEDDING_CONTRACT_VIOLATION" });
  });

  it("maps provider failures to bounded errors without leaking provider text", async () => {
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key", maxRetries: 0 }, {
      embedOne: vi.fn().mockRejectedValue(Object.assign(new Error("secret child text"), { statusCode: 429 })),
    });

    const error = await provider.embedDocument("Confirmed fact").catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ClinicalEmbeddingProviderError);
    expect(error).toMatchObject({ code: "EMBEDDING_RATE_LIMITED", message: "EMBEDDING_RATE_LIMITED" });
    expect(String(error)).not.toContain("secret child text");
  });

  it("enforces timeout and external abort without fallback", async () => {
    const embedOne = vi.fn(({ abortSignal }: { abortSignal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
      abortSignal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const timed = createClinicalEmbeddingProvider({ apiKey: "test-key", timeoutMs: 10, maxRetries: 0 }, { embedOne });
    await expect(timed.embedDocument("Confirmed fact")).rejects.toMatchObject({ code: "EMBEDDING_TIMEOUT" });

    const controller = new AbortController();
    const aborted = createClinicalEmbeddingProvider({ apiKey: "test-key", timeoutMs: 1_000, maxRetries: 0 }, { embedOne });
    const pending = aborted.embedQuery("Confirmed query", { abortSignal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "EMBEDDING_ABORTED" });
  });

  it("emits only bounded PHI-safe metrics and ignores observer failures", async () => {
    const events: unknown[] = [];
    const observer = vi.fn((event: unknown) => {
      events.push(event);
      throw new Error("observer failure");
    });
    const provider = createClinicalEmbeddingProvider({ apiKey: "test-key", observe: observer }, {
      embedOne: vi.fn().mockResolvedValue({ embedding: vector(), usage: { tokens: 3 } }),
      now: (() => {
        let value = 0;
        return () => value += 5;
      })(),
    });

    await expect(provider.embedDocument("Private confirmed child fact")).resolves.toEqual(expect.objectContaining({ usageTokens: 3 }));
    expect(events).toEqual([{
      operation: "embedDocument",
      taskType: "RETRIEVAL_DOCUMENT",
      status: "ok",
      inputCount: 1,
      durationMs: 5,
      tokenCount: 3,
      failureClass: null,
    }]);
    expect(JSON.stringify(events)).not.toContain("Private confirmed child fact");
  });
});
