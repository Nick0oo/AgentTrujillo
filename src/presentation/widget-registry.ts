import { z } from "zod";

import { DEVELOPMENT_OBSERVATION_PREVIEW_WIDGET_SCHEMA } from "./development-observation";
import { DOSE_VALIDATION_WIDGET_SCHEMA } from "./dose-validation";
import { EMERGENCY_RECOMMENDATION_SCHEMA } from "./emergency-recommendation";
import { GROWTH_SUMMARY_WIDGET_SCHEMA } from "./growth-summary";
import { GUARDIAN_CONFIRMATION_WIDGET_SCHEMA } from "./guardian-confirmation";
import { MEDICATION_SCHEDULE_PREVIEW_WIDGET_SCHEMA } from "./medication-schedule-preview";
import { NUTRITION_GUIDANCE_WIDGET_SCHEMA } from "./nutrition-guidance";
import { PROFESSIONAL_RECOMMENDATION_SCHEMA } from "./professional-recommendation";
import { SOURCE_LIST_WIDGET_SCHEMA } from "./source-list";
import { TOOL_STATE_SCHEMA } from "./tool-state";
import { VACCINATION_STATUS_WIDGET_SCHEMA } from "./vaccination-status";

const WIDGET_SCHEMAS = {
  growth_summary: GROWTH_SUMMARY_WIDGET_SCHEMA,
  vaccination_status: VACCINATION_STATUS_WIDGET_SCHEMA,
  medication_schedule_preview: MEDICATION_SCHEDULE_PREVIEW_WIDGET_SCHEMA,
  development_observation_preview: DEVELOPMENT_OBSERVATION_PREVIEW_WIDGET_SCHEMA,
  nutrition_guidance: NUTRITION_GUIDANCE_WIDGET_SCHEMA,
  guardian_confirmation: GUARDIAN_CONFIRMATION_WIDGET_SCHEMA,
  professional_recommendation: PROFESSIONAL_RECOMMENDATION_SCHEMA,
  emergency_recommendation: EMERGENCY_RECOMMENDATION_SCHEMA,
  source_list: SOURCE_LIST_WIDGET_SCHEMA,
  dose_validation: DOSE_VALIDATION_WIDGET_SCHEMA,
  tool_state: TOOL_STATE_SCHEMA,
} as const;

export type WidgetKind = keyof typeof WIDGET_SCHEMAS;
export type WidgetEnvelope = z.infer<(typeof WIDGET_SCHEMAS)[WidgetKind]>;
export type WidgetVersion =
  | "growth.summary.v1"
  | "vaccination.status.v1"
  | "medication.schedule-preview.v1"
  | "development.observation-preview.v1"
  | "nutrition.guidance.v1"
  | "guardian.confirmation.v1"
  | "professional.recommendation.v1"
  | "emergency.recommendation.v1"
  | "sources.list.v1"
  | "medication.dose-validation.v1"
  | "tool.state.v1";

type WidgetEventKind = "widget" | "safe_text" | "terminal_safety";
type WidgetActionPolicy = "none" | "confirmation_only";

export type WidgetRegistryEntry = Readonly<{
  kind: WidgetKind;
  version: WidgetVersion;
  schema: z.ZodType<WidgetEnvelope>;
  eventKind: WidgetEventKind;
  actionPolicy: WidgetActionPolicy;
  modelPolicy: "exclude_payload";
  maxBytes: number;
  rendererCompatibility: Readonly<{
    protocol: "creciendo.widget.v1";
    major: 1;
  }>;
  deprecation: Readonly<{
    status: "active";
    acceptsUntil: null;
    replacementVersion: null;
  }>;
}>;

export type WidgetRegistry = Readonly<Record<WidgetKind, WidgetRegistryEntry>>;

const RENDERER_COMPATIBILITY = Object.freeze({
  protocol: "creciendo.widget.v1" as const,
  major: 1 as const,
});
const ACTIVE = Object.freeze({
  status: "active" as const,
  acceptsUntil: null,
  replacementVersion: null,
});

function entry(
  kind: WidgetKind,
  version: WidgetVersion,
  schema: z.ZodType<WidgetEnvelope>,
  maxBytes: number,
  eventKind: WidgetEventKind = "widget",
  actionPolicy: WidgetActionPolicy = "none",
): WidgetRegistryEntry {
  return Object.freeze({
    kind,
    version,
    schema,
    eventKind,
    actionPolicy,
    modelPolicy: "exclude_payload" as const,
    maxBytes,
    rendererCompatibility: RENDERER_COMPATIBILITY,
    deprecation: ACTIVE,
  });
}

export const WIDGET_REGISTRY: WidgetRegistry = Object.freeze({
  growth_summary: entry("growth_summary", "growth.summary.v1", GROWTH_SUMMARY_WIDGET_SCHEMA, 262_144),
  vaccination_status: entry("vaccination_status", "vaccination.status.v1", VACCINATION_STATUS_WIDGET_SCHEMA, 262_144),
  medication_schedule_preview: entry(
    "medication_schedule_preview",
    "medication.schedule-preview.v1",
    MEDICATION_SCHEDULE_PREVIEW_WIDGET_SCHEMA,
    262_144,
    "widget",
    "confirmation_only",
  ),
  development_observation_preview: entry(
    "development_observation_preview",
    "development.observation-preview.v1",
    DEVELOPMENT_OBSERVATION_PREVIEW_WIDGET_SCHEMA,
    65_536,
    "widget",
    "confirmation_only",
  ),
  nutrition_guidance: entry("nutrition_guidance", "nutrition.guidance.v1", NUTRITION_GUIDANCE_WIDGET_SCHEMA, 262_144),
  guardian_confirmation: entry(
    "guardian_confirmation",
    "guardian.confirmation.v1",
    GUARDIAN_CONFIRMATION_WIDGET_SCHEMA,
    65_536,
    "widget",
    "confirmation_only",
  ),
  professional_recommendation: entry(
    "professional_recommendation",
    "professional.recommendation.v1",
    PROFESSIONAL_RECOMMENDATION_SCHEMA,
    4_096,
    "safe_text",
  ),
  emergency_recommendation: entry(
    "emergency_recommendation",
    "emergency.recommendation.v1",
    EMERGENCY_RECOMMENDATION_SCHEMA,
    2_048,
    "terminal_safety",
  ),
  source_list: entry("source_list", "sources.list.v1", SOURCE_LIST_WIDGET_SCHEMA, 131_072),
  dose_validation: entry("dose_validation", "medication.dose-validation.v1", DOSE_VALIDATION_WIDGET_SCHEMA, 65_536),
  tool_state: entry("tool_state", "tool.state.v1", TOOL_STATE_SCHEMA, 16_384),
});

export type WidgetRegistryErrorCode =
  | "WIDGET_INPUT_INVALID"
  | "WIDGET_UNSUPPORTED"
  | "WIDGET_TOO_LARGE"
  | "WIDGET_SCHEMA_INVALID";

const ERROR_MESSAGES: Readonly<Record<WidgetRegistryErrorCode, string>> = Object.freeze({
  WIDGET_INPUT_INVALID: "Widget input is invalid",
  WIDGET_UNSUPPORTED: "Widget type or version is unsupported",
  WIDGET_TOO_LARGE: "Widget exceeds its size limit",
  WIDGET_SCHEMA_INVALID: "Widget schema is invalid",
});

export class WidgetRegistryError extends Error {
  constructor(readonly code: WidgetRegistryErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "WidgetRegistryError";
  }
}

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const VERSION = z.string().min(1).max(128).regex(/^[a-z][a-z0-9._-]*\.v[0-9]+$/u);
const SUPPORTED_VERSIONS = z.array(VERSION).min(1).max(64);
// A source-list fallback may contain its already schema-validated canonical
// public HTTPS citation. Other schemes, markup and event handlers stay closed.
const UNSAFE_FALLBACK = /(?:[<>\x60]|\b(?:http|s3|gs|file|javascript|data)\s*:\s*|\bon[a-z]+\s*=)/iu;
const CONTROL_EXCEPT_TEXT_LAYOUT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Cf}\p{Cs}]/u;

type WalkState = {
  readonly seen: Set<object>;
  nodes: number;
};

function isPlainBoundedJson(value: unknown, state: WalkState, depth = 0): boolean {
  if (depth > 24 || state.nodes > 10_000) return false;
  state.nodes += 1;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || state.seen.has(value)) return false;

  let prototype: object | null;
  let array: boolean;
  try {
    prototype = Object.getPrototypeOf(value);
    array = Array.isArray(value);
  } catch {
    return false;
  }
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype) return false;

  state.seen.add(value);
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    state.seen.delete(value);
    return false;
  }
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (descriptorKeys.length > 2_048 || descriptorKeys.some((key) => typeof key !== "string")) {
    state.seen.delete(value);
    return false;
  }
  const keys = descriptorKeys as string[];
  if (keys.some((key) => FORBIDDEN_OBJECT_KEYS.has(key))) {
    state.seen.delete(value);
    return false;
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined
      || descriptor.get !== undefined
      || descriptor.set !== undefined
      || !("value" in descriptor)
      || (key !== "length" && descriptor.enumerable !== true)
      || !isPlainBoundedJson(descriptor.value, state, depth + 1)) {
      state.seen.delete(value);
      return false;
    }
  }
  state.seen.delete(value);
  return true;
}

function registryEntry(rawKind: unknown, rawVersion: unknown): WidgetRegistryEntry | null {
  if (typeof rawKind !== "string"
    || typeof rawVersion !== "string"
    || !Object.prototype.hasOwnProperty.call(WIDGET_REGISTRY, rawKind)) return null;
  const found = WIDGET_REGISTRY[rawKind as WidgetKind];
  return found.version === rawVersion ? found : null;
}

function extractFallback(widget: WidgetEnvelope): string | null {
  const record = widget as unknown as Readonly<{ kind: WidgetKind; data: Readonly<Record<string, unknown>> }>;
  if (record.kind === "tool_state") {
    const accessibility = record.data.accessibility;
    if (!accessibility || typeof accessibility !== "object" || Array.isArray(accessibility)) return null;
    const fallback = (accessibility as Readonly<Record<string, unknown>>).fallbackText;
    return typeof fallback === "string" ? fallback : null;
  }
  return typeof record.data.fallbackText === "string" ? record.data.fallbackText : null;
}

function safeFallback(widget: WidgetEnvelope): string | null {
  const fallback = extractFallback(widget);
  if (fallback === null
    || fallback.length < 1
    || fallback.length > 40_000
    || fallback !== fallback.normalize("NFKC")
    || CONTROL_EXCEPT_TEXT_LAYOUT.test(fallback)
    || UNSAFE_FALLBACK.test(fallback)) return null;
  return fallback;
}

function deepFreezeJson<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreezeJson(nested);
    Object.freeze(value);
  }
  return value;
}

export function parseWidgetEnvelope(raw: unknown): WidgetEnvelope {
  const state: WalkState = { seen: new Set<object>(), nodes: 0 };
  if (!isPlainBoundedJson(raw, state) || !raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new WidgetRegistryError("WIDGET_INPUT_INVALID");
  }
  const record = raw as Readonly<Record<string, unknown>>;
  const found = registryEntry(record.kind, record.version);
  if (found === null) throw new WidgetRegistryError("WIDGET_UNSUPPORTED");

  let encoded: string;
  try {
    encoded = JSON.stringify(raw);
  } catch {
    throw new WidgetRegistryError("WIDGET_INPUT_INVALID");
  }
  if (new TextEncoder().encode(encoded).byteLength > found.maxBytes) {
    throw new WidgetRegistryError("WIDGET_TOO_LARGE");
  }

  const parsed = found.schema.safeParse(raw);
  if (!parsed.success) throw new WidgetRegistryError("WIDGET_SCHEMA_INVALID");
  const widget = parsed.data as WidgetEnvelope;
  if (safeFallback(widget) === null) throw new WidgetRegistryError("WIDGET_SCHEMA_INVALID");
  return deepFreezeJson(widget) as WidgetEnvelope;
}

export function negotiateWidgetVersion(rawKind: unknown, rawSupportedVersions: unknown): WidgetVersion | null {
  const supported = SUPPORTED_VERSIONS.safeParse(rawSupportedVersions);
  if (!supported.success
    || new Set(supported.data).size !== supported.data.length
    || typeof rawKind !== "string"
    || !Object.prototype.hasOwnProperty.call(WIDGET_REGISTRY, rawKind)) return null;
  const found = WIDGET_REGISTRY[rawKind as WidgetKind];
  return supported.data.includes(found.version) ? found.version : null;
}

const GENERIC_FALLBACK = Object.freeze({
  "es-CO": "Contenido no disponible.",
  "en-US": "Content unavailable.",
});

export function renderFallbackText(raw: unknown, rawLocale: unknown = "en-US"): string {
  try {
    const widget = parseWidgetEnvelope(raw);
    return safeFallback(widget) ?? GENERIC_FALLBACK["en-US"];
  } catch {
    return rawLocale === "es-CO" ? GENERIC_FALLBACK["es-CO"] : GENERIC_FALLBACK["en-US"];
  }
}
