import { z } from "zod";

import type { CountryCode, Sha256Hex } from "../governance/source-types.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
const OBJECT_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

const code = z.string().regex(CODE_PATTERN, "invalid code");
const digest = z.string().regex(SHA256_PATTERN, "SHA-256 digest");
const isoDate = z.string().refine(isIsoDate, "ISO calendar date");
const isoInstant = z.string().datetime({ offset: true });
const locale = z.string().regex(LOCALE_PATTERN, "locale");
const ageDays = z.number().int().nonnegative();
const nonEmptyText = (max: number) => z.string().min(1).max(max).refine((value) => value.trim().length > 0, "non-empty text");

export const developmentDomainSchema = z.enum([
  "gross_motor",
  "fine_motor",
  "language",
  "social",
  "cognitive",
  "adaptive",
  "general",
]);

const milestoneDomainSchema = z.enum([
  "gross_motor",
  "fine_motor",
  "language",
  "social",
  "cognitive",
  "adaptive",
]);

export type DevelopmentDomain = z.infer<typeof developmentDomainSchema>;

export type DevelopmentSourceProvenance = Readonly<{
  sourceId: string;
  sourceUri: string;
  sourceVersion: string;
  artifactSha256: Sha256Hex;
  license: string;
  retrievedAt: string;
}>;

export const developmentSourceProvenanceSchema = z.object({
  sourceId: code,
  sourceUri: z.string().url().refine((value) => new URL(value).protocol === "https:", "HTTPS source URI"),
  sourceVersion: code,
  artifactSha256: digest,
  license: nonEmptyText(500),
  retrievedAt: isoInstant,
}).strict();

export type DevelopmentContentProvenance = Readonly<{
  packageId: string;
  packageVersion: string;
  algorithmVersion: string;
  fixturesSha256: Sha256Hex;
  rightsSha256: Sha256Hex;
  jurisdiction: CountryCode;
  locale: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  translation: "original" | "translated" | "adapted";
  artifactSha256: Sha256Hex;
  approvalDigest: Sha256Hex;
  sources: readonly DevelopmentSourceProvenance[];
}>;

export const developmentContentProvenanceSchema = z.object({
  packageId: code,
  packageVersion: code,
  algorithmVersion: code,
  fixturesSha256: digest,
  rightsSha256: digest,
  jurisdiction: z.enum(["CO", "US", "GLOBAL"]),
  locale,
  effectiveFrom: isoDate,
  effectiveUntil: isoDate.nullable(),
  translation: z.enum(["original", "translated", "adapted"]),
  artifactSha256: digest,
  approvalDigest: digest,
  sources: z.array(developmentSourceProvenanceSchema).min(1).max(100).readonly(),
}).strict().superRefine((value, context) => {
  if (value.effectiveUntil !== null && value.effectiveUntil < value.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "effectiveUntil precedes effectiveFrom" });
  }
});

export type DevelopmentConcern = Readonly<{
  kind: "question_for_conversation";
  text: string;
}>;

export const developmentConcernSchema = z.object({
  kind: z.literal("question_for_conversation"),
  text: nonEmptyText(500),
}).strict();

export type AttachmentReference = Readonly<{
  bucket: "clinical-attachments";
  objectPath: string;
  digest: Sha256Hex;
  mime: "image/jpeg" | "image/png" | "application/pdf";
  size: number;
  state: "pending" | "clean" | "rejected" | "extracted" | "failed";
}>;

const attachmentObjectPath = z.string()
  .min(1)
  .max(512)
  .regex(OBJECT_PATH_PATTERN, "private object path")
  .refine((value) => !value.includes(".."), "parent traversal is not allowed")
  .refine((value) => !value.includes("//"), "empty object path segment is not allowed");

export const attachmentReferenceSchema = z.object({
  bucket: z.literal("clinical-attachments"),
  objectPath: attachmentObjectPath,
  digest,
  mime: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  size: z.number().int().min(0).max(20_971_520),
  state: z.enum(["pending", "clean", "rejected", "extracted", "failed"]),
}).strict();

export type CaregiverMilestoneItem = Readonly<{
  id: string;
  domain: Exclude<DevelopmentDomain, "general">;
  title: string;
  caregiverCopy: string;
  minAgeDays: number;
  maxAgeDays: number | null;
  provenance: DevelopmentContentProvenance;
}>;

export const caregiverMilestoneItemSchema = z.object({
  id: code,
  domain: milestoneDomainSchema,
  title: nonEmptyText(200),
  caregiverCopy: nonEmptyText(1000),
  minAgeDays: ageDays,
  maxAgeDays: ageDays.nullable(),
  provenance: developmentContentProvenanceSchema,
}).strict().superRefine((value, context) => {
  if (value.maxAgeDays !== null && value.maxAgeDays < value.minAgeDays) {
    context.addIssue({ code: "custom", path: ["maxAgeDays"], message: "maxAgeDays precedes minAgeDays" });
  }
});

type CaregiverDevelopmentFramework = Readonly<{
  kind: "caregiver_education" | "caregiver_observation";
  audience: "caregiver";
  id: string;
  version: string;
  items: readonly CaregiverMilestoneItem[];
  provenance: DevelopmentContentProvenance;
  disclaimer: string;
}>;

type ProfessionalInstrumentReference = Readonly<{
  kind: "professional_instrument_reference";
  audience: "professional";
  identifier: string;
  version: string;
  rights: Readonly<{
    license: string;
    artifactSha256: Sha256Hex;
    rightsSha256: Sha256Hex;
  }>;
  governance: Readonly<{
    sourceId: string;
    sourceDigest: Sha256Hex;
    approvalDigest: Sha256Hex;
  }>;
}>;

export type DevelopmentFramework = CaregiverDevelopmentFramework | ProfessionalInstrumentReference;

const caregiverFrameworkBase = {
  audience: z.literal("caregiver"),
  id: code,
  version: code,
  items: z.array(caregiverMilestoneItemSchema).max(500).readonly(),
  provenance: developmentContentProvenanceSchema,
  disclaimer: nonEmptyText(500),
} as const;

const caregiverEducationFrameworkSchema = z.object({
  ...caregiverFrameworkBase,
  kind: z.literal("caregiver_education"),
}).strict();

const caregiverObservationFrameworkSchema = z.object({
  ...caregiverFrameworkBase,
  kind: z.literal("caregiver_observation"),
}).strict();

const professionalInstrumentReferenceSchema = z.object({
  kind: z.literal("professional_instrument_reference"),
  audience: z.literal("professional"),
  identifier: code,
  version: code,
  rights: z.object({
    license: nonEmptyText(500),
    artifactSha256: digest,
    rightsSha256: digest,
  }).strict(),
  governance: z.object({
    sourceId: code,
    sourceDigest: digest,
    approvalDigest: digest,
  }).strict(),
}).strict();

export const developmentFrameworkSchema = z.discriminatedUnion("kind", [
  caregiverEducationFrameworkSchema,
  caregiverObservationFrameworkSchema,
  professionalInstrumentReferenceSchema,
]);

export type DevelopmentObservationDraft = Readonly<{
  text: string;
  date: string;
  domain: DevelopmentDomain;
  source: "caregiver" | "guardian";
  milestoneId?: string | null;
  concern?: DevelopmentConcern | null;
  attachments?: readonly AttachmentReference[];
}>;

export const developmentObservationDraftSchema = z.object({
  text: nonEmptyText(1000),
  date: isoDate,
  domain: developmentDomainSchema,
  source: z.enum(["caregiver", "guardian"]),
  milestoneId: code.nullable().optional(),
  concern: developmentConcernSchema.nullable().optional(),
  attachments: z.array(attachmentReferenceSchema).max(10).readonly().optional(),
}).strict();

export type DevelopmentDecisionProvenance = Readonly<{
  packageId: string;
  packageVersion: string;
  artifactSha256: Sha256Hex;
  sourceDigests: readonly Sha256Hex[];
  algorithmId: string;
  algorithmVersion: string;
  inputDigest: Sha256Hex;
  decisionDigest: Sha256Hex;
}>;

export const developmentDecisionProvenanceSchema = z.object({
  packageId: code,
  packageVersion: code,
  artifactSha256: digest,
  sourceDigests: z.array(digest).min(1).max(100).readonly(),
  algorithmId: code,
  algorithmVersion: code,
  inputDigest: digest,
  decisionDigest: digest,
}).strict();

export type DevelopmentGuidanceResult =
  | Readonly<{
      status: "educational_guidance";
      milestones: readonly CaregiverMilestoneItem[];
      disclaimer: string;
      provenance: DevelopmentDecisionProvenance;
    }>
  | Readonly<{
      status: "insufficient_data";
      reasonCodes: readonly string[];
      missingFacts: readonly string[];
      provenance: DevelopmentDecisionProvenance | null;
    }>
  | Readonly<{
      status: "professional_review";
      responseMode: "pediatrician_recommendation";
      reasonCodes: readonly string[];
      provenance: DevelopmentDecisionProvenance | null;
    }>
  | Readonly<{
      status: "emergency_only";
      responseMode: "emergency_recommendation";
      reasonCode: string;
    }>;

export const developmentGuidanceResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("educational_guidance"),
    milestones: z.array(caregiverMilestoneItemSchema).max(500).readonly(),
    disclaimer: nonEmptyText(500),
    provenance: developmentDecisionProvenanceSchema,
  }).strict(),
  z.object({
    status: z.literal("insufficient_data"),
    reasonCodes: z.array(code).min(1).max(100).readonly(),
    missingFacts: z.array(code).min(1).max(100).readonly(),
    provenance: developmentDecisionProvenanceSchema.nullable(),
  }).strict(),
  z.object({
    status: z.literal("professional_review"),
    responseMode: z.literal("pediatrician_recommendation"),
    reasonCodes: z.array(code).min(1).max(100).readonly(),
    provenance: developmentDecisionProvenanceSchema.nullable(),
  }).strict(),
  z.object({
    status: z.literal("emergency_only"),
    responseMode: z.literal("emergency_recommendation"),
    reasonCode: code,
  }).strict(),
]);

export const developmentResultSchema = developmentGuidanceResultSchema;
export type DevelopmentResult = DevelopmentGuidanceResult;
