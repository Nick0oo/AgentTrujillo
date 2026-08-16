import { z } from "zod";

import type { ClinicalDomain, CountryCode, Sha256Hex, SourceReviewStatus } from "./source-types";
import { normalizeAuthorityCode } from "./source-types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

function isIsoInstant(value: string): boolean {
  return ISO_INSTANT_PATTERN.test(value)
    && isIsoDate(value.slice(0, 10))
    && Number.isFinite(Date.parse(value));
}

function isHttpsUri(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const dateSchema = z.string().refine(isIsoDate, "must be an ISO calendar date");
const instantSchema = z.string().refine(isIsoInstant, "must be an ISO instant");
const authoritySchema = z.string()
  .refine((value) => value.trim().length > 0, "authority is required")
  .transform(normalizeAuthorityCode);
const jurisdictionSchema = z.enum(["CO", "US", "GLOBAL"]);
const domainSchema = z.enum(["growth", "immunization", "medication", "development", "nutrition", "emergency"]);
const titleSchema = z.string().refine((value) => value.trim().length > 0, "title is required");
const licenseSchema = z.string().refine((value) => value.trim().length > 0, "license is required");
const digestSchema = z.string().regex(SHA256_HEX_PATTERN, "must be 64 lowercase hexadecimal characters")
  .transform((value) => value as Sha256Hex);
const statusSchema = z.enum(["candidate", "reviewed", "approved", "retired"] as const satisfies readonly SourceReviewStatus[]);

export const clinicalSourceCandidateSchema = z.object({
  authority: authoritySchema,
  jurisdiction: jurisdictionSchema,
  domain: domainSchema,
  title: titleSchema,
  sourceUri: z.string().refine(isHttpsUri, "sourceUri must use HTTPS"),
  citation: z.string().nullable().optional(),
  publishedAt: dateSchema.nullable().optional(),
  retrievedAt: instantSchema,
  effectiveFrom: dateSchema.nullable().optional(),
  effectiveUntil: dateSchema.nullable().optional(),
  license: licenseSchema,
  artifactSha256: digestSchema,
  status: statusSchema.optional().default("candidate"),
}).strict()
  .superRefine((candidate, context) => {
    if (candidate.effectiveFrom && candidate.effectiveUntil && candidate.effectiveUntil < candidate.effectiveFrom) {
      context.addIssue({
        code: "custom",
        path: ["effectiveUntil"],
        message: "effectiveUntil must not precede effectiveFrom",
      });
    }
  });

export type ParsedClinicalSourceCandidate = Readonly<{
  authority: string;
  jurisdiction: CountryCode;
  domain: ClinicalDomain;
  title: string;
  sourceUri: string;
  citation?: string | null;
  publishedAt?: string | null;
  retrievedAt: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  license: string;
  artifactSha256: Sha256Hex;
  status: SourceReviewStatus;
}>;

export { isIsoDate, isIsoInstant, isHttpsUri, ISO_DATE_PATTERN, ISO_INSTANT_PATTERN, SHA256_HEX_PATTERN };
