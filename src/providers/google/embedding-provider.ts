import { createHash } from "node:crypto";

import { createGoogle, type GoogleEmbeddingModelOptions } from "@ai-sdk/google";
import { embed, embedMany, type EmbeddingModel } from "ai";
import { canonicalize } from "json-canonicalize";

import type { EmbeddingIdentity, EmbeddingTaskType } from "../../clinical/memory/types.ts";
import type { Sha256Hex } from "../../clinical/governance/source-types.ts";

export const CLINICAL_EMBEDDING_MODEL_ID = "gemini-embedding-2" as const;
export const CLINICAL_EMBEDDING_DIMENSIONS = 768 as const;
export const CLINICAL_EMBEDDING_COMPATIBILITY_VERSION = "google.gemini-embedding-2.768.l2.cosine.v1" as const;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_BATCH_SIZE = 32;
const DEFAULT_MAX_INPUT_CHARS = 8_000;
const TELEMETRY = Object.freeze({ isEnabled: false, recordInputs: false, recordOutputs: false });

export type EmbeddingProviderIdentity = EmbeddingIdentity;

export type ClinicalEmbeddingResult = Readonly<{
  identity: EmbeddingProviderIdentity;
  inputSha256: Sha256Hex;
  vectorSha256: Sha256Hex;
  vector: readonly number[];
  usageTokens: number | null;
}>;

export type ClinicalEmbeddingCallOptions = Readonly<{ abortSignal?: AbortSignal }>;

export type ClinicalEmbeddingMetric = Readonly<{
  operation: "embedDocument" | "embedDocuments" | "embedQuery";
  taskType: EmbeddingTaskType;
  status: "ok" | "error";
  inputCount: number;
  durationMs: number;
  tokenCount: number | null;
  failureClass: ClinicalEmbeddingErrorCode | null;
}>;

export type ClinicalEmbeddingProviderConfig = Readonly<{
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxBatchSize?: number;
  maxInputChars?: number;
  observe?: (metric: ClinicalEmbeddingMetric) => void;
}>;

export type ClinicalEmbeddingErrorCode =
  | "EMBEDDING_INPUT_INVALID"
  | "EMBEDDING_CONTRACT_VIOLATION"
  | "EMBEDDING_RATE_LIMITED"
  | "EMBEDDING_MODEL_UNAVAILABLE"
  | "EMBEDDING_TIMEOUT"
  | "EMBEDDING_ABORTED"
  | "EMBEDDING_UNAVAILABLE";

export class ClinicalEmbeddingProviderError extends Error {
  readonly code: ClinicalEmbeddingErrorCode;

  constructor(code: ClinicalEmbeddingErrorCode) {
    super(code);
    this.name = "ClinicalEmbeddingProviderError";
    this.code = code;
  }
}

export interface ClinicalEmbeddingProvider {
  readonly documentIdentity: EmbeddingProviderIdentity & Readonly<{ taskType: "RETRIEVAL_DOCUMENT" }>;
  readonly queryIdentity: EmbeddingProviderIdentity & Readonly<{ taskType: "RETRIEVAL_QUERY" }>;
  embedDocument(text: string, options?: ClinicalEmbeddingCallOptions): Promise<ClinicalEmbeddingResult>;
  embedDocuments(texts: readonly string[], options?: ClinicalEmbeddingCallOptions): Promise<readonly ClinicalEmbeddingResult[]>;
  embedQuery(text: string, options?: ClinicalEmbeddingCallOptions): Promise<ClinicalEmbeddingResult>;
}

type EmbedResponse = Readonly<{
  embedding: readonly number[];
  usage: Readonly<{ tokens: number | null | undefined }>;
  warnings?: readonly unknown[];
}>;

type EmbedManyResponse = Readonly<{
  embeddings: readonly (readonly number[])[];
  usage: Readonly<{ tokens: number | null | undefined }>;
  warnings?: readonly unknown[];
}>;

type EmbedOneRequest = Readonly<{
  model: EmbeddingModel;
  value: string;
  providerOptions: Readonly<{ google: GoogleEmbeddingModelOptions }>;
  maxRetries: number;
  abortSignal: AbortSignal;
  telemetry: typeof TELEMETRY;
}>;

type EmbedBatchRequest = Readonly<{
  model: EmbeddingModel;
  values: readonly string[];
  providerOptions: Readonly<{ google: GoogleEmbeddingModelOptions }>;
  maxRetries: number;
  maxParallelCalls: number;
  abortSignal: AbortSignal;
  telemetry: typeof TELEMETRY;
}>;

type ProviderDependencies = Readonly<{
  embedOne?: (request: EmbedOneRequest) => Promise<EmbedResponse>;
  embedBatch?: (request: EmbedBatchRequest) => Promise<EmbedManyResponse>;
  now?: () => number;
}>;

type ValidatedConfig = Readonly<{
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  maxBatchSize: number;
  maxInputChars: number;
  observe?: (metric: ClinicalEmbeddingMetric) => void;
}>;

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isInteger(resolved) || typeof resolved !== "number" || resolved < minimum || resolved > maximum) {
    throw new ClinicalEmbeddingProviderError("EMBEDDING_INPUT_INVALID");
  }
  return resolved;
}

function validateConfig(config: ClinicalEmbeddingProviderConfig): ValidatedConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)
    || typeof config.apiKey !== "string" || config.apiKey.trim().length === 0
    || (config.observe !== undefined && typeof config.observe !== "function")) {
    throw new ClinicalEmbeddingProviderError("EMBEDDING_INPUT_INVALID");
  }
  return Object.freeze({
    apiKey: config.apiKey,
    timeoutMs: boundedInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 120_000),
    maxRetries: boundedInteger(config.maxRetries, DEFAULT_MAX_RETRIES, 0, 5),
    maxBatchSize: boundedInteger(config.maxBatchSize, DEFAULT_MAX_BATCH_SIZE, 1, 100),
    maxInputChars: boundedInteger(config.maxInputChars, DEFAULT_MAX_INPUT_CHARS, 1, 64_000),
    ...(config.observe ? { observe: config.observe } : {}),
  });
}

function identity(taskType: EmbeddingTaskType): EmbeddingProviderIdentity {
  return Object.freeze({
    provider: "google" as const,
    model: CLINICAL_EMBEDDING_MODEL_ID,
    taskType,
    dimensions: CLINICAL_EMBEDDING_DIMENSIONS,
    normalization: "l2" as const,
    metric: "cosine" as const,
    compatibilityVersion: CLINICAL_EMBEDDING_COMPATIBILITY_VERSION,
  });
}

function normalizeInput(raw: unknown, maximum: number): string {
  if (typeof raw !== "string") throw new ClinicalEmbeddingProviderError("EMBEDDING_INPUT_INVALID");
  const value = raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (value.length === 0 || value.length > maximum) {
    throw new ClinicalEmbeddingProviderError("EMBEDDING_INPUT_INVALID");
  }
  return value;
}

function digest(value: string): Sha256Hex {
  return createHash("sha256").update(value, "utf8").digest("hex") as Sha256Hex;
}

function normalizeVector(raw: readonly number[]): readonly number[] {
  if (!Array.isArray(raw) || raw.length !== CLINICAL_EMBEDDING_DIMENSIONS
    || raw.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new ClinicalEmbeddingProviderError("EMBEDDING_CONTRACT_VIOLATION");
  }
  const squaredNorm = raw.reduce((sum, value) => sum + value * value, 0);
  const norm = Math.sqrt(squaredNorm);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new ClinicalEmbeddingProviderError("EMBEDDING_CONTRACT_VIOLATION");
  }
  return Object.freeze(raw.map((value) => {
    const normalized = value / norm;
    return Object.is(normalized, -0) ? 0 : normalized;
  }));
}

function project(text: string, raw: readonly number[], usageTokens: number | null | undefined, taskType: EmbeddingTaskType): ClinicalEmbeddingResult {
  const boundedUsage = typeof usageTokens === "number" && Number.isInteger(usageTokens) && usageTokens >= 0
    ? usageTokens
    : null;
  const vector = normalizeVector(raw);
  return Object.freeze({
    identity: identity(taskType),
    inputSha256: digest(text),
    vectorSha256: digest(canonicalize(vector)),
    vector,
    usageTokens: boundedUsage,
  });
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { statusCode?: unknown; status?: unknown }).statusCode
    ?? (error as { status?: unknown }).status;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function mapFailure(error: unknown, timeoutSignal: AbortSignal, externalSignal?: AbortSignal): ClinicalEmbeddingProviderError {
  if (error instanceof ClinicalEmbeddingProviderError) return error;
  if (externalSignal?.aborted) return new ClinicalEmbeddingProviderError("EMBEDDING_ABORTED");
  if (timeoutSignal.aborted) return new ClinicalEmbeddingProviderError("EMBEDDING_TIMEOUT");
  const status = statusCode(error);
  if (status === 429) return new ClinicalEmbeddingProviderError("EMBEDDING_RATE_LIMITED");
  if (status === 404 || status === 400) return new ClinicalEmbeddingProviderError("EMBEDDING_MODEL_UNAVAILABLE");
  return new ClinicalEmbeddingProviderError("EMBEDDING_UNAVAILABLE");
}

function signalFor(timeoutMs: number, external?: AbortSignal): Readonly<{ signal: AbortSignal; timeout: AbortSignal }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  return Object.freeze({ signal: external ? AbortSignal.any([external, timeout]) : timeout, timeout });
}

function providerOptions(taskType: EmbeddingTaskType): Readonly<{ google: GoogleEmbeddingModelOptions }> {
  return Object.freeze({
    google: Object.freeze({
      outputDimensionality: CLINICAL_EMBEDDING_DIMENSIONS,
      taskType,
    } satisfies GoogleEmbeddingModelOptions),
  });
}

export function createClinicalEmbeddingProvider(
  rawConfig: ClinicalEmbeddingProviderConfig,
  dependencies: ProviderDependencies = {},
): ClinicalEmbeddingProvider {
  const config = validateConfig(rawConfig);
  const model = createGoogle({ apiKey: config.apiKey }).embeddingModel(CLINICAL_EMBEDDING_MODEL_ID);
  const embedOne = dependencies.embedOne ?? (async (request: EmbedOneRequest) => embed({
    ...request,
    providerOptions: request.providerOptions,
  }));
  const embedBatch = dependencies.embedBatch ?? (async (request: EmbedBatchRequest) => embedMany({
    ...request,
    values: [...request.values],
    providerOptions: request.providerOptions,
  }));
  const now = dependencies.now ?? (() => Date.now());

  const observe = (metric: ClinicalEmbeddingMetric): void => {
    try {
      config.observe?.(metric);
    } catch {
      // Observability is deliberately non-blocking and receives no clinical content.
    }
  };

  const embedSingle = async (
    operation: "embedDocument" | "embedQuery",
    taskType: EmbeddingTaskType,
    rawText: unknown,
    options: ClinicalEmbeddingCallOptions = {},
  ): Promise<ClinicalEmbeddingResult> => {
    const text = normalizeInput(rawText, config.maxInputChars);
    const startedAt = now();
    const signals = signalFor(config.timeoutMs, options.abortSignal);
    try {
      const response = await embedOne({
        model,
        value: text,
        providerOptions: providerOptions(taskType),
        maxRetries: config.maxRetries,
        abortSignal: signals.signal,
        telemetry: TELEMETRY,
      });
      if ((response.warnings?.length ?? 0) > 0) {
        throw new ClinicalEmbeddingProviderError("EMBEDDING_CONTRACT_VIOLATION");
      }
      const result = project(text, response.embedding, response.usage.tokens, taskType);
      observe(Object.freeze({ operation, taskType, status: "ok", inputCount: 1, durationMs: Math.max(0, now() - startedAt), tokenCount: result.usageTokens, failureClass: null }));
      return result;
    } catch (error) {
      const failure = mapFailure(error, signals.timeout, options.abortSignal);
      observe(Object.freeze({ operation, taskType, status: "error", inputCount: 1, durationMs: Math.max(0, now() - startedAt), tokenCount: null, failureClass: failure.code }));
      throw failure;
    }
  };

  const documentIdentity = identity("RETRIEVAL_DOCUMENT") as EmbeddingProviderIdentity & Readonly<{ taskType: "RETRIEVAL_DOCUMENT" }>;
  const queryIdentity = identity("RETRIEVAL_QUERY") as EmbeddingProviderIdentity & Readonly<{ taskType: "RETRIEVAL_QUERY" }>;

  return Object.freeze({
    documentIdentity,
    queryIdentity,
    embedDocument: (text: string, options?: ClinicalEmbeddingCallOptions) => embedSingle("embedDocument", "RETRIEVAL_DOCUMENT", text, options),
    embedQuery: (text: string, options?: ClinicalEmbeddingCallOptions) => embedSingle("embedQuery", "RETRIEVAL_QUERY", text, options),
    async embedDocuments(rawTexts: readonly string[], options: ClinicalEmbeddingCallOptions = {}): Promise<readonly ClinicalEmbeddingResult[]> {
      if (!Array.isArray(rawTexts) || rawTexts.length === 0 || rawTexts.length > config.maxBatchSize) {
        throw new ClinicalEmbeddingProviderError("EMBEDDING_INPUT_INVALID");
      }
      const texts = rawTexts.map((value) => normalizeInput(value, config.maxInputChars));
      const startedAt = now();
      const signals = signalFor(config.timeoutMs, options.abortSignal);
      try {
        const response = await embedBatch({
          model,
          values: texts,
          providerOptions: providerOptions("RETRIEVAL_DOCUMENT"),
          maxRetries: config.maxRetries,
          maxParallelCalls: 1,
          abortSignal: signals.signal,
          telemetry: TELEMETRY,
        });
        if (response.embeddings.length !== texts.length || (response.warnings?.length ?? 0) > 0) {
          throw new ClinicalEmbeddingProviderError("EMBEDDING_CONTRACT_VIOLATION");
        }
        const results = Object.freeze(response.embeddings.map((value, index) => (
          project(texts[index], value, response.usage.tokens, "RETRIEVAL_DOCUMENT")
        )));
        const tokenCount = typeof response.usage.tokens === "number" && Number.isInteger(response.usage.tokens) && response.usage.tokens >= 0
          ? response.usage.tokens
          : null;
        observe(Object.freeze({ operation: "embedDocuments", taskType: "RETRIEVAL_DOCUMENT", status: "ok", inputCount: texts.length, durationMs: Math.max(0, now() - startedAt), tokenCount, failureClass: null }));
        return results;
      } catch (error) {
        const failure = mapFailure(error, signals.timeout, options.abortSignal);
        observe(Object.freeze({ operation: "embedDocuments", taskType: "RETRIEVAL_DOCUMENT", status: "error", inputCount: texts.length, durationMs: Math.max(0, now() - startedAt), tokenCount: null, failureClass: failure.code }));
        throw failure;
      }
    },
  });
}
