import { z } from "zod";

import {
  downloadTicketSchema,
  extractionDraftSchema,
  uploadTicketSchema,
} from "../../../src/clinical/documents/types";

export const DOCUMENTS_VERSION = "creciendo.documents.v1" as const;

const UUID = z.string().uuid();
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const SAFE_TEXT = (max: number) => z.string().min(1).max(max).refine(
  (value) => value.trim().length > 0 && !/[\u0000-\u001f\u007f\p{Cf}\p{Cs}]/u.test(value),
  "unsafe_text",
);
const PURPOSE = z.enum(["avatar", "vaccine_record", "clinical_attachment", "generated_report", "clinical_source"]);
const RETENTION = z.enum(["ephemeral_upload", "child_record", "generated_artifact", "clinical_source"]);
const MIME = z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu).max(128);

export const UPLOAD_TICKET_REQUEST_SCHEMA = z.object({
  purpose: PURPOSE,
  fileName: SAFE_TEXT(256),
  declaredMimeType: MIME,
  sizeBytes: z.number().int().positive().max(52_428_800),
  checksum: z.object({ algorithm: z.literal("sha256"), value: DIGEST }).strict(),
  consent: z.object({ granted: z.literal(true), purpose: z.literal("document_upload") }).strict(),
  retentionClass: RETENTION,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u),
}).strict();

export const DOWNLOAD_TICKET_REQUEST_SCHEMA = z.object({
  documentId: UUID,
  purpose: PURPOSE,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u),
}).strict();

export const DOCUMENT_LIST_ITEM_SCHEMA = z.object({
  id: UUID,
  purpose: PURPOSE,
  displayName: SAFE_TEXT(256),
  declaredMimeType: MIME,
  detectedMimeType: MIME.nullable(),
  sizeBytes: z.number().int().positive().max(52_428_800),
  sha256: DIGEST,
  lifecycle: z.enum(["reserved", "uploaded", "processing", "active", "quarantined", "failed", "deleted"]),
  scanState: z.enum(["pending", "clean", "infected", "unknown", "failed"]),
  createdAt: INSTANT,
  updatedAt: INSTANT,
  deletedAt: INSTANT.nullable(),
}).strict();

export const DOCUMENT_LIST_RESPONSE_SCHEMA = z.object({
  version: z.literal(DOCUMENTS_VERSION),
  requestId: SAFE_TEXT(128),
  documents: z.array(DOCUMENT_LIST_ITEM_SCHEMA).max(100),
  nextCursor: z.string().min(1).max(512).nullable(),
}).strict();

export const OCR_DRAFT_RESPONSE_SCHEMA = z.object({
  version: z.literal(DOCUMENTS_VERSION),
  requestId: SAFE_TEXT(128),
  documentId: UUID,
  draft: extractionDraftSchema.nullable(),
}).strict();

export const UPLOAD_TICKET_RESPONSE_SCHEMA = z.object({
  version: z.literal(DOCUMENTS_VERSION),
  requestId: SAFE_TEXT(128),
  ok: z.literal(true),
  status: z.literal("issued"),
  ticket: uploadTicketSchema,
}).strict();

export const DOWNLOAD_TICKET_RESPONSE_SCHEMA = z.object({
  version: z.literal(DOCUMENTS_VERSION),
  requestId: SAFE_TEXT(128),
  ok: z.literal(true),
  status: z.literal("issued"),
  ticket: downloadTicketSchema,
}).strict();

export const DOCUMENT_UPLOAD_RESPONSE_SCHEMA = z.object({
  version: z.literal(DOCUMENTS_VERSION),
  requestId: SAFE_TEXT(128),
  ok: z.literal(true),
  status: z.literal("uploaded"),
  documentId: UUID,
}).strict();

export type DocumentListItem = z.infer<typeof DOCUMENT_LIST_ITEM_SCHEMA>;
export type UploadTicketRequest = z.infer<typeof UPLOAD_TICKET_REQUEST_SCHEMA>;
export type DownloadTicketRequest = z.infer<typeof DOWNLOAD_TICKET_REQUEST_SCHEMA>;
export type DocumentListResponse = z.infer<typeof DOCUMENT_LIST_RESPONSE_SCHEMA>;
export type UploadTicketResponse = z.infer<typeof UPLOAD_TICKET_RESPONSE_SCHEMA>;
export type DownloadTicketResponse = z.infer<typeof DOWNLOAD_TICKET_RESPONSE_SCHEMA>;
