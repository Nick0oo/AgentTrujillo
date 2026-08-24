import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
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
  requireActiveChildScope,
  type ToolServicePorts,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import {
  attachmentReferenceSchema,
  developmentConcernSchema,
  developmentDomainSchema,
  developmentObservationDraftSchema,
  type AttachmentReference,
  type DevelopmentObservationDraft,
} from "../../src/clinical/development/types";
import type {
  DevelopmentObservationService,
  DevelopmentObservationPreview,
} from "../../src/application/development/observation-service";

const TOOL_ID = "record_development_observation" as const;
const TOOL_SCHEMA_VERSION = "record-development-observation.v1" as const;
const TRUSTED_SCHEMA_VERSION = "record_development_observation.trusted.v1" as const;
const MODEL_SCHEMA_VERSION = "record_development_observation.model.v1" as const;

const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const ATTACHMENT_HANDLE_SCHEMA = z.string().regex(/^attachment:v1:[a-f0-9]{64}$/u);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "ISO calendar date");
const MODEL_CODE = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u)
  .refine((value) => !/^[A-Za-z0-9+/]{48,}={0,2}$/u.test(value), "bounded code");
const PROFESSIONAL_MILESTONE_MARKER = /(?:ead[\s_-]*3|professional|instrument|screen(?:ing)?|tamiz|cribado|scor(?:e|ing)|puntaje|cut[-_ ]?off|classification|clasificaci[oó]n|developmental[\s_-]*age|edad[\s_-]*del[\s_-]*desarrollo)/iu;
const CAREGIVER_MILESTONE_CODE = MODEL_CODE.refine((value) => !PROFESSIONAL_MILESTONE_MARKER.test(value), "caregiver milestone code");
const IDEMPOTENCY_KEY = z.string().regex(/^[a-z][a-z0-9_]*:[a-f0-9]{64}$/u);
const CONTROL_OR_INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const MARKUP_OR_ROLE = /(?:[<>`]|\b(?:https?|s3|gs|file|javascript|data)\s*:\s*|\b(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\s*[:=]|\[(?:\/?)(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\]|\b(?:ignore|forget|disregard|override|bypass|ignora|olvida|omite|anula|reemplaza)\b.{0,80}\b(?:previous|prior|system|developer|assistant|instruction|prompt|policy|anterior(?:es)?|previ[oa]s?|sistema|desarrollador|asistente|instrucci[oó]n(?:es)?|pol[ií]tica)\b)/iu;

function safeDataText(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL_OR_INVISIBLE.test(value)
    && !MARKUP_OR_ROLE.test(value);
}

const OBSERVATION_TEXT = z.string().min(1).max(1_000).refine(safeDataText, "safe observation text");
const CONCERN = developmentConcernSchema.extend({
  text: z.string().min(1).max(500).refine(safeDataText, "safe concern text"),
});
const ATTACHMENT_HANDLES = z.array(ATTACHMENT_HANDLE_SCHEMA).max(10).readonly().superRefine((handles, context) => {
  if (new Set(handles).size !== handles.length) context.addIssue({ code: "custom", message: "duplicate attachment handle" });
});

/** Only factual diary data is model-callable. Authority and confirmation are trusted runtime values. */
export const RECORD_DEVELOPMENT_OBSERVATION_INPUT_SCHEMA = z.object({
  text: OBSERVATION_TEXT,
  date: DATE,
  domain: developmentDomainSchema,
  milestoneId: CAREGIVER_MILESTONE_CODE.nullable().optional(),
  concern: CONCERN.nullable().optional(),
  attachments: ATTACHMENT_HANDLES.optional(),
}).strict();

export type RecordDevelopmentObservationInput = z.infer<typeof RECORD_DEVELOPMENT_OBSERVATION_INPUT_SCHEMA>;
export type RecordDevelopmentObservationAttachmentHandle = z.infer<typeof ATTACHMENT_HANDLE_SCHEMA>;

export function createDevelopmentObservationAttachmentHandle(
  raw: unknown,
): RecordDevelopmentObservationAttachmentHandle | null {
  const reference = attachmentReferenceSchema.safeParse(raw);
  if (!reference.success) return null;
  const digest = createHash("sha256").update(canonicalize({
    version: "development-observation-attachment-handle.v1",
    bucket: reference.data.bucket,
    objectPath: reference.data.objectPath,
    contentSha256: reference.data.digest,
    mime: reference.data.mime,
    size: reference.data.size,
  }), "utf8").digest("hex");
  const handle = `attachment:v1:${digest}`;
  return ATTACHMENT_HANDLE_SCHEMA.safeParse(handle).success
    ? handle as RecordDevelopmentObservationAttachmentHandle
    : null;
}

const PREVIEW_SCHEMA = z.object({
  draftId: HASH,
  draft: developmentObservationDraftSchema,
  confirmationDigest: HASH,
  warnings: z.array(z.enum(["attachment_pending", "quoted_clinical_language_neutral"])).max(2).readonly(),
}).strict();

const DRAFT_RESULT_SCHEMA = z.union([
  z.object({
    ok: z.literal(true),
    status: z.literal("draft"),
    preview: PREVIEW_SCHEMA,
    warnings: z.array(z.enum(["attachment_pending", "quoted_clinical_language_neutral"])).max(2).readonly(),
  }).strict(),
  z.object({
    ok: z.literal(false),
    status: z.literal("unavailable"),
    code: z.enum(["NOT_AUTHORIZED", "INVALID_OBSERVATION", "CONFIRMATION_DRIFT", "IDEMPOTENCY_CONFLICT", "STORAGE_UNAVAILABLE"]),
  }).strict(),
]);

const RECORD_RESULT_SCHEMA = z.union([
  z.object({
    ok: z.literal(true),
    status: z.literal("recorded"),
    observationId: z.string().uuid(),
    outcome: z.enum(["created", "idempotent_replay"]),
  }).strict(),
  z.object({
    ok: z.literal(false),
    status: z.literal("unavailable"),
    code: z.enum(["NOT_AUTHORIZED", "INVALID_OBSERVATION", "CONFIRMATION_DRIFT", "IDEMPOTENCY_CONFLICT", "STORAGE_UNAVAILABLE"]),
  }).strict(),
]);

const ATTACHMENT_SUMMARY_SCHEMA = z.object({
  mime: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  size: z.number().int().min(0).max(20_971_520),
  state: z.enum(["pending", "clean", "rejected", "extracted", "failed"]),
}).strict();

const TRUSTED_DATA_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay"]),
  domain: developmentDomainSchema,
  observedOn: DATE,
  text: OBSERVATION_TEXT,
  milestoneCode: MODEL_CODE.nullable(),
  concern: z.string().max(500).refine((value) => safeDataText(value), "safe concern text").nullable(),
  concernDeclared: z.boolean(),
  attachments: z.array(ATTACHMENT_SUMMARY_SCHEMA).max(10).readonly(),
  warnings: z.array(z.enum(["attachment_pending", "quoted_clinical_language_neutral"])).max(2).readonly(),
}).strict();

export const RECORD_DEVELOPMENT_OBSERVATION_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: TRUSTED_DATA_SCHEMA,
}).strict();

export type RecordDevelopmentObservationTrustedResult = Readonly<
  z.infer<typeof RECORD_DEVELOPMENT_OBSERVATION_TRUSTED_RESULT_SCHEMA>
>;

export const RECORD_DEVELOPMENT_OBSERVATION_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.enum(["created", "replayed"]),
  result: RECORD_DEVELOPMENT_OBSERVATION_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: IDEMPOTENCY_KEY,
  requestSha256: HASH,
  approvalSha256: HASH,
}).strict();

export type RecordDevelopmentObservationExecution = z.infer<typeof RECORD_DEVELOPMENT_OBSERVATION_OUTPUT_SCHEMA>;
type RecordDevelopmentObservationModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

type ObservationServices = ToolServicePorts & Readonly<{
  developmentObservations: Pick<DevelopmentObservationService, "createDraft" | "confirm">;
  developmentObservationAttachments?: DevelopmentObservationAttachmentResolver;
}>;

/** Request-scoped resolver: it must reauthorize the scope and return only same-child references. */
export type DevelopmentObservationAttachmentResolver = Readonly<{
  resolve(request: Readonly<{
    scope: AuthorizedChildScope;
    handles: readonly RecordDevelopmentObservationAttachmentHandle[];
    signal: AbortSignal;
  }>): Promise<readonly AttachmentReference[]>;
}>;

const RESOLVED_ATTACHMENTS_SCHEMA = z.array(attachmentReferenceSchema).max(10).readonly();

type ParsedPreview = z.infer<typeof PREVIEW_SCHEMA>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "record_development_observation.v1",
  inputSchema: RECORD_DEVELOPMENT_OBSERVATION_INPUT_SCHEMA,
  resultSchema: RECORD_DEVELOPMENT_OBSERVATION_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "mutating" as const,
  operation: "record_development_observation.v1",
});

function safeFailure(code: string, effectState: ToolEffectState = "unknown"): never {
  throw mapToolError(Object.freeze({ code }), { effectState });
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) safeFailure("CANCELLED", "none");
}

function reauthorize(context: TrustedToolContext, effectState: ToolEffectState): AuthorizedChildScope {
  const signal = getTrustedToolAbortSignal(context);
  abortIfNeeded(signal);
  let now: Date;
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, object>>;
    const clock = services.toolIdempotency as Readonly<{ now?: () => Date }> | undefined;
    now = typeof clock?.now === "function" ? clock.now() : new Date(Number.NaN);
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
  try {
    const scope = requireActiveChildScope(context, now);
    if (!authorizeToolInvocation(context, TOOL_ID, now).allowed) return safeFailure("FORBIDDEN", effectState);
    return scope;
  } catch {
    return safeFailure("FORBIDDEN", effectState);
  }
}

function resolverErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const code = (error as Readonly<{ code?: unknown }>).code;
  return typeof code === "string" ? code : null;
}

async function resolveAttachmentHandles(
  services: ObservationServices,
  scope: AuthorizedChildScope,
  handles: readonly RecordDevelopmentObservationAttachmentHandle[],
  signal: AbortSignal,
): Promise<readonly AttachmentReference[]> {
  if (handles.length === 0) return Object.freeze([]);
  const resolver = services.developmentObservationAttachments;
  if (!resolver || typeof resolver.resolve !== "function") return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  let raw: unknown;
  try {
    raw = await resolver.resolve(Object.freeze({ scope, handles, signal }));
  } catch (error) {
    if (signal.aborted || resolverErrorCode(error) === "CANCELLED") return safeFailure("CANCELLED", "none");
    const code = resolverErrorCode(error);
    if (code === "NOT_AUTHORIZED" || code === "ACCESS_DENIED") return safeFailure("ACCESS_DENIED", "none");
    if (code === "INVALID_ATTACHMENT" || code === "INVALID_OBSERVATION") return safeFailure("INVALID_OBSERVATION", "none");
    return safeFailure("STORAGE_UNAVAILABLE", "none");
  }
  abortIfNeeded(signal);
  const parsed = RESOLVED_ATTACHMENTS_SCHEMA.safeParse(raw);
  if (!parsed.success || parsed.data.length !== handles.length) return safeFailure("INVALID_OBSERVATION", "none");
  const byHandle = new Map<RecordDevelopmentObservationAttachmentHandle, AttachmentReference>();
  for (const reference of parsed.data) {
    const handle = createDevelopmentObservationAttachmentHandle(reference);
    if (handle === null || byHandle.has(handle)) return safeFailure("INVALID_OBSERVATION", "none");
    byHandle.set(handle, reference as AttachmentReference);
  }
  if (byHandle.size !== handles.length || handles.some((handle) => !byHandle.has(handle))) {
    return safeFailure("INVALID_OBSERVATION", "none");
  }
  return Object.freeze(handles.map((handle) => byHandle.get(handle)!));
}

function normalizeText(value: string, maximum: number): string | null {
  if (CONTROL_OR_INVISIBLE.test(value)) return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return normalized.length > 0 && Array.from(normalized).length <= maximum ? normalized : null;
}

function draftFromInput(
  input: RecordDevelopmentObservationInput,
  attachments: readonly AttachmentReference[],
): DevelopmentObservationDraft {
  return Object.freeze({
    text: input.text,
    date: input.date,
    domain: input.domain,
    source: "caregiver" as const,
    milestoneId: input.milestoneId ?? null,
    concern: input.concern ?? null,
    attachments: Object.freeze([...attachments]),
  }) as unknown as DevelopmentObservationDraft;
}

function canonicalDraftForInput(
  input: RecordDevelopmentObservationInput,
  resolvedAttachments: readonly AttachmentReference[],
): DevelopmentObservationDraft | null {
  const text = normalizeText(input.text, 1_000);
  const concernText = input.concern === null || input.concern === undefined
    ? null
    : normalizeText(input.concern.text, 500);
  if (text === null || (input.concern !== null && input.concern !== undefined && concernText === null)) return null;
  const attachments = [...resolvedAttachments].sort(
    (left, right) => left.objectPath.localeCompare(right.objectPath) || left.digest.localeCompare(right.digest),
  );
  return Object.freeze({
    text,
    date: input.date,
    domain: input.domain,
    source: "caregiver" as const,
    milestoneId: input.milestoneId ?? null,
    concern: concernText === null ? null : Object.freeze({ kind: "question_for_conversation" as const, text: concernText }),
    attachments: Object.freeze(attachments),
  }) as unknown as DevelopmentObservationDraft;
}

function previewMatchesInput(
  preview: ParsedPreview,
  input: RecordDevelopmentObservationInput,
  resolvedAttachments: readonly AttachmentReference[],
): boolean {
  const expected = canonicalDraftForInput(input, resolvedAttachments);
  if (expected === null || preview.draft.source !== "caregiver") return false;
  try {
    return canonicalize(preview.draft) === canonicalize(expected)
      && preview.draftId.length === 64
      && preview.confirmationDigest.length === 64;
  } catch {
    return false;
  }
}

function mapDomainFailure(code: string, effectState: ToolEffectState): never {
  if (code === "NOT_AUTHORIZED") return safeFailure("ACCESS_DENIED", effectState);
  if (code === "INVALID_OBSERVATION") return safeFailure("INVALID_OBSERVATION", effectState);
  if (code === "CONFIRMATION_DRIFT") return safeFailure("CONFIRMATION_DRIFT", "none");
  if (code === "IDEMPOTENCY_CONFLICT") return safeFailure("IDEMPOTENCY_CONFLICT", "none");
  return safeFailure("STORAGE_UNAVAILABLE", effectState);
}

function trustedResult(
  preview: ParsedPreview,
  outcome: "created" | "idempotent_replay",
): RecordDevelopmentObservationTrustedResult {
  const parsed = PREVIEW_SCHEMA.safeParse(preview);
  if (!parsed.success || parsed.data.draft.source !== "caregiver") return safeFailure("POLICY_UNAVAILABLE");
  const draft = parsed.data.draft;
  const concern = draft.concern?.text ?? null;
  const milestoneCode = draft.milestoneId ?? null;
  if (milestoneCode !== null && !MODEL_CODE.safeParse(milestoneCode).success) return safeFailure("POLICY_UNAVAILABLE");
  const candidate = {
    kind: "trusted_tool_result" as const,
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      outcome,
      domain: draft.domain,
      observedOn: draft.date,
      text: draft.text,
      milestoneCode,
      concern,
      concernDeclared: concern !== null,
      attachments: (draft.attachments ?? []).map((attachment) => ({
        mime: attachment.mime,
        size: attachment.size,
        state: attachment.state,
      })),
      warnings: parsed.data.warnings,
    },
  };
  const result = RECORD_DEVELOPMENT_OBSERVATION_TRUSTED_RESULT_SCHEMA.safeParse(candidate);
  if (!result.success) return safeFailure("POLICY_UNAVAILABLE");
  return result.data;
}

export function projectRecordDevelopmentObservationForModel(raw: unknown): RecordDevelopmentObservationModelResult {
  const parsed = RECORD_DEVELOPMENT_OBSERVATION_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      outcome: parsed.data.data.outcome,
      domain: parsed.data.data.domain,
      observedOn: parsed.data.data.observedOn,
      milestoneCode: parsed.data.data.milestoneCode,
      concernDeclared: parsed.data.data.concernDeclared,
    },
  });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, rawInput) => {
    const services = getTrustedToolServices(
      runtime.trustedContext as TrustedToolContext<ObservationServices>,
    );
    const signal = getTrustedToolAbortSignal(runtime.trustedContext);
    abortIfNeeded(signal);
    const input = RECORD_DEVELOPMENT_OBSERVATION_INPUT_SCHEMA.safeParse(rawInput);
    if (!input.success) return safeFailure("INPUT_INVALID", "none");
    if (!runtime.idempotencyKey) return safeFailure("TOOL_IDEMPOTENCY_DENIED", "none");
    const service = services.developmentObservations;
    if (!service || typeof service.createDraft !== "function" || typeof service.confirm !== "function") {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    }
    const handles = input.data.attachments ?? Object.freeze([]);
    const attachmentScope = reauthorize(runtime.trustedContext, "none");
    const resolvedAttachments = await resolveAttachmentHandles(services, attachmentScope, handles, signal);
    const draftScope = reauthorize(runtime.trustedContext, "none");
    const draft = draftFromInput(input.data, resolvedAttachments);
    let rawDraft: unknown;
    try {
      rawDraft = await service.createDraft(draftScope, draft);
    } catch {
      if (signal.aborted) return safeFailure("CANCELLED", "unknown");
      return safeFailure("STORAGE_UNAVAILABLE", "unknown");
    }
    abortIfNeeded(signal);
    const parsedDraft = DRAFT_RESULT_SCHEMA.safeParse(rawDraft);
    if (!parsedDraft.success) return safeFailure("POLICY_UNAVAILABLE", "none");
    if (!parsedDraft.data.ok) return mapDomainFailure(parsedDraft.data.code, "none");
    if (canonicalize(parsedDraft.data.warnings) !== canonicalize(parsedDraft.data.preview.warnings)) {
      return safeFailure("POLICY_UNAVAILABLE", "none");
    }
    if (!previewMatchesInput(parsedDraft.data.preview, input.data, resolvedAttachments)) {
      return safeFailure("CONFIRMATION_DRIFT", "none");
    }

    const confirmScope = reauthorize(runtime.trustedContext, "unknown");
    let rawRecord: unknown;
    try {
      const domainPreview = parsedDraft.data.preview as unknown as DevelopmentObservationPreview;
      rawRecord = await service.confirm(confirmScope, {
        preview: domainPreview,
        confirmationDigest: domainPreview.confirmationDigest,
        idempotencyKey: runtime.idempotencyKey,
      });
    } catch {
      if (signal.aborted) return safeFailure("CANCELLED", "unknown");
      return safeFailure("STORAGE_UNAVAILABLE", "unknown");
    }
    const parsedRecord = RECORD_RESULT_SCHEMA.safeParse(rawRecord);
    if (!parsedRecord.success) return safeFailure("POLICY_UNAVAILABLE", "unknown");
    if (!parsedRecord.data.ok) return mapDomainFailure(parsedRecord.data.code, "unknown");
    if (signal.aborted) return safeFailure("CANCELLED", "unknown");
    const result = trustedResult(parsedDraft.data.preview, parsedRecord.data.outcome);
    return Object.freeze({
      status: "committed" as const,
      outcome: parsedRecord.data.outcome === "idempotent_replay" ? "replayed" as const : "created" as const,
      result,
    });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (
    context: TrustedToolContext,
    input: RecordDevelopmentObservationInput,
    approval: ToolApprovalSubmission | null,
  ) => invokeIdempotently(context, input, approval),
);

export async function executeRecordDevelopmentObservation(
  context: TrustedToolContext,
  input: RecordDevelopmentObservationInput,
  approval: ToolApprovalSubmission | null = null,
): Promise<RecordDevelopmentObservationExecution> {
  try {
    const raw = await invokeWithAudit(context, input, approval);
    if ("allowed" in raw) {
      return raw.status === "approval_required"
        ? safeFailure("CONFIRMATION_REQUIRED", "none")
        : safeFailure("CONFIRMATION_INVALID", "none");
    }
    const parsed = RECORD_DEVELOPMENT_OBSERVATION_OUTPUT_SCHEMA.safeParse(raw);
    if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    return parsed.data;
  } catch (error) {
    throw mapToolError(error, { effectState: "unknown" });
  }
}

export default defineTool({
  description: "Registra una observación factual del cuidador sobre el desarrollo; no puntúa, diagnostica, estima edad de desarrollo ni crea operaciones clínicas.",
  inputSchema: RECORD_DEVELOPMENT_OBSERVATION_INPUT_SCHEMA,
  outputSchema: RECORD_DEVELOPMENT_OBSERVATION_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeRecordDevelopmentObservation(trusted, input, null);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectRecordDevelopmentObservationForModel(output.result));
  },
});
