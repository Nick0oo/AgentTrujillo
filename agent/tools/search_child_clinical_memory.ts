import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { authorizeToolInvocation } from "../lib/runtime/tool-permission-policy";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { mapToolError } from "../lib/runtime/safe-tool-errors";
import {
  createCitationHandle,
  projectToolResult,
  type ToolSafeProjectionMap,
} from "../lib/runtime/safe-to-model";
import { withToolAudit } from "../lib/runtime/tool-audit";
import { withToolIdempotency } from "../lib/runtime/tool-idempotency";
import {
  getTrustedToolAbortSignal,
  getTrustedToolServices,
  getTrustedToolSession,
  requireActiveChildScope,
  type ToolServicePorts,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import {
  buildPromptMemoryContext,
} from "../../src/clinical/memory/prompt-boundary";
import {
  memoryTypeSchema,
  type PromptMemoryContext,
  type MemoryType,
  type RetrievalHit,
} from "../../src/clinical/memory/types";
import {
  CLINICAL_EMBEDDING_COMPATIBILITY_VERSION,
  CLINICAL_EMBEDDING_DIMENSIONS,
  CLINICAL_EMBEDDING_MODEL_ID,
  type ClinicalEmbeddingProvider,
  type EmbeddingProviderIdentity,
} from "../../src/providers/google/embedding-provider";
import type {
  MemorySearchHit,
  MemorySearchRepository,
} from "../../src/persistence/supabase/memory-search-repository";

const TOOL_ID = "search_child_clinical_memory" as const;
const TOOL_SCHEMA_VERSION = "search-child-clinical-memory.v1" as const;
const TRUSTED_SCHEMA_VERSION = "search_child_clinical_memory.trusted.v1" as const;
const MODEL_SCHEMA_VERSION = "search_child_clinical_memory.model.v1" as const;
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const UUID = z.string().uuid();
const INSTANT = z.string().datetime({ offset: true });
const CITATION_HANDLE = z.string().regex(/^citation:v1:[a-f0-9]{64}$/u);
const MAX_QUERY_CHARS = 512;
const MAX_ENTRIES = 12;
const MAX_SEARCH_LIMIT = 20;
const SEARCH_THRESHOLD = 0.7;
const PROMPT_TOKEN_BUDGET = 2_048;
const PROMPT_POLICY_VERSION = "memory-prompt.v1" as const;
const CITATION_REFERENCE_CODE = "memory-confirmed";

const MEMORY_TYPES = z.array(memoryTypeSchema).max(9).readonly().superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", message: "duplicate_memory_type" });
  }
});

const SEARCH_WINDOW = z.object({
  from: INSTANT.optional(),
  to: INSTANT.optional(),
}).strict().superRefine((window, context) => {
  if (window.from && window.to && Date.parse(window.from) > Date.parse(window.to)) {
    context.addIssue({ code: "custom", message: "window_order" });
  }
});

const QUERY_INJECTION = /(?:\b(?:https?|s3|gs|file|javascript|data)\s*:\s*|<\s*\/?\s*(?:script|iframe|object|embed|form|input|button|a)\b|\b(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\s*[:=]|(?:ignore|forget|disregard|override|bypass|ignora|olvida|omite|anula).{0,80}(?:previous|prior|system|instruction|prompt|policy|anteriores?|sistema|instrucciones?|pol[ií]tica))/iu;
const CONTROL = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const SAFE_QUERY = z.string().min(1).max(MAX_QUERY_CHARS).refine((value) => (
  value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL.test(value)
    && !QUERY_INJECTION.test(value)
), "safe_memory_query");

/** Model input contains only semantic preferences; authority and retrieval policy stay trusted. */
export const SEARCH_CHILD_CLINICAL_MEMORY_INPUT_SCHEMA = z.object({
  query: SAFE_QUERY,
  memoryTypes: MEMORY_TYPES.optional(),
  window: SEARCH_WINDOW.optional(),
}).strict();
export type SearchChildClinicalMemoryInput = z.infer<typeof SEARCH_CHILD_CLINICAL_MEMORY_INPUT_SCHEMA>;

const SOURCE_KIND = z.enum(["guardian", "professional", "import", "document", "chat", "system"]);
const QUOTED_FACT = z.string().min(3).max(512).refine((value) => (
  value === value.normalize("NFKC")
    && value.startsWith('"')
    && value.endsWith('"')
    && !CONTROL.test(value)
    && !QUERY_INJECTION.test(value)
), "quoted_untrusted_fact");
const TRUSTED_ENTRY_SCHEMA = z.object({
  contentKind: z.literal("confirmed_untrusted_fact"),
  quotedFact: QUOTED_FACT,
  observedAt: INSTANT,
  sourceKind: SOURCE_KIND,
  citationHandles: z.array(CITATION_HANDLE).min(1).max(4).readonly(),
}).strict();

export const SEARCH_CHILD_CLINICAL_MEMORY_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: z.object({
    cutoffAt: INSTANT,
    entries: z.array(TRUSTED_ENTRY_SCHEMA).max(MAX_ENTRIES).readonly(),
    omittedCount: z.number().int().nonnegative().max(10_000),
  }).strict(),
}).strict();
export type SearchChildClinicalMemoryTrustedResult = Readonly<
  z.infer<typeof SEARCH_CHILD_CLINICAL_MEMORY_TRUSTED_RESULT_SCHEMA>
>;

export const SEARCH_CHILD_CLINICAL_MEMORY_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.literal("no_effect"),
  result: SEARCH_CHILD_CLINICAL_MEMORY_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: z.null(),
  requestSha256: HASH,
  approvalSha256: z.null(),
}).strict();
type SearchChildClinicalMemoryExecution = z.infer<typeof SEARCH_CHILD_CLINICAL_MEMORY_OUTPUT_SCHEMA>;
type SearchChildClinicalMemoryModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

type MemorySearchServices = ToolServicePorts & Readonly<{
  memoryEmbedding: Pick<ClinicalEmbeddingProvider, "queryIdentity" | "embedQuery">;
  memorySearch: MemorySearchRepository;
}>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "read_only" as const,
  operation: "no_effect",
  inputSchema: SEARCH_CHILD_CLINICAL_MEMORY_INPUT_SCHEMA,
  resultSchema: SEARCH_CHILD_CLINICAL_MEMORY_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "read_only" as const,
  operation: "no_effect",
});

const EMBEDDING_IDENTITY_SCHEMA = z.object({
  provider: z.literal("google"),
  model: z.literal(CLINICAL_EMBEDDING_MODEL_ID),
  taskType: z.literal("RETRIEVAL_QUERY"),
  dimensions: z.literal(CLINICAL_EMBEDDING_DIMENSIONS),
  normalization: z.literal("l2"),
  metric: z.literal("cosine"),
  compatibilityVersion: z.literal(CLINICAL_EMBEDDING_COMPATIBILITY_VERSION),
}).strict();
const EMBEDDING_RESULT_SCHEMA = z.object({
  identity: EMBEDDING_IDENTITY_SCHEMA,
  inputSha256: HASH,
  vectorSha256: HASH,
  vector: z.array(z.number().finite()).length(CLINICAL_EMBEDDING_DIMENSIONS).readonly(),
  usageTokens: z.number().int().nonnegative().nullable(),
}).strict();
const SEARCH_HIT_SCHEMA = z.object({
  memoryItemId: UUID,
  memoryType: memoryTypeSchema,
  text: z.string().min(1).max(8_000),
  provenance: z.object({
    type: SOURCE_KIND,
    sourceId: z.string().min(1).max(256),
    capturedAt: INSTANT,
  }).strict(),
  confirmedAt: INSTANT,
  similarity: z.number().finite().min(0).max(1),
}).strict();

function safeFailure(code: string): never {
  throw mapToolError(Object.freeze({ code }), { effectState: "none" });
}

function normalizedQuery(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function textDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deterministicUuid(value: unknown): string {
  const chars = digest(value).slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20).join("")}`;
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) safeFailure("CANCELLED");
}

function nowFor(context: TrustedToolContext): Date {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const clock = services.toolIdempotency as Readonly<{ now?: () => Date }> | undefined;
    const now = typeof clock?.now === "function" ? clock.now() : null;
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE");
    return new Date(now.getTime());
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
}

/** Recheck the immutable scope at each provider/repository boundary. */
function reauthorize(context: TrustedToolContext): AuthorizedChildScope {
  const signal = getTrustedToolAbortSignal(context);
  abortIfNeeded(signal);
  const now = nowFor(context);
  try {
    const scope = requireActiveChildScope(context, now);
    if (!authorizeToolInvocation(context, TOOL_ID, now).allowed) return safeFailure("FORBIDDEN");
    return scope;
  } catch {
    if (signal.aborted) return safeFailure("CANCELLED");
    return safeFailure("FORBIDDEN");
  }
}

function sameIdentity(
  actual: unknown,
  expectedTask: "RETRIEVAL_QUERY",
): boolean {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const identity = actual as Partial<EmbeddingProviderIdentity>;
  return identity.provider === "google"
    && identity.model === CLINICAL_EMBEDDING_MODEL_ID
    && identity.taskType === expectedTask
    && identity.dimensions === CLINICAL_EMBEDDING_DIMENSIONS
    && identity.normalization === "l2"
    && identity.metric === "cosine"
    && identity.compatibilityVersion === CLINICAL_EMBEDDING_COMPATIBILITY_VERSION;
}

function providerFailure(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) return safeFailure("CANCELLED");
  const code = error && typeof error === "object"
    ? (error as Readonly<{ code?: unknown }>).code
    : undefined;
  const message = error instanceof Error ? error.message : undefined;
  const source = typeof code === "string" ? code : message;
  if (source === "EMBEDDING_ABORTED") return safeFailure("CANCELLED");
  if (source === "EMBEDDING_TIMEOUT") return safeFailure("TIMEOUT");
  if (source === "EMBEDDING_RATE_LIMITED") return safeFailure("RATE_LIMITED");
  return safeFailure("PROVIDER_UNAVAILABLE");
}

function repositoryFailure(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) return safeFailure("CANCELLED");
  const code = error && typeof error === "object"
    ? (error as Readonly<{ code?: unknown }>).code
    : undefined;
  const message = error instanceof Error ? error.message : undefined;
  const source = typeof code === "string" ? code : message;
  if (source === "MEMORY_SEARCH_NOT_AUTHORIZED" || source === "ACCESS_DENIED" || source === "NOT_AUTHORIZED") {
    return safeFailure("FORBIDDEN");
  }
  return safeFailure("PERSISTENCE_UNAVAILABLE");
}

function searchServices(context: TrustedToolContext): MemorySearchServices {
  try {
    const services = getTrustedToolServices(context) as MemorySearchServices;
    if (!services.memoryEmbedding
      || typeof services.memoryEmbedding !== "object"
      || typeof services.memoryEmbedding.embedQuery !== "function"
      || !services.memoryEmbedding.queryIdentity
      || !services.memorySearch
      || typeof services.memorySearch !== "object"
      || typeof services.memorySearch.search !== "function") {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    return services;
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
}

function parseEmbedding(raw: unknown, query: string): readonly number[] {
  const parsed = EMBEDDING_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success || !sameIdentity(parsed.data.identity, "RETRIEVAL_QUERY")) {
    return safeFailure("PROVIDER_UNAVAILABLE");
  }
  const vectorDigest = digest(parsed.data.vector);
  if (parsed.data.inputSha256 !== textDigest(normalizedQuery(query)) || parsed.data.vectorSha256 !== vectorDigest) {
    return safeFailure("PROVIDER_UNAVAILABLE");
  }
  const norm = Math.sqrt(parsed.data.vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-6) return safeFailure("PROVIDER_UNAVAILABLE");
  return Object.freeze([...parsed.data.vector]);
}

function parseHits(raw: unknown): readonly MemorySearchHit[] {
  const parsed = z.array(SEARCH_HIT_SCHEMA).max(MAX_SEARCH_LIMIT).safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return Object.freeze(parsed.data.map((value) => Object.freeze({
    memoryItemId: value.memoryItemId,
    memoryType: value.memoryType,
    text: value.text,
    provenance: Object.freeze({ ...value.provenance }),
    confirmedAt: value.confirmedAt,
    similarity: value.similarity,
  })));
}

function citationFor(hit: MemorySearchHit): Readonly<{ referenceId: string; citationHandle: string; label: string }> {
  const sourceDigest = digest({
    domain: "tool-memory-citation-source.v1",
    memoryItemId: hit.memoryItemId,
    memoryType: hit.memoryType,
    sourceId: hit.provenance.sourceId,
    capturedAt: hit.provenance.capturedAt,
    confirmedAt: hit.confirmedAt,
    textSha256: digest(hit.text.normalize("NFKC").replace(/\s+/gu, " ").trim()),
  });
  const referenceParts = sourceDigest.match(/[a-f0-9]{16}/gu);
  if (!referenceParts || referenceParts.length !== 4) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return Object.freeze({
    referenceId: `memory-${referenceParts.join("-")}`,
    citationHandle: createCitationHandle(TOOL_ID, {
      sourceDigest,
      referenceCode: CITATION_REFERENCE_CODE,
    }),
    label: `confirmed-${hit.provenance.type}`,
  });
}

function sourceKindFromLabel(label: string): z.infer<typeof SOURCE_KIND> | null {
  const match = /^(?:confirmed)-(guardian|professional|import|document|chat|system)$/u.exec(label);
  return match?.[1] as z.infer<typeof SOURCE_KIND> | undefined ?? null;
}

function retrievalHits(
  hits: readonly MemorySearchHit[],
  scope: AuthorizedChildScope,
  cutoffAt: string,
  input: SearchChildClinicalMemoryInput,
): Readonly<{ hits: readonly RetrievalHit[]; omittedCount: number }> {
  const cutoffMs = Date.parse(cutoffAt);
  const lowerMs = input.window?.from ? Date.parse(input.window.from) : -Infinity;
  const upperMs = Date.parse(input.window?.to ?? cutoffAt);
  const allowedTypes = input.memoryTypes ? new Set<MemoryType>(input.memoryTypes) : null;
  let omittedCount = 0;
  const prepared = [] as Array<{
    hit: MemorySearchHit;
    capturedAtMs: number;
    confirmedAtMs: number;
    citation: Readonly<{ referenceId: string; citationHandle: string; label: string }>;
  }>;
  for (const hit of hits) {
    const capturedAtMs = Date.parse(hit.provenance.capturedAt);
    const confirmedAtMs = Date.parse(hit.confirmedAt);
    const normalizedText = hit.text.normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (!Number.isFinite(capturedAtMs)
      || !Number.isFinite(confirmedAtMs)
      || capturedAtMs > confirmedAtMs
      || confirmedAtMs > cutoffMs
      || capturedAtMs < lowerMs
      || capturedAtMs > upperMs
      || hit.similarity < SEARCH_THRESHOLD
      || (allowedTypes !== null && !allowedTypes.has(hit.memoryType))
      || JSON.stringify(normalizedText).length > 512) {
      omittedCount += 1;
      continue;
    }
    prepared.push(Object.freeze({ hit, capturedAtMs, confirmedAtMs, citation: citationFor(hit) }));
  }
  prepared.sort((left, right) => right.hit.similarity - left.hit.similarity
    || right.confirmedAtMs - left.confirmedAtMs
    || left.hit.memoryItemId.localeCompare(right.hit.memoryItemId)
    || left.hit.provenance.sourceId.localeCompare(right.hit.provenance.sourceId));
  const selected = new Set<string>();
  const retrieval: RetrievalHit[] = [];
  for (const value of prepared) {
    if (selected.has(value.hit.memoryItemId)) {
      omittedCount += 1;
      continue;
    }
    selected.add(value.hit.memoryItemId);
    retrieval.push({
      memoryItemId: value.hit.memoryItemId as RetrievalHit["memoryItemId"],
      chunkId: deterministicUuid({
        domain: "tool-memory-chunk.v1",
        memoryItemId: value.hit.memoryItemId,
        textSha256: digest(value.hit.text.normalize("NFKC").replace(/\s+/gu, " ").trim()),
      }) as RetrievalHit["chunkId"],
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      text: value.hit.text,
      similarity: value.hit.similarity,
      rank: retrieval.length + 1,
      cutoffAt,
      lifecycle: "active",
      confirmationStatus: "confirmed",
      citation: {
        kind: "memory",
        referenceId: value.citation.referenceId,
        label: value.citation.label,
        observedAt: value.hit.provenance.capturedAt,
      },
    });
  }
  return Object.freeze({ hits: Object.freeze(retrieval), omittedCount });
}

function trustedResult(
  context: PromptMemoryContext,
  cutoffAt: string,
  initialOmittedCount: number,
): SearchChildClinicalMemoryTrustedResult {
  const entries = [] as Array<z.infer<typeof TRUSTED_ENTRY_SCHEMA>>;
  let omittedCount = initialOmittedCount + context.omitted.length;
  for (const entry of context.entries) {
    const citation = entry.citations.length === 1 ? entry.citations[0] : null;
    const sourceKind = sourceKindFromLabel(entry.sourceLabel);
    const reference = citation && /^memory-([a-f0-9]{16}(?:-[a-f0-9]{16}){3})$/u.exec(citation.referenceId);
    if (!citation || !sourceKind || !reference || !QUOTED_FACT.safeParse(entry.text).success) {
      omittedCount += 1;
      continue;
    }
    entries.push({
      contentKind: "confirmed_untrusted_fact",
      quotedFact: entry.text,
      observedAt: entry.observedAt,
      sourceKind,
      citationHandles: Object.freeze([createCitationHandle(TOOL_ID, {
        sourceDigest: reference[1]!.replace(/-/gu, ""),
        referenceCode: CITATION_REFERENCE_CODE,
      })]),
    });
  }
  const result = SEARCH_CHILD_CLINICAL_MEMORY_TRUSTED_RESULT_SCHEMA.safeParse({
    kind: "trusted_tool_result",
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      cutoffAt,
      entries: Object.freeze(entries),
      omittedCount,
    },
  });
  if (!result.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return result.data;
}

export function projectSearchChildClinicalMemoryForModel(raw: unknown): SearchChildClinicalMemoryModelResult {
  const parsed = SEARCH_CHILD_CLINICAL_MEMORY_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      cutoffAt: parsed.data.data.cutoffAt,
      entries: parsed.data.data.entries.map((entry) => ({
        contentKind: entry.contentKind,
        quotedFact: entry.quotedFact,
        observedAt: entry.observedAt,
        sourceKind: entry.sourceKind,
        citationHandles: entry.citationHandles,
      })),
      omittedCount: parsed.data.data.omittedCount,
    },
  });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, rawInput) => {
    const trusted = runtime.trustedContext as TrustedToolContext<MemorySearchServices>;
    const services = searchServices(trusted);
    const signal = getTrustedToolAbortSignal(trusted);
    abortIfNeeded(signal);
    const parsedInput = SEARCH_CHILD_CLINICAL_MEMORY_INPUT_SCHEMA.safeParse(rawInput);
    if (!parsedInput.success) return safeFailure("INPUT_INVALID");
    const input = parsedInput.data;
    const initialScope = reauthorize(trusted);
    const now = nowFor(trusted);
    const cutoffAt = now.toISOString();
    if ((input.window?.from && Date.parse(input.window.from) > now.getTime())
      || (input.window?.to && Date.parse(input.window.to) > now.getTime())) {
      return safeFailure("INPUT_INVALID");
    }

    if (!sameIdentity(services.memoryEmbedding.queryIdentity, "RETRIEVAL_QUERY")) {
      return safeFailure("PROVIDER_UNAVAILABLE");
    }
    let embedding: unknown;
    try {
      embedding = await services.memoryEmbedding.embedQuery(input.query, { abortSignal: signal });
    } catch (error) {
      return providerFailure(error, signal);
    }
    abortIfNeeded(signal);
    const vector = parseEmbedding(embedding, input.query);

    const scope = reauthorize(trusted);
    if (scope.childId !== initialScope.childId || scope.careSpaceId !== initialScope.careSpaceId) {
      return safeFailure("FORBIDDEN");
    }
    const session = getTrustedToolSession(trusted);
    let rawHits: unknown;
    try {
      rawHits = await services.memorySearch.search(
        Object.freeze({
          scope,
          sessionId: session.productSessionId,
          cutoffAt,
        }),
        Object.freeze({
          vector,
          compatibilityVersion: CLINICAL_EMBEDDING_COMPATIBILITY_VERSION,
        }),
        Object.freeze({ threshold: SEARCH_THRESHOLD, limit: MAX_SEARCH_LIMIT }),
      );
    } catch (error) {
      return repositoryFailure(error, signal);
    }
    abortIfNeeded(signal);
    reauthorize(trusted);
    const hits = parseHits(rawHits);
    const prepared = retrievalHits(hits, scope, cutoffAt, input);
    const promptContext = buildPromptMemoryContext(prepared.hits, {
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      cutoffAt,
      tokenBudget: PROMPT_TOKEN_BUDGET,
      maxEntries: MAX_ENTRIES,
      policyVersion: PROMPT_POLICY_VERSION,
    });
    reauthorize(trusted);
    const result = trustedResult(promptContext, cutoffAt, prepared.omittedCount);
    return Object.freeze({ status: "no_effect" as const, result });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (context: TrustedToolContext, input: SearchChildClinicalMemoryInput) => {
    const result = await invokeIdempotently(context, input, null);
    if ("allowed" in result) return safeFailure("CONFIRMATION_INVALID");
    return result;
  },
);

export async function executeSearchChildClinicalMemory(
  context: TrustedToolContext,
  input: SearchChildClinicalMemoryInput,
): Promise<SearchChildClinicalMemoryExecution> {
  try {
    const raw = await invokeWithAudit(context, input);
    if (!SEARCH_CHILD_CLINICAL_MEMORY_OUTPUT_SCHEMA.safeParse(raw).success) {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    return raw as SearchChildClinicalMemoryExecution;
  } catch (error) {
    throw mapToolError(error, { effectState: "none" });
  }
}

export default defineTool({
  description: "Busca hechos de memoria clínica confirmados y activos del niño autorizado. Devuelve datos citados y no confiables para orientación; nunca diagnostica, prescribe ni cambia la autorización.",
  inputSchema: SEARCH_CHILD_CLINICAL_MEMORY_INPUT_SCHEMA,
  outputSchema: SEARCH_CHILD_CLINICAL_MEMORY_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeSearchChildClinicalMemory(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectSearchChildClinicalMemoryForModel(output.result));
  },
});
