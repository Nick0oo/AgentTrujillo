import { describe, expect, it } from "vitest";

import {
  documentLinkSchema,
  extractionDraftSchema,
  privateDocumentSchema,
  processingCallbackSchema,
  ticketSchemas,
  validDocumentTransition,
} from "../../../src/clinical/documents/types.ts";

const IDs = {
  careSpace: "00000000-0000-4000-8000-000000000001",
  child: "00000000-0000-4000-8000-000000000002",
  document: "00000000-0000-4000-8000-000000000003",
  ticket: "00000000-0000-4000-8000-000000000004",
  event: "00000000-0000-4000-8000-000000000005",
  resource: "00000000-0000-4000-8000-000000000006",
};
const DIGEST = "a".repeat(64);
const NOW = "2026-08-23T12:00:00.000Z";

const document = {
  id: IDs.document,
  careSpaceId: IDs.careSpace,
  childId: IDs.child,
  purpose: "vaccine_record" as const,
  bucket: "vaccine-documents" as const,
  objectPath: `${IDs.careSpace}/${IDs.child}/${IDs.document}/v1`,
  displayName: "carnet.pdf",
  declaredMimeType: "application/pdf",
  detectedMimeType: "application/pdf",
  sizeBytes: 1024,
  sha256: DIGEST,
  retentionClass: "child_record" as const,
  retentionUntil: "2036-08-23",
  lifecycle: "active" as const,
  scanState: "clean" as const,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
};

describe("private-document contracts", () => {
  it("requires immutable composite scope, private object identity, retention, and clean active state", () => {
    expect(privateDocumentSchema.parse(document)).toEqual(document);
    expect(privateDocumentSchema.safeParse({ ...document, childId: undefined }).success).toBe(false);
    expect(privateDocumentSchema.safeParse({ ...document, bucket: "public" }).success).toBe(false);
    expect(privateDocumentSchema.safeParse({ ...document, objectPath: "../carnet.pdf" }).success).toBe(false);
    expect(privateDocumentSchema.safeParse({ ...document, publicUrl: "https://example.invalid/file" }).success).toBe(false);
    expect(privateDocumentSchema.safeParse({ ...document, lifecycle: "active", scanState: "pending" }).success).toBe(false);
  });

  it("allows only monotonic lifecycle transitions", () => {
    expect(validDocumentTransition("reserved", "uploaded")).toBe(true);
    expect(validDocumentTransition("uploaded", "processing")).toBe(true);
    expect(validDocumentTransition("processing", "active")).toBe(true);
    expect(validDocumentTransition("active", "deleted")).toBe(true);
    expect(validDocumentTransition("active", "reserved")).toBe(false);
    expect(validDocumentTransition("deleted", "active")).toBe(false);
  });

  it("bounds upload and download tickets to one object and five minutes", () => {
    const common = {
      id: IDs.ticket,
      documentId: IDs.document,
      audience: "guardian" as const,
      issuedAt: NOW,
      expiresAt: "2026-08-23T12:05:00.000Z",
      nonceSha256: DIGEST,
    };
    const upload = {
      ...common,
      kind: "upload" as const,
      uploadUrl: "https://example.supabase.co/storage/v1/upload/sign/x",
      requiredHeaders: { "content-type": "application/pdf", "x-upsert": "false" },
      sizeBytes: 1024,
      mimeType: "application/pdf",
      sha256: DIGEST,
    };
    const download = {
      ...common,
      kind: "download" as const,
      downloadUrl: "https://example.supabase.co/storage/v1/object/sign/x",
      displayName: "carnet.pdf",
      contentDisposition: "attachment" as const,
      auditId: IDs.event,
    };
    expect(ticketSchemas.upload.parse(upload)).toEqual(upload);
    expect(ticketSchemas.upload.parse({ ...upload, uploadUrl: "http://10.0.2.2:2001/creciendo/v1/documents/upload" }).uploadUrl).toBe("http://10.0.2.2:2001/creciendo/v1/documents/upload");
    expect(ticketSchemas.upload.safeParse({ ...upload, uploadUrl: "http://remote.example.invalid/upload" }).success).toBe(false);
    expect(ticketSchemas.download.parse(download)).toEqual(download);
    expect(ticketSchemas.upload.safeParse({ ...upload, expiresAt: "2026-08-23T12:05:01.000Z" }).success).toBe(false);
    expect(ticketSchemas.upload.safeParse({ ...upload, serviceRoleKey: "secret" }).success).toBe(false);
    expect(ticketSchemas.download.safeParse({ ...download, bucket: "vaccine-documents" }).success).toBe(false);
  });

  it("keeps callbacks digest-bound and extraction candidates explicitly untrusted", () => {
    const callback = {
      id: IDs.event,
      provider: "supabase-storage",
      providerEventId: "event-123",
      documentId: IDs.document,
      careSpaceId: IDs.careSpace,
      childId: IDs.child,
      eventType: "scan_completed" as const,
      occurredAt: NOW,
      receivedAt: NOW,
      rawBodySha256: DIGEST,
      signatureKeyId: "storage-callback-v1",
      status: "verified" as const,
    };
    const draft = {
      id: IDs.event,
      documentId: IDs.document,
      documentSha256: DIGEST,
      processor: "document-ai",
      processorVersion: "v1",
      schemaVersion: "document-extraction.v1",
      outputSha256: DIGEST,
      status: "draft" as const,
      candidates: [{
        field: "vaccine_name" as const,
        value: "Synthetic vaccine name",
        source: { page: 1, start: 0, end: 22 },
        confidence: 0.88,
        trust: "untrusted" as const,
        confirmationRequired: true as const,
      }],
      warnings: ["processor_output_is_untrusted"],
      createdAt: NOW,
      expiresAt: "2026-08-30T12:00:00.000Z",
    };
    expect(processingCallbackSchema.parse(callback)).toEqual(callback);
    expect(extractionDraftSchema.parse(draft)).toEqual(draft);
    expect(extractionDraftSchema.safeParse({ ...draft, status: "confirmed" }).success).toBe(false);
    expect(extractionDraftSchema.safeParse({ ...draft, candidates: [{ ...draft.candidates[0], confirmationRequired: false }] }).success).toBe(false);
    expect(extractionDraftSchema.safeParse({ ...draft, diagnosis: "anything" }).success).toBe(false);
  });

  it("links only an opaque document and resource with a confirmation digest", () => {
    const link = {
      documentId: IDs.document,
      resourceType: "vaccine_administration" as const,
      resourceId: IDs.resource,
      purpose: "vaccine_record" as const,
      confirmationSha256: DIGEST,
      linkedAt: NOW,
      lifecycle: "active" as const,
    };
    expect(documentLinkSchema.parse(link)).toEqual(link);
    expect(documentLinkSchema.safeParse({ ...link, objectPath: "private/path" }).success).toBe(false);
  });
});
