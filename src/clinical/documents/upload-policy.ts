import { z } from "zod";

import {
  documentPurposeSchema,
  type DocumentPurpose,
  type DocumentRetentionClass,
  type PrivateDocumentBucket,
} from "./types.ts";

const INSTANT = z.string().datetime({ offset: true });
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const INPUT = z.object({
  purpose: documentPurposeSchema,
  fileName: z.string().min(1).max(512),
  declaredMimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int(),
  checksum: z.object({ algorithm: z.literal("sha256"), value: DIGEST }).strict(),
  consent: z.object({ granted: z.literal(true), purpose: z.literal("document_upload") }).strict(),
  retentionClass: z.enum(["ephemeral_upload", "child_record", "generated_artifact", "clinical_source"]),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u).optional(),
}).strict();

type UploadRule = Readonly<{
  bucket: PrivateDocumentBucket;
  mimeTypes: readonly string[];
  extensions: readonly string[];
  maxSizeBytes: number;
  retentionClasses: readonly DocumentRetentionClass[];
}>;

export type DocumentUploadPolicy = Readonly<{
  version: string;
  country: "CO" | "US";
  status: "active" | "revoked";
  effectiveFrom: string;
  effectiveUntil: string;
  rules: Readonly<Partial<Record<DocumentPurpose, UploadRule>>>;
}>;

export type UploadMetadataRejectReason =
  | "INVALID_INPUT"
  | "POLICY_UNAVAILABLE"
  | "POLICY_REVOKED"
  | "POLICY_OUTSIDE_EFFECTIVE_WINDOW"
  | "PURPOSE_NOT_ALLOWED"
  | "SUSPICIOUS_FILE_NAME"
  | "MIME_NOT_ALLOWED"
  | "MIME_EXTENSION_MISMATCH"
  | "INVALID_SIZE"
  | "CHECKSUM_REQUIRED"
  | "CONSENT_REQUIRED"
  | "RETENTION_NOT_ALLOWED";

export type AcceptedUploadMetadata = Readonly<{
  purpose: DocumentPurpose;
  displayName: string;
  bucket: PrivateDocumentBucket;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  retentionClass: DocumentRetentionClass;
  policyVersion: string;
}>;

export type UploadMetadataDecision =
  | Readonly<{ ok: true; status: "allowed"; metadata: AcceptedUploadMetadata }>
  | Readonly<{ ok: false; status: "rejected"; reasons: readonly UploadMetadataRejectReason[] }>;

export const DEFAULT_DOCUMENT_UPLOAD_POLICY = Object.freeze({
  version: "document-upload.v1",
  country: "CO",
  status: "active",
  effectiveFrom: "2026-08-01T00:00:00.000Z",
  effectiveUntil: "2027-08-01T00:00:00.000Z",
  rules: Object.freeze({
    avatar: Object.freeze({
      bucket: "avatars",
      mimeTypes: Object.freeze(["image/jpeg", "image/png"]),
      extensions: Object.freeze(["jpg", "jpeg", "png"]),
      maxSizeBytes: 5_000_000,
      retentionClasses: Object.freeze(["child_record"] as const),
    }),
    vaccine_record: Object.freeze({
      bucket: "vaccine-documents",
      mimeTypes: Object.freeze(["application/pdf", "image/jpeg", "image/png"]),
      extensions: Object.freeze(["pdf", "jpg", "jpeg", "png"]),
      maxSizeBytes: 10_000_000,
      retentionClasses: Object.freeze(["child_record"] as const),
    }),
    clinical_attachment: Object.freeze({
      bucket: "clinical-attachments",
      mimeTypes: Object.freeze(["application/pdf", "image/jpeg", "image/png"]),
      extensions: Object.freeze(["pdf", "jpg", "jpeg", "png"]),
      maxSizeBytes: 10_000_000,
      retentionClasses: Object.freeze(["child_record"] as const),
    }),
  }),
} as const satisfies DocumentUploadPolicy);

function reject(reason: UploadMetadataRejectReason): UploadMetadataDecision {
  return Object.freeze({ ok: false as const, status: "rejected" as const, reasons: Object.freeze([reason]) });
}

function safeNow(now: Date): Date | null {
  return now instanceof Date && Number.isFinite(now.getTime()) ? new Date(now.getTime()) : null;
}

function safeDisplayName(raw: string): string | null {
  const value = raw.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f/\\]/u.test(value) || value.includes("..")) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) return null;
  return value;
}

function extensionOf(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
}

function expectedExtensionMatches(mimeType: string, extension: string): boolean {
  if (mimeType === "application/pdf") return extension === "pdf";
  if (mimeType === "image/png") return extension === "png";
  if (mimeType === "image/jpeg") return extension === "jpg" || extension === "jpeg";
  return false;
}

export function evaluateUploadMetadata(
  rawInput: unknown,
  policy: DocumentUploadPolicy | null,
  now = new Date(),
): UploadMetadataDecision {
  const input = INPUT.safeParse(rawInput);
  if (!input.success) {
    if (typeof rawInput === "object" && rawInput !== null) {
      const value = rawInput as Record<string, unknown>;
      if (value.consent && typeof value.consent === "object" && (value.consent as Record<string, unknown>).granted === false) return reject("CONSENT_REQUIRED");
      if (typeof value.sizeBytes === "number" && (value.sizeBytes <= 0 || !Number.isInteger(value.sizeBytes))) return reject("INVALID_SIZE");
      if (!("checksum" in value)) return reject("CHECKSUM_REQUIRED");
    }
    return reject("INVALID_INPUT");
  }
  if (!policy) return reject("POLICY_UNAVAILABLE");
  if (policy.status !== "active") return reject("POLICY_REVOKED");
  const current = safeNow(now);
  const start = Date.parse(policy.effectiveFrom);
  const end = Date.parse(policy.effectiveUntil);
  if (!current || !Number.isFinite(start) || !Number.isFinite(end) || current.getTime() < start || current.getTime() >= end) {
    return reject("POLICY_OUTSIDE_EFFECTIVE_WINDOW");
  }
  const rule = policy.rules[input.data.purpose];
  if (!rule) return reject("PURPOSE_NOT_ALLOWED");
  const displayName = safeDisplayName(input.data.fileName);
  if (!displayName) return reject("SUSPICIOUS_FILE_NAME");
  const mimeType = input.data.declaredMimeType.toLowerCase();
  if (!rule.mimeTypes.includes(mimeType)) return reject("MIME_NOT_ALLOWED");
  const extension = extensionOf(displayName);
  if (!rule.extensions.includes(extension) || !expectedExtensionMatches(mimeType, extension)) return reject("MIME_EXTENSION_MISMATCH");
  if (input.data.sizeBytes <= 0 || input.data.sizeBytes > rule.maxSizeBytes) return reject("INVALID_SIZE");
  if (!rule.retentionClasses.includes(input.data.retentionClass)) return reject("RETENTION_NOT_ALLOWED");
  return Object.freeze({
    ok: true as const,
    status: "allowed" as const,
    metadata: Object.freeze({
      purpose: input.data.purpose,
      displayName,
      bucket: rule.bucket,
      mimeType,
      sizeBytes: input.data.sizeBytes,
      sha256: input.data.checksum.value,
      retentionClass: input.data.retentionClass,
      policyVersion: policy.version,
    }),
  });
}
