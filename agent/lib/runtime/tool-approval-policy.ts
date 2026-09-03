import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  getTrustedToolActor,
  getTrustedToolEntitlements,
  getTrustedToolLocale,
  getTrustedToolServices,
  getTrustedToolSession,
  requireActiveChildScope,
  type TrustedToolContext,
  type TrustedToolLocale,
} from "./trusted-tool-context";
import {
  REGISTERED_TOOL_IDS,
  authorizeToolInvocation,
  type RegisteredToolId,
} from "./tool-permission-policy";

const POLICY_VERSION = "tool-approval.v1" as const;
const PREVIEW_VERSION = "tool-approval-preview.v1" as const;
const PREVIEW_TTL_MS = 5 * 60 * 1_000;
const MAX_CANONICAL_INPUT_BYTES = 32_768;
const MAX_PREVIEW_ENTRIES = 128;
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u);
const INSTANT = z.string().datetime({ offset: true });
const SCHEMA_VERSION = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const TOKEN = z.string().min(8).max(512).regex(/^[A-Za-z0-9._~:+/=-]+$/u);
const FORBIDDEN_AUTHORITY_KEY = /^(?:actor(?:_?user)?_?id|approval|approved|approval_?token|care_?space_?id|child_?id|confirmation|confirmation_?token|country|country_?of_?care|entitlement|entitlements|guardian_?id|permission|permissions|role|roles|scope|session_?id|token)$/iu;

type JsonValue = null | boolean | number | string | readonly JsonValue[] | Readonly<{ [key: string]: JsonValue }>;

export type ToolEffect = "read_only" | "draft" | "mutating";
export type ToolApprovalRequirement = Readonly<{
  effect: ToolEffect;
  approval: "not_required" | "explicit_ui";
}>;

const READ_ONLY = Object.freeze({ effect: "read_only", approval: "not_required" } as const);
const DRAFT = Object.freeze({ effect: "draft", approval: "explicit_ui" } as const);
const MUTATING = Object.freeze({ effect: "mutating", approval: "explicit_ui" } as const);

export const TOOL_APPROVAL_REQUIREMENTS = Object.freeze({
  evaluate_vaccination_schedule: READ_ONLY,
  get_growth_summary: READ_ONLY,
  suggest_pediatric_nutrition: READ_ONLY,
  validate_declared_pediatric_dose: READ_ONLY,
  register_anthropometry: MUTATING,
  record_vaccine_administration: MUTATING,
  create_medication_plan: MUTATING,
  record_medication_intake: MUTATING,
  record_development_observation: MUTATING,
  capture_clinical_memory_candidate: DRAFT,
  search_child_clinical_memory: READ_ONLY,
  prepare_private_document_upload: DRAFT,
  generate_vaccination_card: MUTATING,
} as const satisfies Record<RegisteredToolId, ToolApprovalRequirement>);

const ACTION_LABELS = Object.freeze({
  register_anthropometry: Object.freeze({ "es-CO": "Registrar antropometría", "en-US": "Record anthropometry" }),
  record_vaccine_administration: Object.freeze({ "es-CO": "Registrar administración de vacuna", "en-US": "Record vaccine administration" }),
  create_medication_plan: Object.freeze({ "es-CO": "Crear borrador de plan de medicamento", "en-US": "Create medication plan draft" }),
  record_medication_intake: Object.freeze({ "es-CO": "Registrar toma declarada", "en-US": "Record declared medication intake" }),
  record_development_observation: Object.freeze({ "es-CO": "Registrar observación de desarrollo", "en-US": "Record development observation" }),
  capture_clinical_memory_candidate: Object.freeze({ "es-CO": "Preparar candidato de memoria clínica", "en-US": "Prepare clinical memory candidate" }),
  prepare_private_document_upload: Object.freeze({ "es-CO": "Preparar carga privada de documento", "en-US": "Prepare private document upload" }),
  generate_vaccination_card: Object.freeze({ "es-CO": "Generar tarjeta de vacunación", "en-US": "Generate vaccination card" }),
} as const satisfies Record<ConsequentialToolId, Readonly<Record<TrustedToolLocale, string>>>);

type ConsequentialToolId = {
  [K in RegisteredToolId]: typeof TOOL_APPROVAL_REQUIREMENTS[K]["approval"] extends "explicit_ui" ? K : never
}[RegisteredToolId];

export type ApprovalPreviewEntry = Readonly<{
  path: string;
  value: string;
}>;

export type ApprovalPreview = Readonly<{
  kind: "tool_approval_preview";
  version: typeof PREVIEW_VERSION;
  toolId: ConsequentialToolId;
  schemaVersion: string;
  effect: "draft" | "mutating";
  subject: "active_child";
  locale: TrustedToolLocale;
  actionLabel: string;
  entries: readonly ApprovalPreviewEntry[];
  expiresAt: string;
  approvalDigest: string;
}>;

export type ApprovalConsumptionRequest = Readonly<{
  token: string;
  policyVersion: typeof POLICY_VERSION;
  toolId: ConsequentialToolId;
  schemaVersion: string;
  effect: "draft" | "mutating";
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  productSessionId: string;
  authorizationVersion: string;
  entitlementRevision: string;
  locale: TrustedToolLocale;
  expiresAt: string;
  approvalDigest: string;
}>;

export interface ToolApprovalPort {
  now(): Date;
  consume(request: ApprovalConsumptionRequest): Promise<unknown>;
}

export type VerifyToolApprovalInput<T> = Readonly<{
  schemaVersion: string;
  inputSchema: z.ZodType<T>;
  rawInput: unknown;
  approval: Readonly<{ preview: ApprovalPreview; token: string }> | null;
}>;

export type ApprovalDecision =
  | Readonly<{
    allowed: true;
    status: "not_required";
    policyVersion: typeof POLICY_VERSION;
    toolId: RegisteredToolId;
    effect: "read_only";
    approvalDigest: null;
  }>
  | Readonly<{
    allowed: true;
    status: "approved";
    policyVersion: typeof POLICY_VERSION;
    toolId: ConsequentialToolId;
    effect: "draft" | "mutating";
    approvalDigest: string;
    approvalId: string;
  }>
  | Readonly<{
    allowed: false;
    status: "approval_required";
    policyVersion: typeof POLICY_VERSION;
    toolId: ConsequentialToolId;
    effect: "draft" | "mutating";
    preview: ApprovalPreview;
  }>
  | Readonly<{
    allowed: false;
    status: "denied";
    policyVersion: typeof POLICY_VERSION;
    code: "TOOL_APPROVAL_DENIED";
  }>;

const DENIED: ApprovalDecision = Object.freeze({
  allowed: false,
  status: "denied",
  policyVersion: POLICY_VERSION,
  code: "TOOL_APPROVAL_DENIED",
});

const previewEntrySchema = z.object({
  path: z.string().min(1).max(256),
  value: z.string().max(8_000),
}).strict();

const previewSchema = z.object({
  kind: z.literal("tool_approval_preview"),
  version: z.literal(PREVIEW_VERSION),
  toolId: z.enum(REGISTERED_TOOL_IDS).refine((value): value is ConsequentialToolId =>
    TOOL_APPROVAL_REQUIREMENTS[value].approval === "explicit_ui"),
  schemaVersion: SCHEMA_VERSION,
  effect: z.enum(["draft", "mutating"]),
  subject: z.literal("active_child"),
  locale: z.enum(["es-CO", "en-US"]),
  actionLabel: z.string().min(1).max(128),
  entries: z.array(previewEntrySchema).max(MAX_PREVIEW_ENTRIES),
  expiresAt: INSTANT,
  approvalDigest: DIGEST,
}).strict();

const consumptionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["not_found", "mismatch", "expired", "replayed", "cancelled"]) }).strict(),
  z.object({
    status: z.literal("consumed"),
    approvalId: OPAQUE_ID,
    approvalDigest: DIGEST,
    confirmedAt: INSTANT,
    expiresAt: INSTANT,
    channel: z.literal("guardian_ui"),
  }).strict(),
]);

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function plainJson(
  value: unknown,
  seen = new Set<object>(),
  depth = 0,
): JsonValue | null {
  if (depth > 12) return null;
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string" && (value.length > 8_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))) return null;
    return typeof value === "string" ? value.normalize("NFKC").replace(/\r\n?/gu, "\n") : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 128) return null;
    const entries: JsonValue[] = [];
    for (const item of value) {
      const parsed = plainJson(item, seen, depth + 1);
      if (parsed === null && item !== null) return null;
      entries.push(parsed);
    }
    seen.delete(value);
    return Object.freeze(entries);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const rawEntries = Object.entries(value as Record<string, unknown>);
  if (rawEntries.length > 128) return null;
  const result: Record<string, JsonValue> = {};
  for (const [rawKey, item] of rawEntries.sort(([left], [right]) => left.localeCompare(right))) {
    const key = rawKey.normalize("NFKC");
    if (!key || key.length > 128 || FORBIDDEN_AUTHORITY_KEY.test(key)) return null;
    const parsed = plainJson(item, seen, depth + 1);
    if (parsed === null && item !== null) return null;
    result[key] = parsed;
  }
  seen.delete(value);
  return Object.freeze(result);
}

function flatten(value: JsonValue, path = ""): readonly ApprovalPreviewEntry[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [Object.freeze({ path: path || "input", value: "[]" })];
    return value.flatMap((item, index) => flatten(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return [Object.freeze({ path: path || "input", value: "{}" })];
    return entries.flatMap(([key, item]) => flatten(item, path ? `${path}.${key}` : key));
  }
  const rendered = value === null ? "null" : typeof value === "string" ? value : String(value);
  return [Object.freeze({ path: path || "input", value: rendered })];
}

function approvalPort(context: TrustedToolContext): ToolApprovalPort | null {
  try {
    const services = getTrustedToolServices(context) as Readonly<Record<string, unknown>>;
    const port = services.toolApproval;
    if (!port || typeof port !== "object") return null;
    const candidate = port as Partial<ToolApprovalPort>;
    return typeof candidate.now === "function" && typeof candidate.consume === "function"
      ? candidate as ToolApprovalPort
      : null;
  } catch {
    return null;
  }
}

function readNow(port: ToolApprovalPort): Date | null {
  try {
    const value = port.now();
    return value instanceof Date && Number.isFinite(value.getTime()) ? new Date(value) : null;
  } catch {
    return null;
  }
}

function parseRequest<T>(raw: unknown): VerifyToolApprovalInput<T> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).sort().join("|") !== "approval|inputSchema|rawInput|schemaVersion") return null;
  if (!SCHEMA_VERSION.safeParse(record.schemaVersion).success
    || !record.inputSchema
    || typeof record.inputSchema !== "object"
    || typeof (record.inputSchema as { safeParse?: unknown }).safeParse !== "function"
    || !(record.approval === null || (record.approval !== null && typeof record.approval === "object"))) return null;
  return raw as VerifyToolApprovalInput<T>;
}

function parseValidatedInput<T>(input: VerifyToolApprovalInput<T>): JsonValue | null {
  const before = plainJson(input.rawInput);
  if (before === null && input.rawInput !== null) return null;
  let parsed: z.ZodSafeParseResult<T>;
  try {
    parsed = input.inputSchema.safeParse(input.rawInput);
  } catch {
    return null;
  }
  if (!parsed.success) return null;
  const after = plainJson(parsed.data);
  if ((after === null && parsed.data !== null)
    || canonicalize(before) !== canonicalize(after)
    || Buffer.byteLength(canonicalize(after), "utf8") > MAX_CANONICAL_INPUT_BYTES) return null;
  return after;
}

function expiryFor(context: TrustedToolContext, now: Date): Date | null {
  try {
    const scope = requireActiveChildScope(context, now);
    const actor = getTrustedToolActor(context);
    const session = getTrustedToolSession(context);
    const entitlements = getTrustedToolEntitlements(context);
    const expiry = Math.min(
      now.getTime() + PREVIEW_TTL_MS,
      scope.expiresAt.getTime(),
      Date.parse(actor.expiresAt),
      Date.parse(session.authorizationExpiresAt),
      Date.parse(entitlements.expiresAt),
    );
    return Number.isFinite(expiry) && expiry > now.getTime() ? new Date(expiry) : null;
  } catch {
    return null;
  }
}

export function buildPreview(
  context: TrustedToolContext,
  toolId: ConsequentialToolId,
  schemaVersion: string,
  validatedInput: JsonValue,
  expiresAt: string,
  now: Date,
): ApprovalPreview | null {
  try {
    const scope = requireActiveChildScope(context, now);
    const actor = getTrustedToolActor(context);
    const session = getTrustedToolSession(context);
    const entitlements = getTrustedToolEntitlements(context);
    const locale = getTrustedToolLocale(context);
    const requirement = TOOL_APPROVAL_REQUIREMENTS[toolId];
    const entries = Object.freeze(
      [...flatten(validatedInput)].sort((a, b) => a.path.localeCompare(b.path))
    );
    if (entries.length > MAX_PREVIEW_ENTRIES) return null;
    const actionLabel = ACTION_LABELS[toolId][locale];
    const approvalDigest = hash({
      policyVersion: POLICY_VERSION,
      previewVersion: PREVIEW_VERSION,
      toolId,
      schemaVersion,
      effect: requirement.effect,
      actorUserId: actor.userId,
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      productSessionId: session.productSessionId,
      authorizationVersion: session.authorizationVersion,
      entitlementRevision: entitlements.revision,
      locale,
      validatedInput,
    });
    return Object.freeze({
      kind: "tool_approval_preview" as const,
      version: PREVIEW_VERSION,
      toolId,
      schemaVersion,
      effect: requirement.effect,
      subject: "active_child" as const,
      locale,
      actionLabel,
      entries,
      expiresAt,
      approvalDigest,
    });
  } catch {
    return null;
  }
}

export type ToolApprovalSubmission = Readonly<{
  preview: ApprovalPreview;
  token: string;
}>;

export function createConversationalToolApprovalSubmission(
  context: TrustedToolContext,
  toolId: ConsequentialToolId,
  schemaVersion: string,
  validatedInput: JsonValue,
  now: Date = new Date(),
): ToolApprovalSubmission | null {
  const expiry = expiryFor(context, now);
  if (!expiry) return null;
  const expiresAt = expiry.toISOString();
  const preview = buildPreview(context, toolId, schemaVersion, validatedInput, expiresAt, now);
  if (!preview) return null;
  return Object.freeze({
    preview,
    token: `token_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  });
}

function samePreview(left: ApprovalPreview, right: ApprovalPreview): boolean {
  const normalize = (p: ApprovalPreview) => ({
    ...p,
    entries: [...p.entries].sort((a, b) => a.path.localeCompare(b.path)),
  });
  return canonicalize(normalize(left)) === canonicalize(normalize(right));
}

export async function verifyToolApproval<T>(
  context: TrustedToolContext,
  tool: string,
  rawInput: VerifyToolApprovalInput<T>,
): Promise<ApprovalDecision> {
  const port = approvalPort(context);
  if (!port) return DENIED;
  const now = readNow(port);
  if (!now) return DENIED;
  const permission = authorizeToolInvocation(context, tool, now);
  if (!permission.allowed) return DENIED;
  const toolId = permission.toolId;
  const requirement = TOOL_APPROVAL_REQUIREMENTS[toolId];
  const input = parseRequest<T>(rawInput);
  if (!input) return DENIED;
  const validatedInput = parseValidatedInput(input);
  if (validatedInput === null && input.rawInput !== null) return DENIED;

  if (requirement.effect === "read_only") {
    return Object.freeze({
      allowed: true,
      status: "not_required",
      policyVersion: POLICY_VERSION,
      toolId,
      effect: "read_only",
      approvalDigest: null,
    });
  }

  const consequentialToolId = toolId as ConsequentialToolId;
  const approval = input.approval;
  if (approval === null) {
    const expiry = expiryFor(context, now);
    if (!expiry) return DENIED;
    const preview = buildPreview(
      context,
      consequentialToolId,
      input.schemaVersion,
      validatedInput,
      expiry.toISOString(),
      now,
    );
    if (!preview) return DENIED;
    return Object.freeze({
      allowed: false,
      status: "approval_required",
      policyVersion: POLICY_VERSION,
      toolId: consequentialToolId,
      effect: requirement.effect,
      preview,
    });
  }

  const approvalRecord = approval && typeof approval === "object" && !Array.isArray(approval)
    ? approval as Record<string, unknown>
    : null;
  if (!approvalRecord
    || Object.keys(approvalRecord).sort().join("|") !== "preview|token"
    || !TOKEN.safeParse(approvalRecord.token).success) return DENIED;
  const submitted = previewSchema.safeParse(approvalRecord.preview);
  if (!submitted.success
    || submitted.data.toolId !== consequentialToolId
    || submitted.data.schemaVersion !== input.schemaVersion
    || submitted.data.effect !== requirement.effect) return DENIED;
  const submittedExpiry = Date.parse(submitted.data.expiresAt);
  if (!Number.isFinite(submittedExpiry)
    || submittedExpiry <= now.getTime()
    || submittedExpiry > now.getTime() + PREVIEW_TTL_MS) return DENIED;
  const expected = buildPreview(
    context,
    consequentialToolId,
    input.schemaVersion,
    validatedInput,
    submitted.data.expiresAt,
    now,
  );
  if (!expected || !samePreview(expected, submitted.data as ApprovalPreview)) return DENIED;

  let scope;
  let receipt: z.infer<typeof consumptionResultSchema>;
  try {
    scope = requireActiveChildScope(context, now);
    const actor = getTrustedToolActor(context);
    const session = getTrustedToolSession(context);
    const entitlements = getTrustedToolEntitlements(context);
    const rawReceipt = await port.consume(Object.freeze({
      token: approvalRecord.token as string,
      policyVersion: POLICY_VERSION,
      toolId: consequentialToolId,
      schemaVersion: input.schemaVersion,
      effect: requirement.effect,
      actorUserId: actor.userId,
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      productSessionId: session.productSessionId,
      authorizationVersion: session.authorizationVersion,
      entitlementRevision: entitlements.revision,
      locale: getTrustedToolLocale(context),
      expiresAt: expected.expiresAt,
      approvalDigest: expected.approvalDigest,
    }));
    const parsedReceipt = consumptionResultSchema.safeParse(rawReceipt);
    if (!parsedReceipt.success) return DENIED;
    receipt = parsedReceipt.data;
  } catch {
    return DENIED;
  }
  if (receipt.status !== "consumed") return DENIED;
  const current = readNow(port);
  const confirmedAt = Date.parse(receipt.confirmedAt);
  if (!current
    || !authorizeToolInvocation(context, consequentialToolId, current).allowed
    || receipt.approvalDigest !== expected.approvalDigest
    || receipt.expiresAt !== expected.expiresAt
    || confirmedAt > current.getTime()
    || confirmedAt < current.getTime() - PREVIEW_TTL_MS
    || Date.parse(receipt.expiresAt) <= current.getTime()) return DENIED;

  return Object.freeze({
    allowed: true,
    status: "approved",
    policyVersion: POLICY_VERSION,
    toolId: consequentialToolId,
    effect: requirement.effect,
    approvalDigest: expected.approvalDigest,
    approvalId: receipt.approvalId,
  });
}
