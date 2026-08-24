import { z } from "zod";

import { TOOL_ERROR_CODES } from "../../agent/lib/runtime/safe-tool-errors";
import { TOOL_APPROVAL_REQUIREMENTS } from "../../agent/lib/runtime/tool-approval-policy";
import { REGISTERED_TOOL_IDS } from "../../agent/lib/runtime/tool-permission-policy";
import { deepFreeze } from "../safety/message-types";

const STATUS = z.enum([
  "queued",
  "running",
  "awaiting_confirmation",
  "succeeded",
  "failed",
  "cancelled",
]);
const EFFECT_STATE = z.enum(["none", "committed", "unknown"]);
const LOCALE = z.enum(["es-CO", "en-US"]);
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const OPAQUE_ID = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const SEQUENCE = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const TOOL_ID = z.enum(REGISTERED_TOOL_IDS);
const TOOL_ERROR_CODE = z.enum(TOOL_ERROR_CODES);
const TRANSIENT_ERROR_CODES = new Set([
  "PROVIDER_UNAVAILABLE",
  "PERSISTENCE_UNAVAILABLE",
  "RATE_LIMITED",
  "TIMEOUT",
]);

const SAFE_ERROR_SCHEMA = z.object({
  kind: z.literal("tool_error"),
  version: z.literal("safe-tool-error.v1"),
  code: TOOL_ERROR_CODE,
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().min(1).max(300).nullable(),
}).strict().superRefine((value, context) => {
  if (value.retryable && !TRANSIENT_ERROR_CODES.has(value.code)) {
    context.addIssue({ code: "custom", path: ["retryable"], message: "unsafe_retry" });
  }
  if (value.retryAfterSeconds !== null
    && (value.code !== "RATE_LIMITED" || !value.retryable)) {
    context.addIssue({ code: "custom", path: ["retryAfterSeconds"], message: "unsafe_retry_delay" });
  }
});

const COMMIT_SCHEMA = z.object({
  status: z.literal("persisted"),
  outcome: z.enum(["created", "replayed", "no_effect"]),
  resultSha256: HASH,
}).strict();

const SPECIALIZED_WIDGET_SCHEMA = z.object({
  kind: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/u)
    .refine((value) => value !== "emergency_recommendation", "emergency_not_tool_state"),
  version: z.string().min(3).max(128).regex(/^[a-z][a-z0-9._-]*\.v[1-9][0-9]*$/u),
  reference: z.string().regex(/^widget:v1:[a-f0-9]{64}$/u),
}).strict();

const STATE_SCHEMA = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("queued"),
    effectState: z.literal("none"),
    commit: z.null(),
    error: z.null(),
  }).strict(),
  z.object({
    status: z.literal("running"),
    effectState: z.literal("none"),
    commit: z.null(),
    error: z.null(),
  }).strict(),
  z.object({
    status: z.literal("awaiting_confirmation"),
    effectState: z.literal("none"),
    commit: z.null(),
    error: z.null(),
    confirmationRequired: z.literal(true),
  }).strict(),
  z.object({
    status: z.literal("succeeded"),
    effectState: z.enum(["none", "committed"]),
    commit: COMMIT_SCHEMA,
    error: z.null(),
  }).strict(),
  z.object({
    status: z.literal("failed"),
    effectState: z.enum(["none", "unknown"]),
    commit: z.null(),
    error: SAFE_ERROR_SCHEMA,
  }).strict(),
  z.object({
    status: z.literal("cancelled"),
    effectState: z.enum(["none", "unknown"]),
    commit: z.null(),
    error: SAFE_ERROR_SCHEMA,
  }).strict(),
]);

const PREVIOUS_SCHEMA = z.object({
  sequence: SEQUENCE,
  status: STATUS,
}).strict();

type Status = z.infer<typeof STATUS>;
type ToolStateInput = z.infer<typeof TOOL_STATE_INPUT_SCHEMA>;
type RegisteredToolId = typeof REGISTERED_TOOL_IDS[number];

function transitionAllowed(input: ToolStateInput): boolean {
  const previous = input.previous;
  const current = input.state.status;
  if (previous === null) return current === "queued";
  if (input.sequence <= previous.sequence) return false;
  if (["succeeded", "failed", "cancelled"].includes(previous.status)) return false;
  if (previous.status === current) return true;
  if (previous.status === "queued") {
    if (current === "running" || current === "awaiting_confirmation"
      || current === "failed" || current === "cancelled") return true;
    return current === "succeeded"
      && input.state.status === "succeeded"
      && input.state.commit.outcome === "replayed";
  }
  if (previous.status === "awaiting_confirmation") {
    if (current === "running" || current === "failed" || current === "cancelled") return true;
    return current === "succeeded"
      && input.state.status === "succeeded"
      && input.state.commit.outcome === "replayed";
  }
  return previous.status === "running"
    && (current === "succeeded" || current === "failed" || current === "cancelled");
}

export const TOOL_STATE_INPUT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_execution_state"),
  version: z.literal("tool.execution-state.v1"),
  toolId: TOOL_ID,
  operationId: OPAQUE_ID,
  sequence: SEQUENCE,
  previous: PREVIOUS_SCHEMA.nullable(),
  state: STATE_SCHEMA,
  specializedWidget: SPECIALIZED_WIDGET_SCHEMA.nullable(),
}).strict().superRefine((value, context) => {
  const approvalRequired = TOOL_APPROVAL_REQUIREMENTS[value.toolId].approval === "explicit_ui";
  if (!transitionAllowed(value)) {
    context.addIssue({ code: "custom", path: ["state", "status"], message: "invalid_transition" });
  }
  if (!approvalRequired
    && (value.state.status === "awaiting_confirmation"
      || value.previous?.status === "awaiting_confirmation")) {
    context.addIssue({ code: "custom", path: ["state", "status"], message: "unexpected_confirmation" });
  }
  if (approvalRequired
    && value.previous?.status === "queued"
    && (value.state.status === "running" || value.state.status === "succeeded")) {
    context.addIssue({ code: "custom", path: ["state", "status"], message: "confirmation_bypassed" });
  }
  if (value.state.status === "failed"
    && value.state.error.retryable
    && value.state.effectState !== "none") {
    context.addIssue({ code: "custom", path: ["state", "error", "retryable"], message: "effect_not_safe" });
  }
  if (value.state.status === "succeeded") {
    const noEffect = value.state.commit.outcome === "no_effect";
    if ((value.state.effectState === "none") !== noEffect) {
      context.addIssue({ code: "custom", path: ["state", "effectState"], message: "effect_outcome" });
    }
    const readOnly = TOOL_APPROVAL_REQUIREMENTS[value.toolId].effect === "read_only";
    if (readOnly !== noEffect) {
      context.addIssue({ code: "custom", path: ["state", "commit", "outcome"], message: "tool_effect_outcome" });
    }
  }
  if (value.state.status === "failed" && value.state.error.code === "CANCELLED") {
    context.addIssue({ code: "custom", path: ["state", "error", "code"], message: "cancel_state" });
  }
  if (value.state.status === "cancelled"
    && (value.state.error.code !== "CANCELLED"
      || value.state.error.retryable
      || value.state.error.retryAfterSeconds !== null)) {
    context.addIssue({ code: "custom", path: ["state", "error"], message: "cancel_error" });
  }
  if (value.specializedWidget !== null
    && value.state.status !== "awaiting_confirmation"
    && value.state.status !== "succeeded") {
    context.addIssue({ code: "custom", path: ["specializedWidget"], message: "widget_state" });
  }
});

const DISPLAY_KEYS = new Set(REGISTERED_TOOL_IDS.map((toolId) => `tool.${toolId}`));
const DISPLAY_KEY = z.string().refine((value) => DISPLAY_KEYS.has(value as `tool.${typeof REGISTERED_TOOL_IDS[number]}`));
const OUTPUT_ERROR_SCHEMA = z.object({ code: TOOL_ERROR_CODE }).strict();
const RETRY_SCHEMA = z.object({
  allowed: z.boolean(),
  afterSeconds: z.number().int().min(1).max(300).nullable(),
}).strict().superRefine((value, context) => {
  if (!value.allowed && value.afterSeconds !== null) {
    context.addIssue({ code: "custom", path: ["afterSeconds"], message: "retry_disabled" });
  }
});

const COPY = Object.freeze({
  "es-CO": Object.freeze({
    queued: "Operación en espera.",
    running: "Operación en curso.",
    awaiting_confirmation: "Se requiere confirmación para continuar.",
    succeeded: "Operación completada.",
    failed: "No se pudo completar la operación.",
    cancelled: "Operación cancelada.",
  }),
  "en-US": Object.freeze({
    queued: "Operation queued.",
    running: "Operation in progress.",
    awaiting_confirmation: "Confirmation is required to continue.",
    succeeded: "Operation completed.",
    failed: "The operation could not be completed.",
    cancelled: "Operation cancelled.",
  }),
});

const ACCESSIBILITY_SCHEMA = z.object({
  liveRegion: z.enum(["polite", "assertive"]),
  announcement: z.string().min(1).max(160),
  fallbackText: z.string().min(1).max(160),
}).strict();

export const TOOL_STATE_SCHEMA = z.object({
  kind: z.literal("tool_state"),
  version: z.literal("tool.state.v1"),
  data: z.object({
    locale: LOCALE,
    toolDisplayKey: DISPLAY_KEY,
    operationId: OPAQUE_ID,
    sequence: SEQUENCE,
    status: STATUS,
    effectState: EFFECT_STATE,
    terminal: z.boolean(),
    commitOutcome: COMMIT_SCHEMA.shape.outcome.nullable(),
    error: OUTPUT_ERROR_SCHEMA.nullable(),
    retry: RETRY_SCHEMA,
    specializedWidget: SPECIALIZED_WIDGET_SCHEMA.nullable(),
    accessibility: ACCESSIBILITY_SCHEMA,
  }).strict(),
}).strict().superRefine((value, context) => {
  const data = value.data;
  const terminal = data.status === "succeeded" || data.status === "failed" || data.status === "cancelled";
  if (data.terminal !== terminal) {
    context.addIssue({ code: "custom", path: ["data", "terminal"], message: "terminal_state" });
  }
  if ((data.status === "succeeded") !== (data.commitOutcome !== null)) {
    context.addIssue({ code: "custom", path: ["data", "commitOutcome"], message: "commit_state" });
  }
  const hasError = data.status === "failed" || data.status === "cancelled";
  if (hasError !== (data.error !== null) || (data.status !== "failed" && data.retry.allowed)) {
    context.addIssue({ code: "custom", path: ["data", "error"], message: "error_state" });
  }
  if ((data.status === "queued" || data.status === "running" || data.status === "awaiting_confirmation")
    && data.effectState !== "none") {
    context.addIssue({ code: "custom", path: ["data", "effectState"], message: "premature_effect" });
  }
  if (data.status === "succeeded") {
    const noEffect = data.commitOutcome === "no_effect";
    if ((data.effectState === "none") !== noEffect) {
      context.addIssue({ code: "custom", path: ["data", "effectState"], message: "effect_outcome" });
    }
    const toolId = data.toolDisplayKey.slice("tool.".length) as RegisteredToolId;
    const readOnly = TOOL_APPROVAL_REQUIREMENTS[toolId].effect === "read_only";
    if (readOnly !== noEffect) {
      context.addIssue({ code: "custom", path: ["data", "commitOutcome"], message: "tool_effect_outcome" });
    }
  }
  if ((data.status === "failed" || data.status === "cancelled") && data.effectState === "committed") {
    context.addIssue({ code: "custom", path: ["data", "effectState"], message: "ambiguous_terminal_effect" });
  }
  if (data.status === "cancelled" && data.error?.code !== "CANCELLED") {
    context.addIssue({ code: "custom", path: ["data", "error", "code"], message: "cancel_error" });
  }
  if (data.status === "failed" && data.error?.code === "CANCELLED") {
    context.addIssue({ code: "custom", path: ["data", "error", "code"], message: "cancel_state" });
  }
  if (data.retry.allowed && (
    data.status !== "failed"
    || data.effectState !== "none"
    || data.error === null
    || !TRANSIENT_ERROR_CODES.has(data.error.code)
  )) {
    context.addIssue({ code: "custom", path: ["data", "retry"], message: "unsafe_retry" });
  }
  if (data.retry.afterSeconds !== null && data.error?.code !== "RATE_LIMITED") {
    context.addIssue({ code: "custom", path: ["data", "retry", "afterSeconds"], message: "unsafe_retry_delay" });
  }
  if (data.specializedWidget !== null
    && data.status !== "awaiting_confirmation"
    && data.status !== "succeeded") {
    context.addIssue({ code: "custom", path: ["data", "specializedWidget"], message: "widget_state" });
  }
  const expectedText = COPY[data.locale][data.status];
  const expectedRegion = data.status === "failed" ? "assertive" : "polite";
  if (data.accessibility.liveRegion !== expectedRegion
    || data.accessibility.announcement !== expectedText
    || data.accessibility.fallbackText !== expectedText) {
    context.addIssue({ code: "custom", path: ["data", "accessibility"], message: "accessibility_copy" });
  }
});

export type ToolState = Readonly<z.infer<typeof TOOL_STATE_SCHEMA>>;

export class ToolStatePresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Tool state presentation contract invalid");
    this.name = "ToolStatePresentationError";
  }
}

function fail(): never {
  throw new ToolStatePresentationError();
}

function outputError(state: ToolStateInput["state"]): z.infer<typeof OUTPUT_ERROR_SCHEMA> | null {
  return state.status === "failed" || state.status === "cancelled"
    ? { code: state.error.code }
    : null;
}

function retry(state: ToolStateInput["state"]): z.infer<typeof RETRY_SCHEMA> {
  const allowed = state.status === "failed"
    && state.effectState === "none"
    && state.error.retryable;
  return {
    allowed,
    afterSeconds: allowed ? state.error.retryAfterSeconds : null,
  };
}

export function presentToolState(rawState: unknown, rawLocale: unknown): ToolState {
  const input = TOOL_STATE_INPUT_SCHEMA.safeParse(rawState);
  const locale = LOCALE.safeParse(rawLocale);
  if (!input.success || !locale.success) return fail();

  const status: Status = input.data.state.status;
  const text = COPY[locale.data][status];
  const parsed = TOOL_STATE_SCHEMA.safeParse({
    kind: "tool_state",
    version: "tool.state.v1",
    data: {
      locale: locale.data,
      toolDisplayKey: `tool.${input.data.toolId}`,
      operationId: input.data.operationId,
      sequence: input.data.sequence,
      status,
      effectState: input.data.state.effectState,
      terminal: status === "succeeded" || status === "failed" || status === "cancelled",
      commitOutcome: input.data.state.status === "succeeded" ? input.data.state.commit.outcome : null,
      error: outputError(input.data.state),
      retry: retry(input.data.state),
      specializedWidget: input.data.specializedWidget,
      accessibility: {
        liveRegion: status === "failed" ? "assertive" : "polite",
        announcement: text,
        fallbackText: text,
      },
    },
  });
  if (!parsed.success) return fail();
  return deepFreeze(parsed.data);
}
