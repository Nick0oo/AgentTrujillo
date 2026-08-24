import { z } from "zod";

import {
  TOOL_APPROVAL_REQUIREMENTS,
  type ApprovalPreview,
} from "../../agent/lib/runtime/tool-approval-policy";

const CONSEQUENTIAL_TOOL_IDS = [
  "register_anthropometry",
  "record_vaccine_administration",
  "create_medication_plan",
  "record_medication_intake",
  "record_development_observation",
  "capture_clinical_memory_candidate",
  "prepare_private_document_upload",
  "generate_vaccination_card",
] as const;
const LOCALE = z.enum(["es-CO", "en-US"]);
const TOOL_ID = z.enum(CONSEQUENTIAL_TOOL_IDS);
const EFFECT = z.enum(["draft", "mutating"]);
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const SCHEMA_VERSION = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const PATH = z.string().min(1).max(256).regex(/^[A-Za-z][A-Za-z0-9]*(?:(?:\.[A-Za-z][A-Za-z0-9]*)|(?:\[[0-9]+\]))*$/u);
const CONTROL_OR_INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const UNSAFE_CONTENT = /(?:[<>\x60]|\b(?:https?|s3|gs|file|javascript|data)\s*:\s*|\bon[a-z]+\s*=|\b(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\s*[:=]|\[(?:\/?)(?:system|assistant|developer|tool|function|sistema|asistente|desarrollador|herramienta)\]|(?:ignore|forget|disregard|override|bypass|ignora|olvida|omite|anula|reemplaza).{0,80}(?:previous|prior|system|developer|assistant|instruction|prompt|policy|anterior(?:es)?|previ[oa]s?|sistema|desarrollador|asistente|instrucci[oó]n(?:es)?|pol[ií]tica))/iu;
const FORBIDDEN_AUTHORITY_PATH = /(?:^|\.)(?:actor(?:User)?Id|approval(?:Token|Id)?|approved|careSpaceId|care_space_id|childId|child_id|confirmationToken|countryOfCare|entitlement(?:s)?|guardianId|guardian_id|permission(?:s)?|role(?:s)?|scope|sessionId|session_id|token)(?:\.|\[|$)/iu;

const PREVIEW_ENTRY_SCHEMA = z.object({
  path: PATH,
  value: z.string().max(8_000),
}).strict();

const APPROVAL_PREVIEW_SCHEMA = z.object({
  kind: z.literal("tool_approval_preview"),
  version: z.literal("tool-approval-preview.v1"),
  toolId: TOOL_ID,
  schemaVersion: SCHEMA_VERSION,
  effect: EFFECT,
  subject: z.literal("active_child"),
  locale: LOCALE,
  actionLabel: z.string().min(1).max(128),
  entries: z.array(PREVIEW_ENTRY_SCHEMA).max(128),
  expiresAt: INSTANT,
  approvalDigest: HASH,
}).strict();

const SAFE_LABEL = z.string().min(1).max(256).refine((value) => !CONTROL_OR_INVISIBLE.test(value) && !UNSAFE_CONTENT.test(value));
const FACT_SCHEMA = z.discriminatedUnion("representation", [
  z.object({
    path: PATH,
    label: SAFE_LABEL,
    representation: z.literal("value"),
    value: z.string().max(8_000),
  }).strict(),
  z.object({
    path: PATH,
    label: SAFE_LABEL,
    representation: z.literal("linked_reference"),
    value: z.null(),
  }).strict(),
]);

const NOTICE_SCHEMA = z.object({
  code: z.enum([
    "review_before_confirming",
    "active_child_record_effect",
    "pending_draft_effect",
    "source_data_requires_review",
  ]),
  label: z.string().min(1).max(240),
}).strict();

export const GUARDIAN_CONFIRMATION_WIDGET_SCHEMA = z.object({
  kind: z.literal("guardian_confirmation"),
  version: z.literal("guardian.confirmation.v1"),
  data: z.object({
    locale: LOCALE,
    toolId: TOOL_ID,
    schemaVersion: SCHEMA_VERSION,
    effect: EFFECT,
    subject: z.literal("active_child"),
    actionLabel: SAFE_LABEL,
    warning: NOTICE_SCHEMA,
    facts: z.array(FACT_SCHEMA).max(128).readonly(),
    risks: z.array(NOTICE_SCHEMA).length(1).readonly(),
    uncertainties: z.array(NOTICE_SCHEMA).length(1).readonly(),
    approval: z.object({
      policyVersion: z.literal("tool-approval.v1"),
      mode: z.literal("explicit_ui"),
      usage: z.literal("single_use"),
      scopeBinding: z.literal("server_bound"),
      approvalDigest: HASH,
      expiresAt: INSTANT,
    }).strict(),
    controls: z.object({
      defaultFocus: z.literal("cancel"),
      approve: z.object({
        id: z.literal("approve_once"),
        semantic: z.literal("approve"),
        label: SAFE_LABEL,
      }).strict(),
      cancel: z.object({
        id: z.literal("cancel"),
        semantic: z.literal("cancel"),
        label: SAFE_LABEL,
      }).strict(),
    }).strict(),
    screenReaderSummary: z.string().min(1).max(1_000),
    fallbackText: z.string().min(1).max(40_000),
  }).strict(),
}).strict();

export type GuardianConfirmationWidget = Readonly<z.infer<typeof GUARDIAN_CONFIRMATION_WIDGET_SCHEMA>>;
type ConsequentialToolId = typeof CONSEQUENTIAL_TOOL_IDS[number];
type Locale = z.infer<typeof LOCALE>;

type PreviewSpec = Readonly<{
  schemaVersion: string;
  effect: "draft" | "mutating";
  actionLabel: Readonly<Record<Locale, string>>;
  allowedPaths: readonly string[];
  hiddenPaths: readonly string[];
  linkedReferencePaths: readonly string[];
  requiredPaths: readonly string[];
}>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const GUARDIAN_CONFIRMATION_PREVIEW_REGISTRY = deepFreeze({
  register_anthropometry: {
    schemaVersion: "register-anthropometry.v1",
    effect: "mutating",
    actionLabel: { "es-CO": "Registrar antropometría", "en-US": "Record anthropometry" },
    allowedPaths: ["kind", "value", "value.pounds", "value.ounces", "unit", "occurredAt", "sourceNote", "idempotencyKey"],
    hiddenPaths: ["idempotencyKey"],
    linkedReferencePaths: [],
    requiredPaths: ["kind", "unit", "occurredAt", "idempotencyKey"],
  },
  record_vaccine_administration: {
    schemaVersion: "record-vaccine-administration.v1",
    effect: "mutating",
    actionLabel: { "es-CO": "Registrar administración de vacuna", "en-US": "Record vaccine administration" },
    allowedPaths: ["productLabel", "productIdentifier", "administeredOn", "location", "evidenceDraftId", "idempotencyKey"],
    hiddenPaths: ["idempotencyKey"],
    linkedReferencePaths: ["evidenceDraftId"],
    requiredPaths: ["administeredOn", "evidenceDraftId", "idempotencyKey"],
  },
  create_medication_plan: {
    schemaVersion: "create-medication-plan.v1",
    effect: "mutating",
    actionLabel: { "es-CO": "Crear borrador de plan de medicamento", "en-US": "Create medication plan draft" },
    allowedPaths: [
      "product.displayName", "product.conceptCode", "product.codingSystem",
      "presentation.form", "presentation.release", "presentation.regulatoryIdentifier", "presentation.concentration",
      "presentation.concentration.numerator", "presentation.concentration.numeratorUnit",
      "presentation.concentration.denominator", "presentation.concentration.denominatorUnit",
      "dose.quantity", "dose.unit", "route", "frequency.kind", "frequency.everyHours",
      "frequency.times[]", "frequency.label", "startsAt", "endsAt", "timeZone",
      "declaredIndication", "instructions", "idempotencyKey",
    ],
    hiddenPaths: ["idempotencyKey"],
    linkedReferencePaths: [],
    requiredPaths: [
      "product.displayName", "product.conceptCode", "product.codingSystem", "presentation.form",
      "presentation.release", "presentation.regulatoryIdentifier", "dose.quantity", "dose.unit", "route",
      "frequency.kind", "startsAt", "timeZone", "idempotencyKey",
    ],
  },
  record_medication_intake: {
    schemaVersion: "record-medication-intake.v1",
    effect: "mutating",
    actionLabel: { "es-CO": "Registrar toma declarada", "en-US": "Record declared medication intake" },
    allowedPaths: [
      "planReference", "occurrenceReference", "scheduledFor", "state", "takenAt", "quantity", "unit", "idempotencyKey",
    ],
    hiddenPaths: ["idempotencyKey"],
    linkedReferencePaths: ["planReference", "occurrenceReference"],
    requiredPaths: ["planReference", "state", "idempotencyKey"],
  },
  record_development_observation: {
    schemaVersion: "record-development-observation.v1",
    effect: "mutating",
    actionLabel: { "es-CO": "Registrar observación de desarrollo", "en-US": "Record development observation" },
    allowedPaths: ["text", "date", "domain", "milestoneId", "concern", "concern.kind", "concern.text", "attachments[]"],
    hiddenPaths: [],
    linkedReferencePaths: ["attachments[]"],
    requiredPaths: ["text", "date", "domain"],
  },
  capture_clinical_memory_candidate: {
    schemaVersion: "capture-clinical-memory-candidate.v1",
    effect: "draft",
    actionLabel: { "es-CO": "Preparar candidato de memoria clínica", "en-US": "Prepare clinical memory candidate" },
    allowedPaths: ["memoryType", "content.text", "content.sourceSpan.start", "content.sourceSpan.end", "idempotencyKey"],
    hiddenPaths: ["idempotencyKey"],
    linkedReferencePaths: [],
    requiredPaths: ["memoryType", "content.text", "content.sourceSpan.start", "content.sourceSpan.end", "idempotencyKey"],
  },
  prepare_private_document_upload: {
    schemaVersion: "prepare-private-document-upload.v1",
    effect: "draft",
    actionLabel: { "es-CO": "Preparar carga privada de documento", "en-US": "Prepare private document upload" },
    allowedPaths: [
      "purpose", "fileName", "declaredMimeType", "sizeBytes", "checksum.algorithm", "checksum.value",
      "consent.granted", "consent.purpose", "retentionClass", "idempotencyKey",
    ],
    hiddenPaths: ["idempotencyKey"],
    linkedReferencePaths: [],
    requiredPaths: [
      "purpose", "fileName", "declaredMimeType", "sizeBytes", "checksum.algorithm", "checksum.value",
      "consent.granted", "consent.purpose", "retentionClass", "idempotencyKey",
    ],
  },
  generate_vaccination_card: {
    schemaVersion: "generate-vaccination-card.v1",
    effect: "mutating",
    actionLabel: { "es-CO": "Generar tarjeta de vacunación", "en-US": "Generate vaccination card" },
    allowedPaths: ["locale", "displayOptions.paperSize", "displayOptions.orientation", "displayOptions.includeProvenance", "idempotencyKey"],
    hiddenPaths: ["idempotencyKey"],
    linkedReferencePaths: [],
    requiredPaths: ["idempotencyKey"],
  },
} as const satisfies Record<ConsequentialToolId, PreviewSpec>);

const COPY = deepFreeze({
  "es-CO": {
    warning: "Revise cada campo mostrado antes de confirmar.",
    mutatingRisk: "Esta confirmación puede cambiar el registro activo.",
    draftRisk: "Esta confirmación prepara un borrador pendiente.",
    uncertainty: "Los datos mostrados requieren revisión del cuidador.",
    confirm: "Confirmar",
    cancel: "Cancelar",
    linked: "referencia vinculada",
    expires: "Vence",
    fields: "campos mostrados",
  },
  "en-US": {
    warning: "Review every displayed field before confirming.",
    mutatingRisk: "This confirmation may change the active record.",
    draftRisk: "This confirmation prepares a pending draft.",
    uncertainty: "The displayed data requires caregiver review.",
    confirm: "Confirm",
    cancel: "Cancel",
    linked: "linked reference",
    expires: "Expires",
    fields: "displayed fields",
  },
} as const);

export class GuardianConfirmationPresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Guardian confirmation presentation contract invalid");
    this.name = "GuardianConfirmationPresentationError";
  }
}

function fail(): never {
  throw new GuardianConfirmationPresentationError();
}

function normalizedPath(path: string): string {
  return path.replace(/\[[0-9]+\]/gu, "[]");
}

function safeValue(value: string): boolean {
  return value === value.normalize("NFKC")
    && !CONTROL_OR_INVISIBLE.test(value)
    && !UNSAFE_CONTENT.test(value);
}

function validateConditionalFields(
  toolId: ConsequentialToolId,
  values: ReadonlyMap<string, string>,
  locale: Locale,
): boolean {
  const has = (path: string) => values.has(path);
  if (toolId === "register_anthropometry") {
    const direct = has("value");
    const pounds = has("value.pounds");
    const ounces = has("value.ounces");
    return direct ? !pounds && !ounces : pounds && ounces;
  }
  if (toolId === "record_vaccine_administration") {
    return has("productLabel") || has("productIdentifier");
  }
  if (toolId === "create_medication_plan") {
    const directConcentration = has("presentation.concentration");
    const concentrationParts = ["numerator", "numeratorUnit", "denominator", "denominatorUnit"]
      .map((part) => has(`presentation.concentration.${part}`));
    const concentration = directConcentration
      ? concentrationParts.every((present) => !present)
      : concentrationParts.every(Boolean);
    const frequencyKind = values.get("frequency.kind");
    const everyHours = has("frequency.everyHours");
    const times = [...values.keys()].some((path) => normalizedPath(path) === "frequency.times[]");
    const label = has("frequency.label");
    const frequency = frequencyKind === "interval"
      ? everyHours && !times && !label
      : frequencyKind === "times_of_day"
        ? times && !everyHours && !label
        : frequencyKind === "as_needed" && label && !everyHours && !times;
    return concentration && frequency;
  }
  if (toolId === "record_medication_intake") {
    const takenAt = has("takenAt");
    const quantityPair = has("quantity") === has("unit");
    return quantityPair && (values.get("state") === "taken" ? takenAt : !takenAt);
  }
  if (toolId === "record_development_observation") {
    const concern = values.get("concern");
    const nestedConcern = has("concern.kind") || has("concern.text");
    return concern === undefined
      ? !nestedConcern || (has("concern.kind") && has("concern.text"))
      : concern === "null" && !nestedConcern;
  }
  if (toolId === "generate_vaccination_card") {
    return values.get("locale") === undefined || values.get("locale") === locale;
  }
  return true;
}

function assertPreviewContract(
  preview: z.infer<typeof APPROVAL_PREVIEW_SCHEMA>,
  locale: Locale,
): PreviewSpec {
  const spec = GUARDIAN_CONFIRMATION_PREVIEW_REGISTRY[preview.toolId];
  if (preview.locale !== locale
    || preview.schemaVersion !== spec.schemaVersion
    || preview.effect !== spec.effect
    || preview.actionLabel !== spec.actionLabel[locale]
    || TOOL_APPROVAL_REQUIREMENTS[preview.toolId].approval !== "explicit_ui"
    || TOOL_APPROVAL_REQUIREMENTS[preview.toolId].effect !== spec.effect) fail();

  const expiresIn = Date.parse(preview.expiresAt) - Date.now();
  if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 300_000) fail();

  const values = new Map<string, string>();
  const allowedPaths: readonly string[] = spec.allowedPaths;
  for (const entry of preview.entries) {
    if (FORBIDDEN_AUTHORITY_PATH.test(entry.path)
      || !safeValue(entry.value)
      || values.has(entry.path)
      || !allowedPaths.includes(normalizedPath(entry.path))) fail();
    values.set(entry.path, entry.value);
  }
  if (spec.requiredPaths.some((path) => !values.has(path))
    || !validateConditionalFields(preview.toolId, values, locale)) fail();
  return spec;
}

export function presentGuardianConfirmation(rawPreview: unknown, rawLocale: unknown): GuardianConfirmationWidget {
  const parsedPreview = APPROVAL_PREVIEW_SCHEMA.safeParse(rawPreview);
  const parsedLocale = LOCALE.safeParse(rawLocale);
  if (!parsedPreview.success || !parsedLocale.success) fail();

  const preview = parsedPreview.data;
  const locale = parsedLocale.data;
  const spec = assertPreviewContract(preview, locale);
  const copy = COPY[locale];
  const facts = preview.entries
    .filter((entry) => !spec.hiddenPaths.includes(normalizedPath(entry.path)))
    .map((entry) => spec.linkedReferencePaths.includes(normalizedPath(entry.path))
      ? { path: entry.path, label: entry.path, representation: "linked_reference" as const, value: null }
      : { path: entry.path, label: entry.path, representation: "value" as const, value: entry.value })
    .sort((left, right) => left.path.localeCompare(right.path));
  const risk = preview.effect === "draft"
    ? { code: "pending_draft_effect" as const, label: copy.draftRisk }
    : { code: "active_child_record_effect" as const, label: copy.mutatingRisk };
  const fallbackFacts = facts.map((fact) => `${fact.label}: ${fact.value ?? copy.linked}`).join("\n");
  const screenReaderSummary = `${preview.actionLabel}. ${facts.length} ${copy.fields}. ${copy.warning} ${copy.expires}: ${preview.expiresAt}.`;
  const fallbackText = [
    preview.actionLabel,
    copy.warning,
    risk.label,
    copy.uncertainty,
    fallbackFacts,
    `${copy.expires}: ${preview.expiresAt}`,
    `${copy.confirm} / ${copy.cancel}`,
  ].filter((line) => line.length > 0).join("\n");

  const widget = {
    kind: "guardian_confirmation" as const,
    version: "guardian.confirmation.v1" as const,
    data: {
      locale,
      toolId: preview.toolId,
      schemaVersion: preview.schemaVersion,
      effect: preview.effect,
      subject: preview.subject,
      actionLabel: preview.actionLabel,
      warning: { code: "review_before_confirming" as const, label: copy.warning },
      facts,
      risks: [risk],
      uncertainties: [{ code: "source_data_requires_review" as const, label: copy.uncertainty }],
      approval: {
        policyVersion: "tool-approval.v1" as const,
        mode: "explicit_ui" as const,
        usage: "single_use" as const,
        scopeBinding: "server_bound" as const,
        approvalDigest: preview.approvalDigest,
        expiresAt: preview.expiresAt,
      },
      controls: {
        defaultFocus: "cancel" as const,
        approve: { id: "approve_once" as const, semantic: "approve" as const, label: copy.confirm },
        cancel: { id: "cancel" as const, semantic: "cancel" as const, label: copy.cancel },
      },
      screenReaderSummary,
      fallbackText,
    },
  };
  const parsedWidget = GUARDIAN_CONFIRMATION_WIDGET_SCHEMA.safeParse(widget);
  if (!parsedWidget.success) fail();
  return deepFreeze(parsedWidget.data) as GuardianConfirmationWidget;
}

// This compile-time assertion keeps the presenter input aligned with the
// approval-policy preview without exporting hidden scope or token material.
type PresenterApprovalPreview = z.infer<typeof APPROVAL_PREVIEW_SCHEMA>;
const assertApprovalPreviewCompatibility = (value: PresenterApprovalPreview): ApprovalPreview => value;
void assertApprovalPreviewCompatibility;
