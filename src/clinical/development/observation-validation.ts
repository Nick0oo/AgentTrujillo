import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  attachmentReferenceSchema,
  caregiverMilestoneItemSchema,
  developmentObservationDraftSchema,
  type AttachmentReference,
  type DevelopmentObservationDraft,
} from "./types.ts";
import type { Sha256Hex } from "../governance/source-types.ts";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const CONTROL_OR_INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const MAX_TRUSTED_PEDIATRIC_AGE_DAYS = 18 * 366;
const CONVEYED_APPROVAL_RECORD_DIGEST = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as const;

const ageEvidenceSchema = z.object({
  ageDays: z.number().int().min(0).max(MAX_TRUSTED_PEDIATRIC_AGE_DAYS),
  basis: z.enum(["chronological", "corrected"]),
  referenceInstant: z.string().refine((value) => parseIsoInstant(value) !== null, "trusted reference instant"),
  timeZone: z.string().min(1),
  algorithmVersion: z.string().regex(CODE),
  provenance: z.object({
    provenanceType: z.literal("system"),
    sourceId: z.string().regex(CODE),
    sourceDigest: z.string().regex(DIGEST),
    observedAt: z.string().refine((value) => parseIsoInstant(value) !== null, "trusted observation instant"),
  }).strict(),
}).strict();

export type TrustedDevelopmentAgeEvidence = Readonly<z.infer<typeof ageEvidenceSchema>>;

const privateObjectPath = z.string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u)
  .refine((value) => !value.includes(".."), "parent traversal is not allowed")
  .refine((value) => !value.includes("//"), "empty object path segment is not allowed");

const attachmentProofSchema = z.object({
  bucket: z.literal("clinical-attachments"),
  objectPath: privateObjectPath,
  contentDigest: z.string().regex(DIGEST),
  mime: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  size: z.number().int().min(0).max(20_971_520),
  state: z.enum(["pending", "clean", "extracted"]),
  status: z.literal("authorized_private"),
  current: z.literal(true),
  revoked: z.literal(false),
  authorizationProofSha256: z.string().regex(DIGEST),
  scopeProofSha256: z.string().regex(DIGEST),
}).strict();

const resolvedMilestoneEvidenceSchema = z.object({
  audience: z.literal("caregiver"),
  status: z.literal("released"),
  current: z.literal(true),
  revoked: z.literal(false),
  approvalDigest: z.string().regex(DIGEST),
  approvalRecordDigest: z.literal(CONVEYED_APPROVAL_RECORD_DIGEST),
  frameworkId: z.string().regex(CODE),
  frameworkVersion: z.string().regex(CODE),
  frameworkDigest: z.string().regex(DIGEST),
  jurisdiction: z.enum(["CO", "US"]),
  locale: z.enum(["es-CO", "en-US"]),
  effectiveFrom: z.string().refine(isValidCalendarDate, "effective start date"),
  effectiveUntil: z.string().refine(isValidCalendarDate, "effective end date").nullable(),
  itemDigest: z.string().regex(DIGEST),
  item: caregiverMilestoneItemSchema,
}).strict();

/** Trusted released/current caregiver framework and item evidence; never model-facing. */
export type ResolvedDevelopmentMilestoneEvidence = Readonly<z.infer<typeof resolvedMilestoneEvidenceSchema>>;
/** Trusted private same-child attachment authorization evidence; never model-facing. */
export type DevelopmentAttachmentProof = Readonly<z.infer<typeof attachmentProofSchema>>;

const developmentObservationValidationContextSchema = z.object({
  cutoff: z.union([
    z.date().refine((value) => Number.isFinite(value.getTime()), "valid cutoff"),
    z.string().refine((value) => isValidCalendarDate(value) || parseIsoInstant(value) !== null, "valid cutoff"),
  ]),
  timeZone: z.string().refine(validTimeZone, "IANA time zone"),
  ageEvidence: ageEvidenceSchema,
  milestoneEvidence: resolvedMilestoneEvidenceSchema.nullable().optional(),
  attachmentProofs: z.array(attachmentProofSchema).max(10),
  expectedConfirmationDigest: z.string().regex(DIGEST).optional(),
  expectedConfirmationMaterial: z.unknown().optional(),
}).strict();

/** Trusted, server-resolved context; model/client authority fields are not accepted. */
export type DevelopmentObservationValidationContext = Readonly<z.infer<typeof developmentObservationValidationContextSchema>>;

export type DevelopmentObservationWarning = "attachment_pending" | "quoted_clinical_language_neutral";

export type DevelopmentObservationRejectionCode =
  | "INVALID_DRAFT"
  | "CONTEXT_INVALID"
  | "DATE_INVALID"
  | "DATE_IN_FUTURE"
  | "AGE_EVIDENCE_INVALID"
  | "MILESTONE_INVALID"
  | "MILESTONE_UNAVAILABLE"
  | "MILESTONE_DOMAIN_MISMATCH"
  | "MILESTONE_AGE_OUT_OF_WINDOW"
  | "PROFESSIONAL_REFERENCE_FORBIDDEN"
  | "TEXT_INVALID"
  | "CLINICAL_CLAIM_FORBIDDEN"
  | "ATTACHMENT_INVALID"
  | "DIGEST_DRIFT";

export type DevelopmentObservationConfirmationMaterial = Readonly<{
  schemaVersion: "development-observation-confirmation.v1";
  draft: DevelopmentObservationDraft;
  milestoneEvidence: Readonly<NormalizedMilestone["evidence"]> | null;
  attachmentProofs: readonly AttachmentProofMaterial[];
}>;

export type DevelopmentObservationValidationAccepted = Readonly<{
  ok: true;
  status: "valid";
  draft: DevelopmentObservationDraft;
  confirmationMaterial: DevelopmentObservationConfirmationMaterial;
  confirmationDigest: Sha256Hex;
  warnings: readonly DevelopmentObservationWarning[];
}>;

export type DevelopmentObservationValidationRejected = Readonly<{
  ok: false;
  status: "rejected";
  draft: null;
  confirmationMaterial: null;
  confirmationDigest: null;
  reasonCode: DevelopmentObservationRejectionCode;
  warnings: readonly DevelopmentObservationWarning[];
}>;

export type DevelopmentObservationValidationResult =
  | DevelopmentObservationValidationAccepted
  | DevelopmentObservationValidationRejected;

type RecordValue = Record<string, unknown>;

function isValidCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
}

function parseIsoInstant(value: string): Date | null {
  if (!ISO_INSTANT.test(value) || !isValidCalendarDate(value.slice(0, 10))) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function compareDates(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function localDate(instant: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const value = `${values.year}-${values.month}-${values.day}`;
    return isValidCalendarDate(value) ? value : null;
  } catch {
    return null;
  }
}

function normalizedText(value: string, maximum: number): string | null {
  if (CONTROL_OR_INVISIBLE.test(value)) return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (normalized.length === 0 || Array.from(normalized).length > maximum) return null;
  return normalized;
}

function sortedWarnings(values: readonly DevelopmentObservationWarning[]): readonly DevelopmentObservationWarning[] {
  return Object.freeze([...new Set(values)].sort());
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as RecordValue)) deepFreeze(child);
  return Object.freeze(value);
}

function reject(reasonCode: DevelopmentObservationRejectionCode): DevelopmentObservationValidationRejected {
  return Object.freeze({
    ok: false as const,
    status: "rejected" as const,
    draft: null,
    confirmationMaterial: null,
    confirmationDigest: null,
    reasonCode,
    warnings: Object.freeze([] as DevelopmentObservationWarning[]),
  });
}

function digest(value: unknown): Sha256Hex {
  return createHash("sha256")
    .update(new TextEncoder().encode(canonicalize(value)))
    .digest("hex") as Sha256Hex;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return canonicalize(left) === canonicalize(right);
  } catch {
    return false;
  }
}

function professionalIdentifier(value: string): boolean {
  return /(?:ead[\s_-]*3|ead3|professional|instrument|screen(?:ing)?|tamiz|assessment|scor(?:e|ing)|cut[- ]?off|classification|diagnos|autis)/iu.test(value);
}

const clinicalPatterns: readonly RegExp[] = [
  /\b(?:ead[\s_-]*3|ead3|a(?:dhd|utis(?:m|mo)?)|tdah|cerebral\s+palsy|par[aá]lisis\s+cerebral|developmental\s+disorder|trastorno\s+del\s+desarrollo|diagnos(?:is|tic|tico|tica)|(?:speech|language|motor|cognitive|social|developmental)\s+(?:delay|regression|normal|abnormal|on[- ]?track|behind|advanced)|(?:retraso|regresi[oó]n)\s+(?:del\s+habla|del\s+lenguaje|motor|cognitivo|social|del\s+desarrollo)|delay|retraso|regression|regresi[oó]n|normal|normalidad|abnormal|anormal|anormalidad|on[- ]?track|en\s+(?:curso|camino)|behind|por\s+debajo|advanced|avanzad[oa]|adelantad[oa]|screen(?:ing)?|tamizaje|cribado|developmental\s+age|edad\s+del\s+desarrollo|classification|clasificaci[oó]n|score|scoring|puntaje|cut[- ]?off|cutoff|umbral)\b/iu,
];
const claimPatterns: readonly RegExp[] = [
  /\b(?:confirmed|confirmado|achieved|attained|missed|pass(?:ed)?|fail(?:ed)?|aprob(?:ado|ada)|reprob(?:ado|ada)|logr[oó]|alcanz[oó]|cumpli[oó]|fall[oó]|retrasad[oa]|delayed)\b/iu,
];
const referenceMarkerPattern = /(?:ead[\s_-]*3|ead3|a(?:dhd|utis(?:m|mo)?)|tdah|cerebral\s+palsy|par[aá]lisis\s+cerebral|developmental\s+disorder|trastorno\s+del\s+desarrollo|professional|instrument|screen(?:ing)?|tamiz|scor(?:e|ing)|puntaje|cut[- ]?off|cutoff|classification|clasificaci[oó]n|examiner|evaluador|diagnos|(?:developmental|speech|language|motor|cognitive|social)\s+(?:delay|regression)|(?:retraso|regresi[oó]n)\s+(?:del\s+habla|del\s+lenguaje|motor|cognitivo|social|del\s+desarrollo)|normal|normalidad|abnormal|anormal|anormalidad|on[- ]?track|en\s+(?:curso|camino)|behind|por\s+debajo|advanced|avanzad[oa]|adelantad[oa]|regression|regresi[oó]n|pass(?:ed)?|fail(?:ed)?|aprob(?:ado|ada)|reprob(?:ado|ada))/iu;

type Span = Readonly<{ start: number; end: number }>;

function quotedSpans(text: string): readonly Span[] {
  const spans: Span[] = [];
  let open: { mark: string; start: number } | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const mark = text[index];
    if (mark === "\\") {
      index += 1;
      continue;
    }
    if (open === null && (mark === '"' || mark === "“" || mark === "‘")) {
      open = { mark, start: index };
      continue;
    }
    const closes = open !== null && ((open.mark === '"' && mark === '"') || (open.mark === "“" && mark === "”") || (open.mark === "‘" && mark === "’"));
    if (closes && open !== null) {
      spans.push({ start: open.start, end: index + 1 });
      open = null;
    }
  }
  return spans;
}

function hasAttribution(text: string, span: Span): boolean {
  const surrounding = `${text.slice(Math.max(0, span.start - 140), span.start)} ${text.slice(span.end, span.end + 140)}`;
  return /\b(?:caregiver|guardian|parent|mother|father|tutor|reported|reports|said|told|dijo|mencion[oó]|seg[uú]n|according\s+to|quoted|quote)\b/iu.test(surrounding);
}

function containsUnsafeClinicalLanguage(text: string): "unsafe" | "quoted" | null {
  for (const pattern of claimPatterns) if (pattern.test(text)) return "unsafe";
  const match = clinicalPatterns[0].exec(text);
  if (!match) return null;
  const spans = quotedSpans(text);
  const span = spans.find((candidate) => candidate.start <= match.index && candidate.end >= match.index + match[0].length);
  if (span === undefined || !hasAttribution(text, span)) return "unsafe";
  const outside = text.slice(0, span.start) + text.slice(span.end);
  if (clinicalPatterns.some((pattern) => pattern.test(outside))) return "unsafe";
  return "quoted";
}

function normalizeCutoff(context: DevelopmentObservationValidationContext): Readonly<{ date: string; instant: Date | null; timeZone: string }> | null {
  const timeZone = context.timeZone;
  const rawCutoff = context.cutoff;
  if (rawCutoff instanceof Date) {
    if (!Number.isFinite(rawCutoff.getTime())) return null;
    const instant = new Date(rawCutoff.getTime());
    const date = localDate(instant, timeZone);
    return date === null ? null : { date, instant, timeZone };
  }
  if (typeof rawCutoff !== "string") return null;
  if (isValidCalendarDate(rawCutoff)) return { date: rawCutoff, instant: null, timeZone };
  const instant = parseIsoInstant(rawCutoff);
  if (instant === null) return null;
  const date = localDate(instant, timeZone);
  return date === null ? null : { date, instant, timeZone };
}

function normalizeAgeEvidence(raw: unknown, cutoff: Readonly<{ date: string; instant: Date | null; timeZone: string }>): TrustedDevelopmentAgeEvidence | null {
  const parsed = ageEvidenceSchema.safeParse(raw);
  if (!parsed.success || parsed.data.timeZone !== cutoff.timeZone) return null;
  if (/model|llm|gemini|openrouter/iu.test(parsed.data.algorithmVersion)) return null;
  const reference = parseIsoInstant(parsed.data.referenceInstant);
  const observed = parseIsoInstant(parsed.data.provenance.observedAt);
  if (reference === null || observed === null) return null;
  if (cutoff.instant !== null && reference.getTime() !== cutoff.instant.getTime()) return null;
  if (localDate(reference, cutoff.timeZone) !== cutoff.date) return null;
  if (cutoff.instant !== null ? observed.getTime() > cutoff.instant.getTime() : (localDate(observed, cutoff.timeZone) ?? "") > cutoff.date) return null;
  return Object.freeze({ ...parsed.data, provenance: Object.freeze({ ...parsed.data.provenance }) });
}

type ResolvedMilestoneEvidence = z.infer<typeof resolvedMilestoneEvidenceSchema>;
type NormalizedMilestone = Readonly<{
  id: string;
  domain: Exclude<DevelopmentObservationDraft["domain"], "general">;
  minAgeDays: number;
  maxAgeDays: number | null;
  evidence: Readonly<{
    approvalRecordDigest: string;
    frameworkId: string;
    frameworkVersion: string;
    frameworkDigest: string;
    jurisdiction: "CO" | "US";
    locale: "es-CO" | "en-US";
    effectiveFrom: string;
    effectiveUntil: string | null;
    itemArtifactSha256: string;
    approvalDigest: string;
    itemDigest: string;
  }>;
}>;

function stringsFromMilestoneEvidence(evidence: ResolvedMilestoneEvidence): readonly string[] {
  return [
    evidence.frameworkId,
    evidence.frameworkVersion,
    evidence.item.id,
    evidence.item.title,
    evidence.item.caregiverCopy,
    evidence.item.provenance.packageId,
    evidence.item.provenance.packageVersion,
    evidence.item.provenance.algorithmVersion,
    ...evidence.item.provenance.sources.flatMap((source) => [source.sourceId, source.sourceVersion, source.sourceUri, source.license]),
  ];
}

function normalizeMilestone(raw: ResolvedMilestoneEvidence, cutoffDate: string): NormalizedMilestone | null {
  const item = raw.item;
  if (professionalIdentifier(item.id) || stringsFromMilestoneEvidence(raw).some((value) => referenceMarkerPattern.test(value))) return null;
  if (raw.approvalRecordDigest !== CONVEYED_APPROVAL_RECORD_DIGEST || raw.approvalDigest !== item.provenance.approvalDigest) return null;
  if (digest(item) !== raw.itemDigest) return null;
  if (raw.frameworkId !== item.provenance.packageId || raw.frameworkVersion !== item.provenance.packageVersion || raw.frameworkDigest !== item.provenance.artifactSha256) return null;
  if (raw.jurisdiction !== item.provenance.jurisdiction || raw.locale !== item.provenance.locale
    || raw.effectiveFrom !== item.provenance.effectiveFrom || raw.effectiveUntil !== item.provenance.effectiveUntil) return null;
  if ((raw.jurisdiction === "CO" && raw.locale !== "es-CO") || (raw.jurisdiction === "US" && raw.locale !== "en-US")) return null;
  if (raw.effectiveUntil !== null && raw.effectiveUntil < raw.effectiveFrom) return null;
  if (cutoffDate < raw.effectiveFrom || (raw.effectiveUntil !== null && cutoffDate > raw.effectiveUntil)) return null;
  return {
    id: item.id,
    domain: item.domain,
    minAgeDays: item.minAgeDays,
    maxAgeDays: item.maxAgeDays,
    evidence: {
      approvalRecordDigest: raw.approvalRecordDigest,
      frameworkId: raw.frameworkId,
      frameworkVersion: raw.frameworkVersion,
      frameworkDigest: raw.frameworkDigest,
      jurisdiction: raw.jurisdiction,
      locale: raw.locale,
      effectiveFrom: raw.effectiveFrom,
      effectiveUntil: raw.effectiveUntil,
      itemArtifactSha256: item.provenance.artifactSha256,
      approvalDigest: raw.approvalDigest,
      itemDigest: raw.itemDigest,
    },
  };
}

type AttachmentProof = DevelopmentAttachmentProof;
type AttachmentProofMaterial = Readonly<AttachmentProof>;

function normalizeAttachments(raw: readonly unknown[], proofs: readonly AttachmentProof[]): Readonly<{
  attachments: readonly AttachmentReference[];
  proofMaterial: readonly AttachmentProofMaterial[];
  warnings: readonly DevelopmentObservationWarning[];
}> | null {
  const parsed: AttachmentReference[] = [];
  for (const value of raw) {
    const item = attachmentReferenceSchema.safeParse(value);
    if (!item.success || item.data.state === "rejected" || item.data.state === "failed") return null;
    parsed.push(item.data as AttachmentReference);
  }
  const paths = parsed.map((item) => item.objectPath);
  const digests = parsed.map((item) => item.digest);
  if (new Set(paths).size !== paths.length || new Set(digests).size !== digests.length || proofs.length !== parsed.length) return null;
  const proofMaterial: AttachmentProofMaterial[] = [];
  for (const item of parsed) {
    const proof = proofs.find((candidate) => candidate.bucket === item.bucket && candidate.objectPath === item.objectPath);
    if (proof === undefined || proof.contentDigest !== item.digest
      || proof.mime !== item.mime || proof.size !== item.size || proof.state !== item.state) return null;
    proofMaterial.push(proof);
  }
  if (new Set(proofs.map((proof) => `${proof.bucket}:${proof.objectPath}`)).size !== proofs.length) return null;
  parsed.sort((left, right) => left.objectPath.localeCompare(right.objectPath) || left.digest.localeCompare(right.digest));
  proofMaterial.sort((left, right) => left.objectPath.localeCompare(right.objectPath) || left.contentDigest.localeCompare(right.contentDigest));
  return {
    attachments: Object.freeze(parsed),
    proofMaterial: Object.freeze(proofMaterial),
    warnings: Object.freeze(parsed.some((item) => item.state === "pending") ? ["attachment_pending"] : []),
  };
}

export function validateDevelopmentObservation(
  draft: unknown,
  context: DevelopmentObservationValidationContext,
): DevelopmentObservationValidationResult {
  const parsedContext = developmentObservationValidationContextSchema.safeParse(context);
  if (!parsedContext.success) return reject("CONTEXT_INVALID");
  const trustedContext = parsedContext.data;
  const cutoff = normalizeCutoff(trustedContext);
  if (cutoff === null) return reject("CONTEXT_INVALID");
  const parsed = developmentObservationDraftSchema.safeParse(draft);
  if (!parsed.success) return reject("INVALID_DRAFT");
  const text = normalizedText(parsed.data.text, 1_000);
  const concernText = parsed.data.concern === null || parsed.data.concern === undefined ? null : normalizedText(parsed.data.concern.text, 500);
  if (text === null || (parsed.data.concern !== null && parsed.data.concern !== undefined && concernText === null)) return reject("TEXT_INVALID");
  if (!isValidCalendarDate(parsed.data.date)) return reject("DATE_INVALID");
  if (compareDates(parsed.data.date, cutoff.date) > 0) return reject("DATE_IN_FUTURE");
  const age = normalizeAgeEvidence(trustedContext.ageEvidence, cutoff);
  if (age === null) return reject("AGE_EVIDENCE_INVALID");
  if (professionalIdentifier(parsed.data.milestoneId ?? "")) return reject("PROFESSIONAL_REFERENCE_FORBIDDEN");
  const textFlags = [text, concernText].filter((value): value is string => value !== null).map(containsUnsafeClinicalLanguage);
  if (textFlags.includes("unsafe")) return reject("CLINICAL_CLAIM_FORBIDDEN");
  const milestoneEvidencePresent = trustedContext.milestoneEvidence !== undefined && trustedContext.milestoneEvidence !== null;
  const milestone = milestoneEvidencePresent ? normalizeMilestone(trustedContext.milestoneEvidence!, cutoff.date) : null;
  const milestoneId = parsed.data.milestoneId ?? null;
  if (milestoneId !== null) {
    if (milestone === null) return reject("MILESTONE_UNAVAILABLE");
    if (milestone.id !== milestoneId) return reject("MILESTONE_INVALID");
    if (parsed.data.domain === "general" || parsed.data.domain !== milestone.domain) return reject("MILESTONE_DOMAIN_MISMATCH");
    if (age.ageDays < milestone.minAgeDays || (milestone.maxAgeDays !== null && age.ageDays > milestone.maxAgeDays)) return reject("MILESTONE_AGE_OUT_OF_WINDOW");
  } else if (milestoneEvidencePresent) return reject("MILESTONE_INVALID");
  const attachmentResult = normalizeAttachments(parsed.data.attachments ?? [], trustedContext.attachmentProofs);
  if (attachmentResult === null) return reject("ATTACHMENT_INVALID");
  const normalizedDraft: DevelopmentObservationDraft = Object.freeze({
    text,
    date: parsed.data.date,
    domain: parsed.data.domain,
    source: "caregiver",
    milestoneId,
    concern: concernText === null ? null : Object.freeze({ kind: "question_for_conversation" as const, text: concernText }),
    attachments: attachmentResult.attachments,
  });
  const confirmationMaterial: DevelopmentObservationConfirmationMaterial = Object.freeze({
    schemaVersion: "development-observation-confirmation.v1",
    draft: normalizedDraft,
    milestoneEvidence: milestone?.evidence ?? null,
    attachmentProofs: attachmentResult.proofMaterial,
  });
  const confirmationDigest = digest(confirmationMaterial);
  if (trustedContext.expectedConfirmationDigest !== undefined && trustedContext.expectedConfirmationDigest !== confirmationDigest) return reject("DIGEST_DRIFT");
  if (trustedContext.expectedConfirmationMaterial !== undefined && !sameCanonical(trustedContext.expectedConfirmationMaterial, confirmationMaterial)) return reject("DIGEST_DRIFT");
  const warnings = sortedWarnings([
    ...attachmentResult.warnings,
    ...(textFlags.includes("quoted") ? ["quoted_clinical_language_neutral" as const] : []),
  ]);
  return deepFreeze({ ok: true as const, status: "valid" as const, draft: normalizedDraft, confirmationMaterial, confirmationDigest, warnings });
}
