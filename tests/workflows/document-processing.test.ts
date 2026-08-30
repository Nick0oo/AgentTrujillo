import { afterEach, describe, expect, it, vi } from "vitest";
import { FatalError, RetryableError } from "workflow";
import { configureDocumentProcessingPorts, documentProcessingWorkflow, extractDraft, type DocumentProcessingInput, type DocumentProcessingPorts, type PrivateObjectRef } from "../../src/workflows/document-processing";

const INPUT: DocumentProcessingInput = Object.freeze({ ownerUserId: "owner-1", careSpaceId: "space-1", childId: "child-1", documentId: "doc-1", objectSha256: "a".repeat(64), purpose: "vaccine_record", processorVersion: "v1", schemaVersion: "document-extraction.v1", idempotencyKey: "job-1" });
const OBJECT: PrivateObjectRef = Object.freeze({ documentId: "doc-1", objectSha256: INPUT.objectSha256, objectVersion: "version-1", sizeBytes: 1_024 });
const DRAFT = Object.freeze({ draftId: "draft-1", outputSha256: "b".repeat(64), candidateCount: 1, untrusted: true as const, confirmationRequired: true as const });
function makePorts(overrides: Partial<DocumentProcessingPorts> = {}): DocumentProcessingPorts { return { verifyObject: vi.fn().mockResolvedValue(OBJECT), scanObject: vi.fn().mockResolvedValue("clean"), extractDraft: vi.fn().mockResolvedValue(DRAFT), persistDraft: vi.fn().mockResolvedValue("persisted"), finalize: vi.fn().mockResolvedValue("finalized"), quarantine: vi.fn().mockResolvedValue("quarantined"), cleanup: vi.fn().mockResolvedValue(undefined), ...overrides }; }
afterEach(() => configureDocumentProcessingPorts(null));

describe("document processing workflow", () => {
  it("verifies, scans, persists only an untrusted draft, and finalizes", async () => { const ports = makePorts(); configureDocumentProcessingPorts(ports); await expect(documentProcessingWorkflow(INPUT)).resolves.toEqual({ status: "finalized" }); expect(ports.persistDraft).toHaveBeenCalledWith(INPUT, OBJECT, DRAFT); expect(ports.finalize).toHaveBeenCalled(); });
  it("quarantines non-clean uploads without extraction", async () => { const ports = makePorts({ scanObject: vi.fn().mockResolvedValue("infected") }); configureDocumentProcessingPorts(ports); await expect(documentProcessingWorkflow(INPUT)).resolves.toEqual({ status: "quarantined" }); expect(ports.extractDraft).not.toHaveBeenCalled(); expect(ports.quarantine).toHaveBeenCalledWith(INPUT, OBJECT, "infected"); });
  it("rejects replacement or hash mismatch before provider effects", async () => { const ports = makePorts({ verifyObject: vi.fn().mockResolvedValue({ ...OBJECT, objectSha256: "c".repeat(64) }) }); configureDocumentProcessingPorts(ports); await expect(documentProcessingWorkflow(INPUT)).rejects.toBeInstanceOf(FatalError); expect(ports.scanObject).not.toHaveBeenCalled(); });
  it("rejects a draft that could be treated as confirmed", async () => { const ports = makePorts({ extractDraft: vi.fn().mockResolvedValue({ ...DRAFT, untrusted: false }) }); configureDocumentProcessingPorts(ports); await expect(extractDraft(INPUT, OBJECT)).rejects.toBeInstanceOf(FatalError); expect(ports.persistDraft).not.toHaveBeenCalled(); });
  it("classifies scanner outage as retryable", async () => { const ports = makePorts({ scanObject: vi.fn().mockRejectedValue(new Error("offline")) }); configureDocumentProcessingPorts(ports); await expect(documentProcessingWorkflow(INPUT)).rejects.toBeInstanceOf(RetryableError); expect(ports.extractDraft).not.toHaveBeenCalled(); });
});
