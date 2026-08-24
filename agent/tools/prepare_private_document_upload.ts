import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import type { AuthorizedChildScope } from "../lib/access/authorized-child-scope";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { authorizeToolInvocation } from "../lib/runtime/tool-permission-policy";
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
  type PrivateUploadTicketResult,
} from "../../src/application/documents/upload-ticket-service";
import { uploadTicketSchema } from "../../src/clinical/documents/types";

const TOOL_ID = "prepare_private_document_upload" as const;
const TOOL_SCHEMA_VERSION = "prepare-private-document-upload.v1" as const;
const TRUSTED_SCHEMA_VERSION = `${TOOL_ID}.trusted.v1` as const;
const MODEL_SCHEMA_VERSION = `${TOOL_ID}.model.v1` as const;

const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const UUID = z.string().uuid();
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const PURPOSE = z.enum(["avatar", "vaccine_record", "clinical_attachment", "generated_report", "clinical_source"]);
const RETENTION = z.enum(["ephemeral_upload", "child_record", "generated_artifact", "clinical_source"]);
const MIME = z.string().min(1).max(128).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu);
const INSTANT = z.string().datetime({ offset: true });
const CONTROL_OR_INVISIBLE = /[\u0000-\u001f\u007f\p{Cf}\p{Cs}]/u;
const MARKUP_OR_ROLE = /(?:[<>`]|\b(?:https?|s3|gs|file|javascript|data)\s*:\s*|\b(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\s*[:=]|(?:ignore|forget|disregard|override|bypass|ignora|olvida|omite|anula).{0,80}(?:previous|prior|system|developer|assistant|instruction|prompt|anterior(?:es)?|previ[oa]s?|sistema|desarrollador|asistente|instrucci[oó]n(?:es)?|pol[ií]tica))/iu;

function safeFileName(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL_OR_INVISIBLE.test(value)
    && !MARKUP_OR_ROLE.test(value);
}

/** The model can declare metadata, but never the storage scope or capability. */
export const PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA = z.object({
  purpose: PURPOSE,
  fileName: z.string().min(1).max(512).refine(safeFileName, "safe_file_name"),
  declaredMimeType: MIME,
  sizeBytes: z.number().int().positive().max(52_428_800),
  checksum: z.object({ algorithm: z.literal("sha256"), value: HASH }).strict(),
  consent: z.object({ granted: z.literal(true), purpose: z.literal("document_upload") }).strict(),
  retentionClass: RETENTION,
  idempotencyKey: OPAQUE_ID,
}).strict();

export type PreparePrivateDocumentUploadInput = z.infer<typeof PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA>;

const REQUIRED_HEADERS_SCHEMA = z.object({
  "content-type": MIME,
  "x-upsert": z.literal("false"),
  "x-content-sha256": HASH,
}).strict();

const MOBILE_TICKET_SCHEMA = z.object({
  kind: z.literal("upload"),
  id: UUID,
  documentId: UUID,
  audience: z.literal("guardian"),
  uploadUrl: z.string().url().refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" && parsed.hash === "";
    } catch {
      return false;
    }
  }, "private_https_upload_url"),
  requiredHeaders: REQUIRED_HEADERS_SCHEMA,
  sizeBytes: z.number().int().positive().max(52_428_800),
  mimeType: MIME,
  sha256: HASH,
  issuedAt: INSTANT,
  expiresAt: INSTANT,
  nonceSha256: HASH,
}).strict().superRefine((value, context) => {
  const ttl = Date.parse(value.expiresAt) - Date.parse(value.issuedAt);
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 300_000) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "ticket_ttl" });
  }
  if (value.requiredHeaders["content-type"] !== value.mimeType) {
    context.addIssue({ code: "custom", path: ["requiredHeaders", "content-type"], message: "mime_header_mismatch" });
  }
  if (value.requiredHeaders["x-content-sha256"] !== value.sha256) {
    context.addIssue({ code: "custom", path: ["requiredHeaders", "x-content-sha256"], message: "checksum_header_mismatch" });
  }
});

export const PREPARE_PRIVATE_DOCUMENT_UPLOAD_MOBILE_EVENT_SCHEMA = z.object({
  kind: z.literal("private_document_upload"),
  version: z.literal("private.document-upload.v1"),
  data: z.object({
    status: z.literal("upload_prepared"),
    purpose: PURPOSE,
    mobileActionRequired: z.literal(true),
    ticket: MOBILE_TICKET_SCHEMA,
  }).strict(),
}).strict();

export type PreparePrivateDocumentUploadMobileEvent = Readonly<
  z.infer<typeof PREPARE_PRIVATE_DOCUMENT_UPLOAD_MOBILE_EVENT_SCHEMA>
>;

const DOMAIN_RESULT_SCHEMA = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    status: z.literal("issued"),
    ticket: uploadTicketSchema,
  }).strict(),
  z.object({
    ok: z.literal(false),
    status: z.literal("unavailable"),
    code: z.enum(["NOT_AUTHORIZED", "INVALID_INPUT", "POLICY_UNAVAILABLE", "IDEMPOTENCY_CONFLICT", "PROVIDER_UNAVAILABLE"]),
  }).strict(),
]);

const TRUSTED_DATA_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay"]),
  status: z.literal("upload_prepared"),
  purpose: PURPOSE,
  mobileActionRequired: z.literal(true),
  mobileEvent: PREPARE_PRIVATE_DOCUMENT_UPLOAD_MOBILE_EVENT_SCHEMA,
}).strict();

export const PREPARE_PRIVATE_DOCUMENT_UPLOAD_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(TRUSTED_SCHEMA_VERSION),
  data: TRUSTED_DATA_SCHEMA,
}).strict();

export type PreparePrivateDocumentUploadTrustedResult = Readonly<
  z.infer<typeof PREPARE_PRIVATE_DOCUMENT_UPLOAD_TRUSTED_RESULT_SCHEMA>
>;

export const PREPARE_PRIVATE_DOCUMENT_UPLOAD_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.enum(["created", "replayed"]),
  result: PREPARE_PRIVATE_DOCUMENT_UPLOAD_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: z.string().regex(/^prepare_private_document_upload:[a-f0-9]{64}$/u),
  requestSha256: HASH,
  approvalSha256: HASH,
}).strict();

export type PreparePrivateDocumentUploadExecution = Readonly<
  z.infer<typeof PREPARE_PRIVATE_DOCUMENT_UPLOAD_OUTPUT_SCHEMA>
>;

type PreparePrivateDocumentUploadModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

/** Request-scoped service seam. Production composition installs the verified document service. */
export type PreparePrivateDocumentUploadPort = Readonly<{
  issue(scope: AuthorizedChildScope, rawInput: unknown): Promise<PrivateUploadTicketResult>;
  cancel(
    scope: AuthorizedChildScope,
    documentId: string,
  ): Promise<Readonly<{ ok: boolean; status: "cancelled" | "unavailable" }>>;
}>;

type PreparePrivateDocumentUploadServices = ToolServicePorts & Readonly<{
  privateDocumentUpload: PreparePrivateDocumentUploadPort;
}>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "draft" as const,
  operation: "prepare_private_document_upload.v1",
  inputSchema: PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA,
  resultSchema: PREPARE_PRIVATE_DOCUMENT_UPLOAD_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "draft" as const,
  operation: "prepare_private_document_upload.v1",
});

function safeFailure(code: string, effectState: ToolEffectState = "unknown"): never {
  throw mapToolError(Object.freeze({ code }), { effectState });
}

function nowFrom(context: TrustedToolContext): Date {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const clock = services.toolIdempotency as Readonly<{ now?: unknown }> | undefined;
    if (!clock || typeof clock.now !== "function") return safeFailure("PERSISTENCE_UNAVAILABLE");
    const now = clock.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE");
    return new Date(now);
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
}

function reauthorize(context: TrustedToolContext, effectState: ToolEffectState): AuthorizedChildScope {
  const signal = getTrustedToolAbortSignal(context);
  if (signal.aborted) return safeFailure("CANCELLED", effectState);
  const now = nowFrom(context);
  try {
    const scope = requireActiveChildScope(context, now);
    if (!authorizeToolInvocation(context, TOOL_ID, now).allowed) return safeFailure("FORBIDDEN", effectState);
    return scope;
  } catch {
    return safeFailure("FORBIDDEN", effectState);
  }
}

function serviceFor(context: TrustedToolContext): PreparePrivateDocumentUploadPort {
  try {
    const services = getTrustedToolServices(context) as PreparePrivateDocumentUploadServices;
    const service = services.privateDocumentUpload;
    if (!service || typeof service !== "object"
      || typeof service.issue !== "function"
      || typeof service.cancel !== "function") {
      return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
    }
    return service;
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "none");
  }
}

async function cancelIssuedTicket(
  service: PreparePrivateDocumentUploadPort,
  scope: AuthorizedChildScope,
  rawResult: unknown,
): Promise<void> {
  const parsed = DOMAIN_RESULT_SCHEMA.safeParse(rawResult);
  if (!parsed.success || !parsed.data.ok) return;
  try {
    await service.cancel(scope, parsed.data.ticket.documentId);
  } catch {
    // The original outcome remains unknown; cancellation is best effort because
    // an already-issued provider URL cannot be revoked before its bounded TTL.
  }
}

function domainFailure(code: string, effectState: ToolEffectState): never {
  if (code === "NOT_AUTHORIZED") return safeFailure("FORBIDDEN", effectState);
  if (code === "INVALID_INPUT") return safeFailure("INPUT_INVALID", effectState);
  if (code === "POLICY_UNAVAILABLE") return safeFailure("POLICY_UNAVAILABLE", effectState);
  // M09 deliberately reports reservation replays as a conflict because its
  // verified service has no safe fresh-URL reissue operation. Never reuse or
  // mint an ephemeral upload URL in this tool.
  if (code === "IDEMPOTENCY_CONFLICT") return safeFailure("IDEMPOTENCY_CONFLICT", effectState);
  if (code === "PROVIDER_UNAVAILABLE") return safeFailure("PROVIDER_UNAVAILABLE", effectState);
  return safeFailure("PERSISTENCE_UNAVAILABLE", effectState);
}

function validTicketForInput(
  rawTicket: unknown,
  input: PreparePrivateDocumentUploadInput,
  now: Date,
): z.infer<typeof MOBILE_TICKET_SCHEMA> {
  const domainTicket = uploadTicketSchema.safeParse(rawTicket);
  const ticket = MOBILE_TICKET_SCHEMA.safeParse(domainTicket.success ? domainTicket.data : rawTicket);
  if (!ticket.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  const issuedAt = Date.parse(ticket.data.issuedAt);
  const expiresAt = Date.parse(ticket.data.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
    || issuedAt > now.getTime()
    || expiresAt <= now.getTime()) {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  }
  if (ticket.data.sizeBytes !== input.sizeBytes
    || ticket.data.mimeType !== input.declaredMimeType.toLowerCase()
    || ticket.data.sha256 !== input.checksum.value) {
    return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  }
  return ticket.data;
}

function trustedResult(
  input: PreparePrivateDocumentUploadInput,
  rawTicket: unknown,
  outcome: "created" | "idempotent_replay",
  now: Date,
): PreparePrivateDocumentUploadTrustedResult {
  const ticket = validTicketForInput(rawTicket, input, now);
  const event = PREPARE_PRIVATE_DOCUMENT_UPLOAD_MOBILE_EVENT_SCHEMA.safeParse({
    kind: "private_document_upload",
    version: "private.document-upload.v1",
    data: {
      status: "upload_prepared",
      purpose: input.purpose,
      mobileActionRequired: true,
      ticket,
    },
  });
  if (!event.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  const result = PREPARE_PRIVATE_DOCUMENT_UPLOAD_TRUSTED_RESULT_SCHEMA.safeParse({
    kind: "trusted_tool_result",
    toolId: TOOL_ID,
    schemaVersion: TRUSTED_SCHEMA_VERSION,
    data: {
      outcome,
      status: "upload_prepared",
      purpose: input.purpose,
      mobileActionRequired: true,
      mobileEvent: event.data,
    },
  });
  if (!result.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
  return Object.freeze(result.data);
}

export function projectPreparePrivateDocumentUploadForModel(
  raw: unknown,
): PreparePrivateDocumentUploadModelResult {
  const parsed = PREPARE_PRIVATE_DOCUMENT_UPLOAD_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: MODEL_SCHEMA_VERSION,
    data: {
      status: "upload_prepared",
      purpose: parsed.data.data.purpose,
      mobileActionRequired: true,
    },
  });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, rawInput) => {
    const context = runtime.trustedContext as TrustedToolContext<PreparePrivateDocumentUploadServices>;
    const signal = getTrustedToolAbortSignal(context);
    if (signal.aborted) return safeFailure("CANCELLED", "none");
    if (!runtime.idempotencyKey || !runtime.approvalSha256) return safeFailure("TOOL_IDEMPOTENCY_DENIED", "none");
    const input = PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA.safeParse(rawInput);
    if (!input.success) return safeFailure("INPUT_INVALID", "none");
    const service = serviceFor(context);
    const scope = reauthorize(context, "none");
    const { idempotencyKey: _declaredIdempotencyKey, ...declaredMetadata } = input.data;
    const serviceInput = Object.freeze({
      ...declaredMetadata,
      idempotencyKey: runtime.idempotencyKey,
    });
    let rawResult: unknown;
    try {
      rawResult = await service.issue(scope, serviceInput);
    } catch (error) {
      if (signal.aborted) return safeFailure("CANCELLED", "unknown");
      throw mapToolError(error, { effectState: "unknown" });
    }
    if (signal.aborted) {
      await cancelIssuedTicket(service, scope, rawResult);
      return safeFailure("CANCELLED", "unknown");
    }
    // The domain service owns reservation idempotency. Reauthorize after its
    // effect and before exposing an ephemeral capability to the mobile event.
    try {
      reauthorize(context, "unknown");
    } catch (error) {
      await cancelIssuedTicket(service, scope, rawResult);
      throw error;
    }
    const current = nowFrom(context);
    const parsed = DOMAIN_RESULT_SCHEMA.safeParse(rawResult);
    if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    if (!parsed.data.ok) return domainFailure(parsed.data.code, "unknown");
    let result: PreparePrivateDocumentUploadTrustedResult;
    try {
      result = trustedResult(input.data, parsed.data.ticket, "created", current);
    } catch (error) {
      await cancelIssuedTicket(service, scope, parsed.data);
      throw error;
    }
    return Object.freeze({ status: "committed" as const, outcome: "created" as const, result });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (
    context: TrustedToolContext,
    input: PreparePrivateDocumentUploadInput,
    approval: ToolApprovalSubmission | null,
  ) => {
    // withToolIdempotency performs approval validation, but the active trusted
    // scope and permission must be checked at the outer boundary first.
    reauthorize(context, "none");
    return invokeIdempotently(context, input, approval);
  },
);

export async function executePreparePrivateDocumentUpload(
  context: TrustedToolContext,
  input: PreparePrivateDocumentUploadInput,
  approval: ToolApprovalSubmission | null = null,
): Promise<PreparePrivateDocumentUploadExecution> {
  try {
    const raw = await invokeWithAudit(context, input, approval);
    if ("allowed" in raw) {
      return raw.status === "approval_required"
        ? safeFailure("CONFIRMATION_REQUIRED", "none")
        : safeFailure("CONFIRMATION_INVALID", "none");
    }
    const outcome = raw.outcome === "replayed" ? "replayed" : raw.outcome === "created" ? "created" : null;
    if (outcome === null) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    const parsed = PREPARE_PRIVATE_DOCUMENT_UPLOAD_OUTPUT_SCHEMA.safeParse({
      status: "succeeded",
      outcome,
      result: raw.result,
      idempotencyKey: raw.idempotencyKey,
      requestSha256: raw.requestSha256,
      approvalSha256: raw.approvalSha256,
    });
    if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE", "unknown");
    return Object.freeze(parsed.data);
  } catch (error) {
    throw mapToolError(error, { effectState: "unknown" });
  }
}

export default defineTool({
  description: "Prepara una carga privada y única de un documento declarado por el tutor. Valida metadatos y consentimiento, no expone rutas ni tickets al modelo, no extrae hechos clínicos y no ejecuta acciones profesionales.",
  inputSchema: PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA,
  outputSchema: PREPARE_PRIVATE_DOCUMENT_UPLOAD_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executePreparePrivateDocumentUpload(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectPreparePrivateDocumentUploadForModel(output.result));
  },
});
