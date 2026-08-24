import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { authorizeToolInvocation } from "../lib/runtime/tool-permission-policy";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { mapToolError, type ToolEffectState } from "../lib/runtime/safe-tool-errors";
import {
  projectToolResult,
  type ToolSafeProjectionMap,
} from "../lib/runtime/safe-to-model";
import { withToolAudit } from "../lib/runtime/tool-audit";
import {
  withToolIdempotency,
  type ToolApprovalSubmission,
} from "../lib/runtime/tool-idempotency";
import {
  getTrustedToolAbortSignal,
  getTrustedToolServices,
  getTrustedToolSession,
  requireActiveChildScope,
  type ToolServicePorts,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import {
  memoryCandidateSchema,
  memoryTypeSchema,
} from "../../src/clinical/memory/types";
import type {
  MemoryCandidateCaptureInput,
  MemoryCandidateCaptureResult,
  MemoryCandidateSessionContext,
} from "../../src/application/memory/candidate-service";

const TOOL_ID = "capture_clinical_memory_candidate" as const;
const TOOL_SCHEMA_VERSION = "capture-clinical-memory-candidate.v1" as const;
const TRUSTED_SCHEMA_VERSION = "capture_clinical_memory_candidate.trusted.v1" as const;
const MODEL_SCHEMA_VERSION = "capture_clinical_memory_candidate.model.v1" as const;

const UUID = z.string().uuid();
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const IDEMPOTENCY_KEY = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u);
const SOURCE_SPAN = z.object({
  start: z.number().int().nonnegative().max(64_000),
  end: z.number().int().positive().max(64_000),
}).strict().superRefine((value, context) => {
  if (value.end <= value.start) context.addIssue({ code: "custom", path: ["end"], message: "source_span" });
  if (value.end - value.start > 8_000) context.addIssue({ code: "custom", path: ["end"], message: "source_span_too_large" });
});

const CONTROL_OR_INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}]/u;
// Structural transport/markup hardening stays at the untrusted boundary. The
// domain service remains the source of truth for clinical/policy classification.
const UNSAFE_DATA = /(?:https?|s3|gs|file|javascript|data)\s*:\s*\/\/|<\s*\/?\s*(?:script|iframe|object|embed|form|input|button|a)\b/iu;
const LONG_ENCODED = /\b[A-Za-z0-9+/]{48,}={0,2}\b/u;
const URGENT_CONTENT = /\b(?:urgent(?:e)?|emergenc(?:y|ia)|not\s+breathing|can(?:not|'t)\s+breathe|difficulty\s+breathing|turning\s+blue|blue\s+(?:lips|face|skin)|seizure|unconscious|choking|heavy\s+bleeding|poison(?:ing)?|anaphylax(?:is)?|cannot\s+wake|no\s+respira|dificultad\s+para\s+respirar|se\s+(?:esta|está)\s+poniendo\s+azul|convuls(?:i[oó]n|iones?)?|inconsciente|atragantamiento|sangrado\s+abundante|intoxicaci[oó]n|anafilax(?:ia)?|no\s+despierta|letarg(?:ia|o))\b/iu;

function safeDataText(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL_OR_INVISIBLE.test(value)
    && !UNSAFE_DATA.test(value)
    && !LONG_ENCODED.test(value);
}

const CANDIDATE_TEXT = z.string().min(1).max(8_000).refine(safeDataText, "safe candidate text");
const CANDIDATE_CONTENT = z.object({
  text: CANDIDATE_TEXT,
  sourceSpan: SOURCE_SPAN,
}).strict();

/** Only a bounded excerpt and category are model-callable; all scope and lifecycle truth is trusted. */
export const CAPTURE_CLINICAL_MEMORY_CANDIDATE_INPUT_SCHEMA = z.object({
  memoryType: memoryTypeSchema,
  content: CANDIDATE_CONTENT,
  idempotencyKey: IDEMPOTENCY_KEY,
}).strict();

export type CaptureClinicalMemoryCandidateInput = z.infer<typeof CAPTURE_CLINICAL_MEMORY_CANDIDATE_INPUT_SCHEMA>;
type CaptureClinicalMemoryCandidateModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

const POLICY_METADATA = z.object({
  policyId: z.string().min(1).max(128).regex(/^[a-z][a-z0-9._-]*$/u),
  policyVersion: z.string().min(1).max(128).regex(/^[a-z][a-z0-9._-]*$/u),
  policySha256: HASH,
}).strict();

const DOMAIN_PREVIEW_SCHEMA = z.object({
  candidateId: UUID,
  candidateInputSha256: HASH,
  sensitivity: z.enum(["low", "medium", "high"]),
  allowedPurpose: z.literal("guardian_controlled_memory"),
  confirmation: z.object({
    required: z.literal(true),
    mode: z.enum(["explicit", "digest_bound"]),
  }).strict(),
  expiresAt: INSTANT,
  policy: POLICY_METADATA,
  policyDecisionSha256: HASH,
}).strict();

const DOMAIN_RESULT_SCHEMA = z.union([
  z.object({
    ok: z.literal(true),
    status: z.literal("pending"),
    outcome: z.enum(["created", "idempotent_replay", "source_replay"]),
    candidate: memoryCandidateSchema,
    confirmationPreview: DOMAIN_PREVIEW_SCHEMA,
  }).strict(),
  z.object({
    ok: z.literal(false),
    status: z.literal("unavailable"),
    code: z.string().min(1).max(96).regex(/^[A-Z][A-Z0-9_]*$/u),
  }).strict(),
]);

const TRUSTED_CANDIDATE_SCHEMA = z.object({
  candidateId: UUID,
  memoryType: memoryTypeSchema,
  text: CANDIDATE_TEXT,
  sourceSpan: SOURCE_SPAN,
  provenance: z.literal("chat"),
  inputSha256: HASH,
  lifecycle: z.literal("pending"),
}).strict();

const TRUSTED_DATA_SCHEMA = z.object({
  status: z.literal("pending_confirmation"),
  outcome: z.enum(["created", "idempotent_replay", "source_replay"]),
  candidate: TRUSTED_CANDIDATE_SCHEMA,
  sensitivity: z.enum(["low", "medium", "high"]),
  expiresAt: INSTANT,
  confirmation: z.object({
    required: z.literal(true),
    mode: z.enum(["explicit", "digest_bound"]),
    allowedPurpose: z.literal("guardian_controlled_memory"),
    candidateInputSha256: HASH,
    policy: POLICY_METADATA,
    policyDecisionSha256: HASH,
  }).strict(),
}).strict();

export const CAPTURE_CLINICAL_MEMORY_CANDIDATE_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: TRUSTED_DATA_SCHEMA,
}).strict();

export type CaptureClinicalMemoryCandidateTrustedResult = z.infer<
  typeof CAPTURE_CLINICAL_MEMORY_CANDIDATE_TRUSTED_RESULT_SCHEMA
>;

export const CAPTURE_CLINICAL_MEMORY_CANDIDATE_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  // Eve's idempotency envelope has only created/replayed outcomes. The
  // domain-specific source_replay remains preserved in the trusted result and
  // therefore in the safe-to-model projection.
  outcome: z.enum(["created", "replayed"]),
  result: CAPTURE_CLINICAL_MEMORY_CANDIDATE_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: z.string().regex(/^capture_clinical_memory_candidate:[a-f0-9]{64}$/u),
  requestSha256: HASH,
  approvalSha256: HASH,
}).strict();

export type CaptureClinicalMemoryCandidateExecution = z.infer<
  typeof CAPTURE_CLINICAL_MEMORY_CANDIDATE_OUTPUT_SCHEMA
>;

export type ClinicalMemoryCandidateSessionRequest = Readonly<{
  scope: AuthorizedChildScope;
  productSessionId: string;
  signal: AbortSignal;
}>;

/** Typed request-scoped bridge to the already verified Module 09 service. */
export type ClinicalMemoryCandidatePort = Readonly<{
  resolveCurrentSession(request: ClinicalMemoryCandidateSessionRequest): Promise<MemoryCandidateSessionContext>;
  capture(
    scope: AuthorizedChildScope,
    sessionContext: MemoryCandidateSessionContext,
    input: MemoryCandidateCaptureInput,
  ): Promise<MemoryCandidateCaptureResult>;
}>;

type CaptureClinicalMemoryCandidateServices = ToolServicePorts & Readonly<{
  memoryCandidates: ClinicalMemoryCandidatePort;
}>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "draft" as const,
  operation: "capture_clinical_memory_candidate.v1",
  inputSchema: CAPTURE_CLINICAL_MEMORY_CANDIDATE_INPUT_SCHEMA,
  resultSchema: CAPTURE_CLINICAL_MEMORY_CANDIDATE_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "draft" as const,
  operation: "capture_clinical_memory_candidate.v1",
});

function safeFailure(code: string, effectState: ToolEffectState = "unknown"): never {
  // mapToolError intentionally accepts source/provider codes. Keep public
  // SafeToolError names at this boundary without changing domain policy codes.
  const sourceCode = code === "CLINICAL_POLICY_UNAVAILABLE"
    ? "POLICY_UNAVAILABLE"
    : code === "RESOURCE_UNAVAILABLE"
      ? "NOT_AUTHORIZED"
      : code;
  throw mapToolError(Object.freeze({ code: sourceCode }), { effectState });
}

function abortIfNeeded(signal: AbortSignal, effectState: ToolEffectState = "none"): void {
  if (signal.aborted) safeFailure("CANCELLED", effectState);
}

function codeOf(error: unknown): string | null {
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const code = (error as Readonly<{ code?: unknown }>).code;
  return typeof code === "string" ? code : null;
}

function servicesFor(context: TrustedToolContext): CaptureClinicalMemoryCandidateServices {
  try {
    return getTrustedToolServices(context) as CaptureClinicalMemoryCandidateServices;
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  }
}

function nowFor(context: TrustedToolContext): Date {
  try {
    const services = servicesFor(context);
    const clock = services.toolIdempotency as Readonly<{ now?: () => Date }> | undefined;
    const now = typeof clock?.now === "function" ? clock.now() : new Date(Number.NaN);
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    return new Date(now);
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  }
}

function reauthorize(context: TrustedToolContext, effectState: ToolEffectState): AuthorizedChildScope {
  const signal = getTrustedToolAbortSignal(context);
  abortIfNeeded(signal, effectState);
  const now = nowFor(context);
  try {
    const scope = requireActiveChildScope(context, now);
    if (!authorizeToolInvocation(context, TOOL_ID, now).allowed) return safeFailure("FORBIDDEN", effectState);
    return scope;
  } catch (error) {
    if (codeOf(error) === "TOOL_CONTEXT_CANCELLED") return safeFailure("CANCELLED", effectState);
    return safeFailure("FORBIDDEN", effectState);
  }
}

function preflightInput(rawInput: unknown): void {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return;
  try {
    const content = (rawInput as Readonly<Record<string, unknown>>).content;
    if (!content || typeof content !== "object" || Array.isArray(content)) return;
    const text = (content as Readonly<Record<string, unknown>>).text;
    if (typeof text !== "string") return;
    const normalized = text.normalize("NFKC");
    if (URGENT_CONTENT.test(normalized) || CONTROL_OR_INVISIBLE.test(normalized) || UNSAFE_DATA.test(normalized) || LONG_ENCODED.test(normalized)) {
      safeFailure("INPUT_INVALID", "none");
    }
  } catch {
    safeFailure("INPUT_INVALID", "none");
  }
}

function canonicalText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function sessionIsBound(
  raw: MemoryCandidateSessionContext,
  scope: AuthorizedChildScope,
  productSessionId: string,
): boolean {
  try {
    return raw.sessionId === productSessionId
      && raw.ownerUserId === scope.actorUserId
      && raw.careSpaceId === scope.careSpaceId
      && raw.childId === scope.childId
      && raw.authorizationVersion === scope.authorizationVersion
      && raw.status === "active"
      && raw.sourceMessage.agentSessionId === productSessionId
      && raw.sourceMessage.actorType === "guardian"
      && raw.sourceMessage.actorUserId === scope.actorUserId
      && raw.sourceMessage.status === "completed";
  } catch {
    return false;
  }
}

function mapDomainFailure(code: string, effectState: ToolEffectState): never {
  if (code === "NOT_AUTHORIZED") return safeFailure("RESOURCE_UNAVAILABLE", effectState);
  if (code === "INVALID_INPUT" || code === "SOURCE_SPAN_MISMATCH") return safeFailure("INPUT_INVALID", effectState);
  if (code === "IDEMPOTENCY_CONFLICT") return safeFailure("IDEMPOTENCY_CONFLICT", "none");
  if (code === "SAFETY_BLOCKED"
    || code === "POLICY_DENIED"
    || code === "POLICY_REVIEW_REQUIRED"
    || code === "POLICY_UNAVAILABLE") return safeFailure("CLINICAL_POLICY_UNAVAILABLE", effectState);
  return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
}

function trustedResult(
  raw: unknown,
  input: CaptureClinicalMemoryCandidateInput,
  scope: AuthorizedChildScope,
  sessionContext: MemoryCandidateSessionContext,
): CaptureClinicalMemoryCandidateTrustedResult {
  const parsed = DOMAIN_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  if (!parsed.data.ok) return mapDomainFailure(parsed.data.code, "unknown");
  const value = parsed.data;
  const candidate = value.candidate;
  const preview = value.confirmationPreview;
  if (value.status !== "pending"
    || candidate.lifecycle !== "pending"
    || candidate.careSpaceId !== scope.careSpaceId
    || candidate.childId !== scope.childId
    || candidate.memoryType !== input.memoryType
    || candidate.content.sourceSpan.start !== input.content.sourceSpan.start
    || candidate.content.sourceSpan.end !== input.content.sourceSpan.end
    || candidate.provenance.sourceId !== sessionContext.sourceMessage.id
    || candidate.provenance.type !== "chat"
    || candidate.provenance.sourceSpan?.start !== input.content.sourceSpan.start
    || candidate.provenance.sourceSpan?.end !== input.content.sourceSpan.end
    || candidate.content.text !== canonicalText(input.content.text)
    || preview.candidateId !== candidate.id
    || preview.candidateInputSha256 !== candidate.inputSha256
    || preview.sensitivity !== candidate.sensitivity
    || preview.expiresAt !== candidate.expiresAt
    || preview.confirmation.required !== true
    || preview.allowedPurpose !== "guardian_controlled_memory") {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  }
  const result = CAPTURE_CLINICAL_MEMORY_CANDIDATE_TRUSTED_RESULT_SCHEMA.safeParse({
    kind: "trusted_tool_result",
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      status: "pending_confirmation",
      outcome: value.outcome,
      candidate: {
        candidateId: candidate.id,
        memoryType: candidate.memoryType,
        text: candidate.content.text,
        sourceSpan: candidate.content.sourceSpan,
        provenance: "chat",
        inputSha256: candidate.inputSha256,
        lifecycle: "pending",
      },
      sensitivity: candidate.sensitivity,
      expiresAt: candidate.expiresAt,
      confirmation: {
        required: true,
        mode: preview.confirmation.mode,
        allowedPurpose: preview.allowedPurpose,
        candidateInputSha256: preview.candidateInputSha256,
        policy: preview.policy,
        policyDecisionSha256: preview.policyDecisionSha256,
      },
    },
  });
  if (!result.success) return safeFailure("CLINICAL_POLICY_UNAVAILABLE", "unknown");
  return result.data;
}

export function projectCaptureClinicalMemoryCandidateForModel(
  raw: unknown,
): CaptureClinicalMemoryCandidateModelResult {
  const parsed = CAPTURE_CLINICAL_MEMORY_CANDIDATE_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      status: parsed.data.data.status,
      outcome: parsed.data.data.outcome,
      sensitivity: parsed.data.data.sensitivity,
      expiresAt: parsed.data.data.expiresAt,
      confirmationRequired: true,
    },
  });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, rawInput) => {
    const context = runtime.trustedContext as TrustedToolContext<CaptureClinicalMemoryCandidateServices>;
    const services = servicesFor(context);
    const signal = getTrustedToolAbortSignal(context);
    abortIfNeeded(signal);
    const parsedInput = CAPTURE_CLINICAL_MEMORY_CANDIDATE_INPUT_SCHEMA.safeParse(rawInput);
    if (!parsedInput.success) return safeFailure("INPUT_INVALID", "none");
    if (!runtime.idempotencyKey || !runtime.approvalSha256) return safeFailure("CONFIRMATION_INVALID", "none");
    const scope = reauthorize(context, "none");
    const session = getTrustedToolSession(context);
    const port = services.memoryCandidates;
    if (!port || typeof port.resolveCurrentSession !== "function" || typeof port.capture !== "function") {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    }
    let rawSession: unknown;
    try {
      rawSession = await port.resolveCurrentSession(Object.freeze({
        scope,
        productSessionId: session.productSessionId,
        signal,
      }));
    } catch (error) {
      if (signal.aborted || codeOf(error) === "CANCELLED") return safeFailure("CANCELLED", "none");
      return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    }
    abortIfNeeded(signal);
    if (!rawSession || typeof rawSession !== "object" || !sessionIsBound(rawSession as MemoryCandidateSessionContext, scope, session.productSessionId)) {
      return safeFailure("RESOURCE_UNAVAILABLE", "none");
    }
    const currentSession = rawSession as MemoryCandidateSessionContext;
    const effectScope = reauthorize(context, "none");
    let rawResult: unknown;
    try {
      rawResult = await port.capture(effectScope, currentSession, Object.freeze({
        memoryType: parsedInput.data.memoryType,
        content: Object.freeze({
          text: parsedInput.data.content.text,
          sourceSpan: Object.freeze({ ...parsedInput.data.content.sourceSpan }),
        }),
        // The wrapper owns the replay identity; the model's opaque value is never used.
        idempotencyKey: runtime.idempotencyKey,
      }));
    } catch (error) {
      if (signal.aborted || codeOf(error) === "CANCELLED") return safeFailure("CANCELLED", "unknown");
      const code = codeOf(error);
      if (code) return mapDomainFailure(code, "unknown");
      return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    }
    if (signal.aborted) return safeFailure("CANCELLED", "unknown");
    // The write may already have committed. Reauthorize with an unknown effect
    // state before exposing any created/replay receipt.
    const postEffectScope = reauthorize(context, "unknown");
    const result = trustedResult(rawResult, parsedInput.data, postEffectScope, currentSession);
    if (signal.aborted) return safeFailure("CANCELLED", "unknown");
    return Object.freeze({
      status: "committed" as const,
      outcome: result.data.outcome === "created" ? "created" as const : "replayed" as const,
      result,
    });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (
    context: TrustedToolContext,
    rawInput: unknown,
    approval: ToolApprovalSubmission | null,
  ) => {
    reauthorize(context, "none");
    return invokeIdempotently(context, rawInput, approval);
  },
);

export async function executeCaptureClinicalMemoryCandidate(
  context: TrustedToolContext,
  rawInput: unknown,
  approval: ToolApprovalSubmission | null = null,
): Promise<CaptureClinicalMemoryCandidateExecution> {
  try {
    preflightInput(rawInput);
    const raw = await invokeWithAudit(context, rawInput, approval);
    if ("allowed" in raw) {
      return raw.status === "approval_required"
        ? safeFailure("CONFIRMATION_REQUIRED", "none")
        : safeFailure("CONFIRMATION_INVALID", "none");
    }
    const parsed = CAPTURE_CLINICAL_MEMORY_CANDIDATE_OUTPUT_SCHEMA.safeParse(raw);
    if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    return parsed.data;
  } catch (error) {
    throw mapToolError(error, { effectState: "unknown" });
  }
}

export default defineTool({
  description: "Prepara un candidato acotado de memoria clínica a partir del mensaje actual del cuidador; queda pendiente de confirmación y no crea un hecho confirmado.",
  inputSchema: CAPTURE_CLINICAL_MEMORY_CANDIDATE_INPUT_SCHEMA,
  outputSchema: CAPTURE_CLINICAL_MEMORY_CANDIDATE_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      preflightInput(input);
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeCaptureClinicalMemoryCandidate(trusted, input, null);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectCaptureClinicalMemoryCandidateForModel(output.result));
  },
});
