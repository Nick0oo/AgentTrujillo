import { describe, expect, it } from "vitest";

import {
  DOCUMENTS_VERSION,
  DOCUMENT_LIST_RESPONSE_SCHEMA,
  OCR_DRAFT_RESPONSE_SCHEMA,
  UPLOAD_TICKET_REQUEST_SCHEMA,
} from "../../../src/channels/creciendo/document-contract";

const UUID = "00000000-0000-4000-8000-000000000011";
const SHA = "a".repeat(64);

describe("creciendo.documents.v1 schemas", () => {
  it("accepts the bounded upload request and rejects authority fields", () => {
    const request = UPLOAD_TICKET_REQUEST_SCHEMA.parse({
      purpose: "vaccine_record",
      fileName: "carnet.pdf",
      declaredMimeType: "application/pdf",
      sizeBytes: 1024,
      checksum: { algorithm: "sha256", value: SHA },
      consent: { granted: true, purpose: "document_upload" },
      retentionClass: "child_record",
      idempotencyKey: "upload-1",
    });
    expect(request.idempotencyKey).toBe("upload-1");
    expect(() => UPLOAD_TICKET_REQUEST_SCHEMA.parse({ ...request, childId: UUID })).toThrow();
  });

  it("keeps list responses strict and versioned", () => {
    expect(DOCUMENT_LIST_RESPONSE_SCHEMA.parse({
      version: DOCUMENTS_VERSION,
      requestId: "request-1",
      documents: [],
      nextCursor: null,
    })).toEqual({ version: DOCUMENTS_VERSION, requestId: "request-1", documents: [], nextCursor: null });
    expect(() => DOCUMENT_LIST_RESPONSE_SCHEMA.parse({
      version: DOCUMENTS_VERSION,
      requestId: "request-1",
      documents: [],
      nextCursor: null,
      careSpaceId: UUID,
    })).toThrow();
  });

  it("only permits draft OCR data and explicit confirmation markers", () => {
    const response = OCR_DRAFT_RESPONSE_SCHEMA.parse({
      version: DOCUMENTS_VERSION,
      requestId: "request-1",
      documentId: UUID,
      draft: null,
    });
    expect(response.draft).toBeNull();
    expect(() => OCR_DRAFT_RESPONSE_SCHEMA.parse({
      version: DOCUMENTS_VERSION,
      requestId: "request-1",
      documentId: UUID,
      draft: { status: "confirmed", clinicalFact: "unsafe" },
    })).toThrow();
  });
});
