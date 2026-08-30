import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  handleDocumentList,
  handleDocumentUpload,
  handleDownloadTicket,
  handleOcrDraft,
  handleUploadTicket,
  type DocumentRouteDependencies,
} from "../../../../src/channels/creciendo/routes/documents";

const CHILD = "00000000-0000-4000-8000-000000000011";
const DOCUMENT = "00000000-0000-4000-8000-000000000012";
const auth = {
  requestId: "documents-test",
  guardian: { userId: "00000000-0000-4000-8000-000000000001" },
} as any;

function dependencies(overrides: Partial<DocumentRouteDependencies> = {}): DocumentRouteDependencies {
  return {
    scope: {
      resolve: vi.fn(async () => ({
        actorUserId: auth.guardian.userId,
        careSpaceId: "00000000-0000-4000-8000-000000000010",
        childId: CHILD,
        permissions: ["read", "manage_documents"],
      })) as any,
    },
    documents: {
      list: vi.fn(async () => ({ documents: [], nextCursor: null })),
      uploadTicket: vi.fn(async () => ({ ok: true, status: "issued", ticket: {
        kind: "upload", id: "00000000-0000-4000-8000-000000000013", documentId: DOCUMENT,
        audience: "guardian", uploadUrl: "https://agent.test/creciendo/v1/documents/upload?ticket=x",
        requiredHeaders: { "content-type": "application/pdf", "x-upsert": "false", "x-content-sha256": "a".repeat(64) },
        sizeBytes: 1024, mimeType: "application/pdf", sha256: "a".repeat(64),
        issuedAt: "2026-08-30T12:00:00.000Z", expiresAt: "2026-08-30T12:05:00.000Z", nonceSha256: "b".repeat(64),
      } })),
      downloadTicket: vi.fn(async () => ({ ok: false, status: "unavailable", code: "DOCUMENT_UNAVAILABLE" })),
      ocrDraft: vi.fn(async () => null),
      upload: vi.fn(async () => ({ ok: false, status: "unavailable", code: "TICKET_EXPIRED" })),
    },
    ...overrides,
  } as DocumentRouteDependencies;
}

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://agent.test${path}`, init);
}

describe("creciendo.documents.v1 routes", () => {
  it("lists only the authorized active child and never asks the resolver for a child id", async () => {
    const deps = dependencies();
    const response = await handleDocumentList(request("/creciendo/v1/documents", {
      headers: { "x-child-context": "opaque-context" },
    }), auth, deps);
    expect(response.status).toBe(200);
    expect((await response.json()).version).toBe("creciendo.documents.v1");
    expect(deps.documents.list).toHaveBeenCalledOnce();
    expect(deps.documents.list).toHaveBeenCalledWith(expect.objectContaining({ childId: CHILD }), null);
  });

  it("fails closed without child context and does not touch persistence", async () => {
    const deps = dependencies();
    const response = await handleDocumentList(request("/creciendo/v1/documents"), auth, deps);
    expect(response.status).toBe(403);
    expect(deps.documents.list).not.toHaveBeenCalled();
  });

  it("requires matching header/body idempotency and issues a short-lived ticket", async () => {
    const deps = dependencies();
    const body = {
      purpose: "vaccine_record", fileName: "carnet.pdf", declaredMimeType: "application/pdf", sizeBytes: 1024,
      checksum: { algorithm: "sha256", value: "a".repeat(64) }, consent: { granted: true, purpose: "document_upload" },
      retentionClass: "child_record", idempotencyKey: "upload-1",
    };
    const response = await handleUploadTicket(request("/creciendo/v1/documents/upload-ticket", {
      method: "POST", headers: { "content-type": "application/json", "x-child-context": "opaque-context", "idempotency-key": "upload-1" }, body: JSON.stringify(body),
    }), auth, deps);
    expect(response.status).toBe(200);
    expect((await response.json()).ticket.expiresAt).toBe("2026-08-30T12:05:00.000Z");
    expect(deps.documents.uploadTicket).toHaveBeenCalledWith(expect.objectContaining({ childId: CHILD }), body);

    const mismatch = await handleUploadTicket(request("/creciendo/v1/documents/upload-ticket", {
      method: "POST", headers: { "content-type": "application/json", "x-child-context": "opaque-context", "idempotency-key": "other" }, body: JSON.stringify(body),
    }), auth, deps);
    expect(mismatch.status).toBe(400);
    expect(deps.documents.uploadTicket).toHaveBeenCalledOnce();
  });

  it("keeps download and OCR bound to the authorized document", async () => {
    const deps = dependencies({
      documents: {
        ...dependencies().documents,
        downloadTicket: vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, code: "DOCUMENT_UNAVAILABLE" })),
        ocrDraft: vi.fn(async () => null),
      },
    });
    const download = await handleDownloadTicket(request("/creciendo/v1/documents/download-ticket", {
      method: "POST", headers: { "content-type": "application/json", "x-child-context": "opaque-context" }, body: JSON.stringify({ documentId: DOCUMENT, purpose: "vaccine_record", idempotencyKey: "download-1" }),
    }), auth, deps);
    expect(download.status).toBe(404);
    expect(deps.documents.downloadTicket).toHaveBeenCalledWith(expect.objectContaining({ childId: CHILD }), { documentId: DOCUMENT, purpose: "vaccine_record", idempotencyKey: "download-1" });

    const ocr = await handleOcrDraft(request(`/creciendo/v1/documents/${DOCUMENT}/ocr-draft`, {
      headers: { "x-child-context": "opaque-context" },
    }), auth, deps);
    expect(ocr.status).toBe(200);
    expect((await ocr.json()).draft).toBeNull();
    expect(deps.documents.ocrDraft).toHaveBeenCalledWith(expect.objectContaining({ childId: CHILD }), DOCUMENT);
  });

  it("validates the bounded binary upload before invoking persistence", async () => {
    const body = new TextEncoder().encode("document fixture");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const deps = dependencies({
      documents: {
        ...dependencies().documents,
        upload: vi.fn(async () => ({ ok: true as const, documentId: DOCUMENT })),
      },
    });
    const response = await handleDocumentUpload(request("/creciendo/v1/documents/upload", {
      method: "PUT",
      headers: {
        "content-type": "application/pdf",
        "content-length": String(body.byteLength),
        "x-content-sha256": sha256,
        "x-document-transfer-token": "opaque-transfer-token",
        "x-child-context": "opaque-context",
      },
      body,
    }), auth, deps);

    expect(response.status).toBe(200);
    expect((await response.json()).documentId).toBe(DOCUMENT);
    expect(deps.documents.upload).toHaveBeenCalledWith(expect.objectContaining({ childId: CHILD }), {
      ticketId: "opaque-transfer-token",
      body,
      contentType: "application/pdf",
      contentLength: body.byteLength,
      sha256,
    });

    const missingToken = await handleDocumentUpload(request("/creciendo/v1/documents/upload", {
      method: "PUT",
      headers: {
        "content-type": "application/pdf",
        "content-length": String(body.byteLength),
        "x-content-sha256": sha256,
        "x-child-context": "opaque-context",
      },
      body,
    }), auth, deps);
    expect(missingToken.status).toBe(400);
    expect(deps.documents.upload).toHaveBeenCalledOnce();

    const tooLarge = await handleDocumentUpload(request("/creciendo/v1/documents/upload", {
      method: "PUT",
      headers: {
        "content-type": "application/pdf",
        "content-length": "52428801",
        "x-content-sha256": "a".repeat(64),
        "x-document-transfer-token": "opaque-transfer-token",
        "x-child-context": "opaque-context",
      },
    }), auth, deps);
    expect(tooLarge.status).toBe(413);
  });
});
