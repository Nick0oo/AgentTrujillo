import { z } from "zod";

import type { CareSpaceId, ChildId } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Sha256Hex } from "../governance/source-types.ts";

declare const documentIdBrand: unique symbol;
declare const documentTicketIdBrand: unique symbol;

export type DocumentId = string & { readonly [documentIdBrand]: true };
export type DocumentTicketId = string & { readonly [documentTicketIdBrand]: true };
export type DocumentPurpose = "avatar" | "vaccine_record" | "clinical_attachment" | "generated_report" | "clinical_source";
export type PrivateDocumentBucket = "avatars" | "vaccine-documents" | "clinical-attachments" | "generated-reports" | "clinical-sources";
export type DocumentRetentionClass = "ephemeral_upload" | "child_record" | "generated_artifact" | "clinical_source";
export type DocumentLifecycle = "reserved" | "uploaded" | "processing" | "active" | "quarantined" | "failed" | "deleted";
export type ScanState = "pending" | "clean" | "infected" | "unknown" | "failed";

export type PrivateDocument = Readonly<{
  id: DocumentId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  purpose: DocumentPurpose;
  bucket: PrivateDocumentBucket;
  objectPath: string;
  displayName: string;
  declaredMimeType: string;
  detectedMimeType: string | null;
  sizeBytes: number;
  sha256: Sha256Hex;
  retentionClass: DocumentRetentionClass;
  retentionUntil: string;
  lifecycle: DocumentLifecycle;
  scanState: ScanState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export type UploadTicket = Readonly<{
  kind: "upload";
  id: DocumentTicketId;
  documentId: DocumentId;
  audience: "guardian";
  uploadUrl: string;
  requiredHeaders: Readonly<Record<string, string>>;
  sizeBytes: number;
  mimeType: string;
  sha256: Sha256Hex;
  issuedAt: string;
  expiresAt: string;
  nonceSha256: Sha256Hex;
}>;

export type DownloadTicket = Readonly<{
  kind: "download";
  id: DocumentTicketId;
  documentId: DocumentId;
  audience: "guardian";
  downloadUrl: string;
  displayName: string;
  contentDisposition: "attachment";
  auditId: string;
  issuedAt: string;
  expiresAt: string;
  nonceSha256: Sha256Hex;
}>;

export type ProcessingCallback = Readonly<{
  id: string;
  provider: string;
  providerEventId: string;
  documentId: DocumentId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  eventType: "upload_completed" | "scan_completed" | "extraction_completed" | "processing_failed";
  occurredAt: string;
  receivedAt: string;
  rawBodySha256: Sha256Hex;
  signatureKeyId: string;
  status: "received" | "verified" | "processed" | "rejected";
}>;

export type ExtractionDraft = Readonly<{
  id: string;
  documentId: DocumentId;
  documentSha256: Sha256Hex;
  processor: string;
  processorVersion: string;
  schemaVersion: string;
  outputSha256: Sha256Hex;
  status: "draft";
  candidates: readonly Readonly<{
    field: "vaccine_name" | "vaccine_date" | "measurement" | "medication_declaration" | "development_observation" | "note";
    value: string;
    source: Readonly<{ page: number; start: number; end: number }>;
    confidence: number;
    trust: "untrusted";
    confirmationRequired: true;
  }>[];
  warnings: readonly string[];
  createdAt: string;
  expiresAt: string;
}>;

export type DocumentLink = Readonly<{
  documentId: DocumentId;
  resourceType: "vaccine_administration" | "development_observation" | "clinical_memory" | "growth_measurement" | "medication_plan" | "generated_report";
  resourceId: string;
  purpose: DocumentPurpose;
  confirmationSha256: Sha256Hex;
  linkedAt: string;
  lifecycle: "active" | "unlinked";
}>;

export type DocumentSafeErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "POLICY_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "TICKET_EXPIRED"
  | "DOCUMENT_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE";

export type DocumentSafeError = Readonly<{ ok: false; status: "unavailable"; code: DocumentSafeErrorCode }>;

const UUID = z.string().uuid();
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const TEXT = (max: number) => z.string().min(1).max(max).refine((value) => value.trim().length > 0, "non_empty");
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "10.0.2.2"]);
const UPLOAD_URL = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_DEVELOPMENT_HOSTS.has(url.hostname));
}, "https_or_local_development_only");
const PRIVATE_DOWNLOAD_URL = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_DEVELOPMENT_HOSTS.has(url.hostname));
}, "https_or_local_development_only");
const MIME = z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu).max(128);
const PURPOSE = z.enum(["avatar", "vaccine_record", "clinical_attachment", "generated_report", "clinical_source"]);
const BUCKET = z.enum(["avatars", "vaccine-documents", "clinical-attachments", "generated-reports", "clinical-sources"]);
const LIFECYCLE = z.enum(["reserved", "uploaded", "processing", "active", "quarantined", "failed", "deleted"]);
const SCAN = z.enum(["pending", "clean", "infected", "unknown", "failed"]);

export const documentPurposeSchema = PURPOSE;
export const privateDocumentBucketSchema = BUCKET;
export const scanStateSchema = SCAN;

export const privateDocumentSchema = z.object({
  id: UUID,
  careSpaceId: UUID,
  childId: UUID,
  purpose: PURPOSE,
  bucket: BUCKET,
  objectPath: TEXT(512).refine((value) => !value.startsWith("/") && !/(^|\/)\.\.?($|\/)/u.test(value), "opaque_path"),
  displayName: TEXT(256),
  declaredMimeType: MIME,
  detectedMimeType: MIME.nullable(),
  sizeBytes: z.number().int().positive().max(52_428_800),
  sha256: DIGEST,
  retentionClass: z.enum(["ephemeral_upload", "child_record", "generated_artifact", "clinical_source"]),
  retentionUntil: DATE,
  lifecycle: LIFECYCLE,
  scanState: SCAN,
  createdAt: INSTANT,
  updatedAt: INSTANT,
  deletedAt: INSTANT.nullable(),
}).strict().superRefine((value, context) => {
  if (value.lifecycle === "active" && value.scanState !== "clean") {
    context.addIssue({ code: "custom", path: ["scanState"], message: "active_requires_clean_scan" });
  }
  if (value.lifecycle === "deleted" && value.deletedAt === null) {
    context.addIssue({ code: "custom", path: ["deletedAt"], message: "deleted_timestamp_required" });
  }
  if (value.lifecycle !== "deleted" && value.deletedAt !== null) {
    context.addIssue({ code: "custom", path: ["deletedAt"], message: "unexpected_deleted_timestamp" });
  }
});

const TICKET_BASE = z.object({
  id: UUID,
  documentId: UUID,
  audience: z.literal("guardian"),
  issuedAt: INSTANT,
  expiresAt: INSTANT,
  nonceSha256: DIGEST,
}).strict();

function boundedTicket(value: { issuedAt: string; expiresAt: string }, context: z.RefinementCtx): void {
  const ttl = Date.parse(value.expiresAt) - Date.parse(value.issuedAt);
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 300_000) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "ticket_ttl" });
  }
}

export const uploadTicketSchema = TICKET_BASE.extend({
  kind: z.literal("upload"),
  uploadUrl: UPLOAD_URL,
  requiredHeaders: z.record(z.string().min(1).max(128), z.string().max(512)).refine((headers) => headers["x-upsert"] === "false", "upsert_forbidden"),
  sizeBytes: z.number().int().positive().max(52_428_800),
  mimeType: MIME,
  sha256: DIGEST,
}).strict().superRefine(boundedTicket);

export const downloadTicketSchema = TICKET_BASE.extend({
  kind: z.literal("download"),
  downloadUrl: PRIVATE_DOWNLOAD_URL,
  displayName: TEXT(256),
  contentDisposition: z.literal("attachment"),
  auditId: UUID,
}).strict().superRefine(boundedTicket);

export const ticketSchemas = Object.freeze({ upload: uploadTicketSchema, download: downloadTicketSchema });

export const processingCallbackSchema = z.object({
  id: UUID,
  provider: TEXT(128),
  providerEventId: TEXT(256),
  documentId: UUID,
  careSpaceId: UUID,
  childId: UUID,
  eventType: z.enum(["upload_completed", "scan_completed", "extraction_completed", "processing_failed"]),
  occurredAt: INSTANT,
  receivedAt: INSTANT,
  rawBodySha256: DIGEST,
  signatureKeyId: TEXT(128),
  status: z.enum(["received", "verified", "processed", "rejected"]),
}).strict().refine((value) => Date.parse(value.receivedAt) >= Date.parse(value.occurredAt), {
  path: ["occurredAt"], message: "callback_order",
});

const SOURCE_SPAN = z.object({
  page: z.number().int().positive().max(10_000),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
}).strict().refine((value) => value.end > value.start, { path: ["end"], message: "source_span" });

export const extractionDraftSchema = z.object({
  id: UUID,
  documentId: UUID,
  documentSha256: DIGEST,
  processor: TEXT(128),
  processorVersion: TEXT(128),
  schemaVersion: TEXT(128),
  outputSha256: DIGEST,
  status: z.literal("draft"),
  candidates: z.array(z.object({
    field: z.enum(["vaccine_name", "vaccine_date", "measurement", "medication_declaration", "development_observation", "note"]),
    value: TEXT(2_000),
    source: SOURCE_SPAN,
    confidence: z.number().finite().min(0).max(1),
    trust: z.literal("untrusted"),
    confirmationRequired: z.literal(true),
  }).strict()).max(200).readonly(),
  warnings: z.array(TEXT(256)).max(100).readonly(),
  createdAt: INSTANT,
  expiresAt: INSTANT,
}).strict().refine((value) => Date.parse(value.expiresAt) > Date.parse(value.createdAt), {
  path: ["expiresAt"], message: "draft_expiry",
});

export const documentLinkSchema = z.object({
  documentId: UUID,
  resourceType: z.enum(["vaccine_administration", "development_observation", "clinical_memory", "growth_measurement", "medication_plan", "generated_report"]),
  resourceId: UUID,
  purpose: PURPOSE,
  confirmationSha256: DIGEST,
  linkedAt: INSTANT,
  lifecycle: z.enum(["active", "unlinked"]),
}).strict();

const TRANSITIONS = {
  reserved: ["uploaded", "failed", "deleted"],
  uploaded: ["processing", "quarantined", "failed", "deleted"],
  processing: ["active", "quarantined", "failed", "deleted"],
  active: ["quarantined", "deleted"],
  quarantined: ["deleted"],
  failed: ["deleted"],
  deleted: [],
} as const satisfies Readonly<Record<DocumentLifecycle, readonly DocumentLifecycle[]>>;

export function validDocumentTransition(from: DocumentLifecycle, to: DocumentLifecycle): boolean {
  return (TRANSITIONS[from] as readonly DocumentLifecycle[]).includes(to);
}
