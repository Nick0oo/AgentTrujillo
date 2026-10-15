import { FatalError, RetryableError } from "workflow";

export type DocumentProcessingInput = Readonly<{
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  documentId: string;
  objectSha256: string;
  purpose: "avatar" | "vaccine_record" | "clinical_attachment" | "generated_report" | "clinical_source";
  processorVersion: string;
  schemaVersion: string;
  idempotencyKey: string;
}>;

export type PrivateObjectRef = Readonly<{
  documentId: string;
  objectSha256: string;
  objectVersion: string;
  sizeBytes: number;
}>;

export type ExtractionDraftRef = Readonly<{
  draftId: string;
  outputSha256: string;
  candidateCount: number;
  untrusted: true;
  confirmationRequired: true;
}>;

export type DocumentProcessingPorts = Readonly<{
  verifyObject(input: DocumentProcessingInput): Promise<PrivateObjectRef>;
  scanObject(input: DocumentProcessingInput, object: PrivateObjectRef): Promise<"clean" | "infected" | "unknown" | "failed">;
  extractDraft(input: DocumentProcessingInput, object: PrivateObjectRef): Promise<ExtractionDraftRef>;
  persistDraft(input: DocumentProcessingInput, object: PrivateObjectRef, draft: ExtractionDraftRef): Promise<"persisted" | "idempotent_replay">;
  finalize(input: DocumentProcessingInput, object: PrivateObjectRef, draft: ExtractionDraftRef): Promise<"finalized" | "idempotent_replay">;
  quarantine(input: DocumentProcessingInput, object: PrivateObjectRef, reason: "infected" | "unknown" | "failed" | "processing_error"): Promise<"quarantined" | "idempotent_replay">;
  cleanup(input: DocumentProcessingInput, object: PrivateObjectRef): Promise<void>;
}>;

let ports: DocumentProcessingPorts | null = null;

export function configureDocumentProcessingPorts(value: DocumentProcessingPorts | null): void {
  ports = value;
}

function runtime(): DocumentProcessingPorts {
  if (!ports) throw new FatalError("DOCUMENT_PROCESSING_RUNTIME_UNCONFIGURED");
  return ports;
}

function validInput(input: DocumentProcessingInput): boolean {
  return Object.values(input).every((value) => typeof value === "string" && value.length > 0 && value.length <= 512)
    && /^[a-f0-9]{64}$/u.test(input.objectSha256)
    && input.purpose !== undefined;
}

function validObject(input: DocumentProcessingInput, object: PrivateObjectRef): boolean {
  return object.documentId === input.documentId
    && object.objectSha256 === input.objectSha256
    && object.objectVersion.length > 0
    && Number.isInteger(object.sizeBytes)
    && object.sizeBytes > 0
    && object.sizeBytes <= 52_428_800;
}

export async function verifyObject(input: DocumentProcessingInput): Promise<PrivateObjectRef> {
  "use step";
  if (!validInput(input)) throw new FatalError("DOCUMENT_PROCESSING_INVALID_INPUT");
  let object: PrivateObjectRef;
  try { object = await runtime().verifyObject(input); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("DOCUMENT_PROCESSING_OBJECT_UNAVAILABLE", { retryAfter: "10s" });
  }
  if (!validObject(input, object)) throw new FatalError("DOCUMENT_PROCESSING_OBJECT_MISMATCH");
  return Object.freeze({ ...object });
}

export async function scanObject(input: DocumentProcessingInput, object: PrivateObjectRef): Promise<"clean" | "infected" | "unknown" | "failed"> {
  "use step";
  if (!validInput(input) || !validObject(input, object)) throw new FatalError("DOCUMENT_PROCESSING_SCAN_INVALID");
  try { return await runtime().scanObject(input, object); } catch {
    throw new RetryableError("DOCUMENT_PROCESSING_SCANNER_UNAVAILABLE", { retryAfter: "30s" });
  }
}

export async function extractDraft(input: DocumentProcessingInput, object: PrivateObjectRef): Promise<ExtractionDraftRef> {
  "use step";
  if (!validInput(input) || !validObject(input, object)) throw new FatalError("DOCUMENT_PROCESSING_EXTRACTION_INVALID");
  let draft: ExtractionDraftRef;
  try { draft = await runtime().extractDraft(input, object); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("DOCUMENT_PROCESSING_EXTRACTOR_UNAVAILABLE", { retryAfter: "30s" });
  }
  if (!draft.untrusted || !draft.confirmationRequired || !/^[a-f0-9]{64}$/u.test(draft.outputSha256)
    || draft.draftId.length === 0 || !Number.isInteger(draft.candidateCount) || draft.candidateCount < 0 || draft.candidateCount > 200) {
    throw new FatalError("DOCUMENT_PROCESSING_DRAFT_INVALID");
  }
  return Object.freeze({ ...draft, untrusted: true, confirmationRequired: true });
}

export async function persistDraft(input: DocumentProcessingInput, object: PrivateObjectRef, draft: ExtractionDraftRef): Promise<"persisted" | "idempotent_replay"> {
  "use step";
  if (!validInput(input) || !validObject(input, object) || !draft.untrusted || !draft.confirmationRequired) throw new FatalError("DOCUMENT_PROCESSING_PERSIST_INVALID");
  try { return await runtime().persistDraft(input, object, draft); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("DOCUMENT_PROCESSING_PERSIST_UNAVAILABLE", { retryAfter: "10s" });
  }
}

export async function finalize(input: DocumentProcessingInput, object: PrivateObjectRef, draft: ExtractionDraftRef): Promise<"finalized" | "idempotent_replay"> {
  "use step";
  if (!validInput(input) || !validObject(input, object) || !draft.untrusted || !draft.confirmationRequired) throw new FatalError("DOCUMENT_PROCESSING_FINALIZE_INVALID");
  try { return await runtime().finalize(input, object, draft); } catch (error) {
    if (error instanceof FatalError) throw error;
    throw new RetryableError("DOCUMENT_PROCESSING_FINALIZE_UNAVAILABLE", { retryAfter: "10s" });
  }
}

export async function quarantine(input: DocumentProcessingInput, object: PrivateObjectRef, reason: "infected" | "unknown" | "failed" | "processing_error"): Promise<"quarantined" | "idempotent_replay"> {
  "use step";
  if (!validInput(input) || !validObject(input, object)) throw new FatalError("DOCUMENT_PROCESSING_QUARANTINE_INVALID");
  try { return await runtime().quarantine(input, object, reason); } catch {
    throw new RetryableError("DOCUMENT_PROCESSING_QUARANTINE_UNAVAILABLE", { retryAfter: "30s" });
  }
}

export async function cleanup(input: DocumentProcessingInput, object: PrivateObjectRef): Promise<void> {
  "use step";
  if (!validInput(input) || !validObject(input, object)) throw new FatalError("DOCUMENT_PROCESSING_CLEANUP_INVALID");
  await runtime().cleanup(input, object);
}

export async function documentProcessingWorkflow(input: DocumentProcessingInput): Promise<Readonly<{ status: "finalized" | "quarantined" | "idempotent_replay" }>> {
  "use workflow";
  const object = await verifyObject(input);
  const scan = await scanObject(input, object);
  if (scan !== "clean") return Object.freeze({ status: await quarantine(input, object, scan) });
  try {
    const draft = await extractDraft(input, object);
    await persistDraft(input, object, draft);
    return Object.freeze({ status: await finalize(input, object, draft) });
  } catch (error) {
    await cleanup(input, object).catch(() => undefined);
    throw error;
  }
}
