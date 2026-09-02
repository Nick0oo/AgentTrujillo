// biome-ignore-all lint: generated file
/* eslint-disable */

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../node_modules/workflow/dist/internal/builtins.js
import { registerStepFunction } from "workflow/internal/private";
async function __builtin_response_array_buffer() {
  return this.arrayBuffer();
}
__name(__builtin_response_array_buffer, "__builtin_response_array_buffer");
async function __builtin_response_json() {
  return this.json();
}
__name(__builtin_response_json, "__builtin_response_json");
async function __builtin_response_text() {
  return this.text();
}
__name(__builtin_response_text, "__builtin_response_text");
registerStepFunction("__builtin_response_array_buffer", __builtin_response_array_buffer);
registerStepFunction("__builtin_response_json", __builtin_response_json);
registerStepFunction("__builtin_response_text", __builtin_response_text);

// ../../node_modules/workflow/dist/stdlib.js
import { registerStepFunction as registerStepFunction2 } from "workflow/internal/private";
async function fetch(...args) {
  return globalThis.fetch(...args);
}
__name(fetch, "fetch");
registerStepFunction2("step//workflow@4.8.5//fetch", fetch);

// conversation-summary.ts
import { registerStepFunction as registerStepFunction3 } from "workflow/internal/private";
import { FatalError, RetryableError } from "workflow";
import { z } from "zod";
var UUID = z.string().uuid();
var DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
var INSTANT = z.string().datetime({
  offset: true
});
var SAFE_VERSION = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u);
var INPUT = z.object({
  ownerUserId: UUID,
  careSpaceId: UUID,
  childId: UUID,
  sessionId: UUID,
  sourceSessionId: UUID,
  sourceDigest: DIGEST,
  cutoffAt: INSTANT,
  promptVersion: SAFE_VERSION,
  schemaVersion: SAFE_VERSION,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
}).strict();
var ports = null;
var PORTS_KEY = /* @__PURE__ */ Symbol.for("agent-trujillo.workflow.conversation-summary.ports");
function parseInput(value) {
  const parsed = INPUT.safeParse(value);
  if (!parsed.success) throw new FatalError("SUMMARY_INVALID_INPUT");
  return Object.freeze(parsed.data);
}
__name(parseInput, "parseInput");
function requirePorts() {
  const configured = ports ?? globalThis[PORTS_KEY];
  if (!configured) throw new FatalError("SUMMARY_RUNTIME_UNCONFIGURED");
  return configured;
}
__name(requirePorts, "requirePorts");
function validateMessage(message, input) {
  return UUID.safeParse(message.id).success && message.ownerUserId === input.ownerUserId && message.careSpaceId === input.careSpaceId && message.childId === input.childId && message.sessionId === input.sourceSessionId && Number.isSafeInteger(message.sequence) && message.sequence > 0 && (message.actor === "guardian" || message.actor === "assistant") && message.status === "completed" && INSTANT.safeParse(message.occurredAt).success && Date.parse(message.occurredAt) <= Date.parse(input.cutoffAt) && typeof message.text === "string" && message.text.length > 0 && message.text.length <= 8e3;
}
__name(validateMessage, "validateMessage");
async function loadEligibleMessages(rawInput) {
  const input = parseInput(rawInput);
  const runtime5 = requirePorts();
  let loaded;
  try {
    loaded = await runtime5.loadMessages(input);
  } catch {
    throw new RetryableError("SUMMARY_SOURCE_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
  if (loaded.sessionState === "urgent") return Object.freeze({
    status: "skipped",
    reason: "urgent_session"
  });
  if (!Array.isArray(loaded.messages) || loaded.messages.length === 0 || loaded.messages.length > 100) {
    throw new FatalError("SUMMARY_SOURCE_INVALID");
  }
  const messages = [
    ...loaded.messages
  ].filter((message) => validateMessage(message, input)).sort((left, right) => left.sequence - right.sequence);
  if (messages.length !== loaded.messages.length) throw new FatalError("SUMMARY_SCOPE_MISMATCH");
  return Object.freeze({
    status: "loaded",
    input,
    messages: Object.freeze(messages)
  });
}
__name(loadEligibleMessages, "loadEligibleMessages");
async function generateCandidateSummary(loaded) {
  if (loaded.status === "skipped") return loaded;
  const runtime5 = requirePorts();
  let draft;
  try {
    draft = await runtime5.summarize(loaded.messages, loaded.input);
  } catch {
    throw new RetryableError("SUMMARY_PROVIDER_UNAVAILABLE", {
      retryAfter: "30s"
    });
  }
  if (!draft || typeof draft.text !== "string" || draft.text.trim().length === 0 || draft.text.length > 2e3) {
    throw new FatalError("SUMMARY_OUTPUT_INVALID");
  }
  return Object.freeze({
    status: "draft",
    input: loaded.input,
    draft: Object.freeze({
      ...draft,
      citations: Object.freeze([
        ...draft.citations
      ])
    })
  });
}
__name(generateCandidateSummary, "generateCandidateSummary");
function assertCandidatePolicy(value) {
  const unsafe = /\b(?:diagnos(?:e|is|ed)|prescrib(?:e|ing)|prescription|dosage|dosis|tratamiento|treat)\b/iu;
  if (typeof value.text !== "string" || value.text.trim().length === 0 || value.text.length > 2e3 || !Array.isArray(value.citations) || value.citations.length === 0 || value.citations.length > 16 || unsafe.test(value.text)) throw new FatalError("SUMMARY_POLICY_REJECTED");
  if (!value.citations.every((citation) => UUID.safeParse(citation.messageId).success && Number.isInteger(citation.start) && citation.start >= 0 && Number.isInteger(citation.end) && citation.end > citation.start)) {
    throw new FatalError("SUMMARY_CITATION_INVALID");
  }
  return Object.freeze({
    text: value.text.trim(),
    citations: Object.freeze([
      ...value.citations
    ])
  });
}
__name(assertCandidatePolicy, "assertCandidatePolicy");
async function validateCandidatePolicy(value) {
  return assertCandidatePolicy(value);
}
__name(validateCandidatePolicy, "validateCandidatePolicy");
async function persistCandidates(value) {
  if (value.status === "skipped") return value;
  if (value.status !== "draft") throw new FatalError("SUMMARY_DRAFT_REQUIRED");
  const runtime5 = requirePorts();
  const draft = assertCandidatePolicy(value.draft);
  let persisted;
  try {
    persisted = await runtime5.persistCandidate(Object.freeze({
      ...value.input,
      ...draft,
      lifecycle: "pending"
    }));
  } catch {
    throw new RetryableError("SUMMARY_STORAGE_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
  if (persisted.outcome === "conflict" || !UUID.safeParse(persisted.candidateId).success) {
    throw new FatalError("SUMMARY_REPLAY_CONFLICT");
  }
  return Object.freeze({
    status: "persisted",
    outcome: persisted.outcome,
    candidateId: persisted.candidateId
  });
}
__name(persistCandidates, "persistCandidates");
async function conversationSummaryWorkflow(rawInput) {
  throw new Error("You attempted to execute workflow conversationSummaryWorkflow function directly. To start a workflow, use start(conversationSummaryWorkflow) from workflow/api");
}
__name(conversationSummaryWorkflow, "conversationSummaryWorkflow");
conversationSummaryWorkflow.workflowId = "workflow//./conversation-summary//conversationSummaryWorkflow";
registerStepFunction3("step//./conversation-summary//loadEligibleMessages", loadEligibleMessages);
registerStepFunction3("step//./conversation-summary//generateCandidateSummary", generateCandidateSummary);
registerStepFunction3("step//./conversation-summary//validateCandidatePolicy", validateCandidatePolicy);
registerStepFunction3("step//./conversation-summary//persistCandidates", persistCandidates);

// document-processing.ts
import { registerStepFunction as registerStepFunction4 } from "workflow/internal/private";
import { FatalError as FatalError2, RetryableError as RetryableError2 } from "workflow";
var ports2 = null;
function runtime() {
  if (!ports2) throw new FatalError2("DOCUMENT_PROCESSING_RUNTIME_UNCONFIGURED");
  return ports2;
}
__name(runtime, "runtime");
function validInput(input) {
  return Object.values(input).every((value) => typeof value === "string" && value.length > 0 && value.length <= 512) && /^[a-f0-9]{64}$/u.test(input.objectSha256) && input.purpose !== void 0;
}
__name(validInput, "validInput");
function validObject(input, object) {
  return object.documentId === input.documentId && object.objectSha256 === input.objectSha256 && object.objectVersion.length > 0 && Number.isInteger(object.sizeBytes) && object.sizeBytes > 0 && object.sizeBytes <= 52428800;
}
__name(validObject, "validObject");
async function verifyObject(input) {
  if (!validInput(input)) throw new FatalError2("DOCUMENT_PROCESSING_INVALID_INPUT");
  let object;
  try {
    object = await runtime().verifyObject(input);
  } catch (error) {
    if (error instanceof FatalError2) throw error;
    throw new RetryableError2("DOCUMENT_PROCESSING_OBJECT_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
  if (!validObject(input, object)) throw new FatalError2("DOCUMENT_PROCESSING_OBJECT_MISMATCH");
  return Object.freeze({
    ...object
  });
}
__name(verifyObject, "verifyObject");
async function scanObject(input, object) {
  if (!validInput(input) || !validObject(input, object)) throw new FatalError2("DOCUMENT_PROCESSING_SCAN_INVALID");
  try {
    return await runtime().scanObject(input, object);
  } catch {
    throw new RetryableError2("DOCUMENT_PROCESSING_SCANNER_UNAVAILABLE", {
      retryAfter: "30s"
    });
  }
}
__name(scanObject, "scanObject");
async function extractDraft(input, object) {
  if (!validInput(input) || !validObject(input, object)) throw new FatalError2("DOCUMENT_PROCESSING_EXTRACTION_INVALID");
  let draft;
  try {
    draft = await runtime().extractDraft(input, object);
  } catch (error) {
    if (error instanceof FatalError2) throw error;
    throw new RetryableError2("DOCUMENT_PROCESSING_EXTRACTOR_UNAVAILABLE", {
      retryAfter: "30s"
    });
  }
  if (!draft.untrusted || !draft.confirmationRequired || !/^[a-f0-9]{64}$/u.test(draft.outputSha256) || draft.draftId.length === 0 || !Number.isInteger(draft.candidateCount) || draft.candidateCount < 0 || draft.candidateCount > 200) {
    throw new FatalError2("DOCUMENT_PROCESSING_DRAFT_INVALID");
  }
  return Object.freeze({
    ...draft,
    untrusted: true,
    confirmationRequired: true
  });
}
__name(extractDraft, "extractDraft");
async function persistDraft(input, object, draft) {
  if (!validInput(input) || !validObject(input, object) || !draft.untrusted || !draft.confirmationRequired) throw new FatalError2("DOCUMENT_PROCESSING_PERSIST_INVALID");
  try {
    return await runtime().persistDraft(input, object, draft);
  } catch (error) {
    if (error instanceof FatalError2) throw error;
    throw new RetryableError2("DOCUMENT_PROCESSING_PERSIST_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
}
__name(persistDraft, "persistDraft");
async function finalize(input, object, draft) {
  if (!validInput(input) || !validObject(input, object) || !draft.untrusted || !draft.confirmationRequired) throw new FatalError2("DOCUMENT_PROCESSING_FINALIZE_INVALID");
  try {
    return await runtime().finalize(input, object, draft);
  } catch (error) {
    if (error instanceof FatalError2) throw error;
    throw new RetryableError2("DOCUMENT_PROCESSING_FINALIZE_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
}
__name(finalize, "finalize");
async function quarantine(input, object, reason) {
  if (!validInput(input) || !validObject(input, object)) throw new FatalError2("DOCUMENT_PROCESSING_QUARANTINE_INVALID");
  try {
    return await runtime().quarantine(input, object, reason);
  } catch {
    throw new RetryableError2("DOCUMENT_PROCESSING_QUARANTINE_UNAVAILABLE", {
      retryAfter: "30s"
    });
  }
}
__name(quarantine, "quarantine");
async function cleanup(input, object) {
  if (!validInput(input) || !validObject(input, object)) throw new FatalError2("DOCUMENT_PROCESSING_CLEANUP_INVALID");
  await runtime().cleanup(input, object);
}
__name(cleanup, "cleanup");
async function documentProcessingWorkflow(input) {
  throw new Error("You attempted to execute workflow documentProcessingWorkflow function directly. To start a workflow, use start(documentProcessingWorkflow) from workflow/api");
}
__name(documentProcessingWorkflow, "documentProcessingWorkflow");
documentProcessingWorkflow.workflowId = "workflow//./document-processing//documentProcessingWorkflow";
registerStepFunction4("step//./document-processing//verifyObject", verifyObject);
registerStepFunction4("step//./document-processing//scanObject", scanObject);
registerStepFunction4("step//./document-processing//extractDraft", extractDraft);
registerStepFunction4("step//./document-processing//persistDraft", persistDraft);
registerStepFunction4("step//./document-processing//finalize", finalize);
registerStepFunction4("step//./document-processing//quarantine", quarantine);
registerStepFunction4("step//./document-processing//cleanup", cleanup);

// memory-embedding.ts
import { registerStepFunction as registerStepFunction5 } from "workflow/internal/private";
import { FatalError as FatalError3, RetryableError as RetryableError3 } from "workflow";
var ports3 = null;
function runtime2() {
  if (!ports3) throw new FatalError3("MEMORY_EMBEDDING_RUNTIME_UNCONFIGURED");
  return ports3;
}
__name(runtime2, "runtime");
function validInput2(value) {
  return Object.values(value).every((item) => typeof item === "string" && item.length > 0 && item.length <= 512) && /^[a-f0-9]{64}$/u.test(value.contentSha256) && (value.operation === "upsert" || value.operation === "remove");
}
__name(validInput2, "validInput");
async function loadEligibility(input) {
  if (!validInput2(input)) throw new FatalError3("MEMORY_EMBEDDING_INVALID_INPUT");
  try {
    return await runtime2().loadEligibility(input);
  } catch (error) {
    if (error instanceof FatalError3) throw error;
    throw new RetryableError3("MEMORY_EMBEDDING_SOURCE_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
}
__name(loadEligibility, "loadEligibility");
async function embedMemory(input, eligibility) {
  if (!validInput2(input) || !eligibility.eligible || eligibility.contentSha256 !== input.contentSha256) throw new FatalError3("MEMORY_EMBEDDING_NOT_ELIGIBLE");
  if (eligibility.searchableText.length === 0 || eligibility.searchableText.length > 8e3) throw new FatalError3("MEMORY_EMBEDDING_TEXT_INVALID");
  let result;
  try {
    result = await runtime2().embedMemory(eligibility.searchableText, input.compatibilityVersion);
  } catch {
    throw new RetryableError3("MEMORY_EMBEDDING_PROVIDER_UNAVAILABLE", {
      retryAfter: "30s"
    });
  }
  if (!Array.isArray(result.vector) || result.vector.length !== 768 || result.vector.some((value) => !Number.isFinite(value)) || !/^[a-f0-9]{64}$/u.test(result.vectorSha256) || !/^[a-f0-9]{64}$/u.test(result.inputSha256)) {
    throw new FatalError3("MEMORY_EMBEDDING_RESULT_INVALID");
  }
  return Object.freeze({
    vector: Object.freeze([
      ...result.vector
    ]),
    vectorSha256: result.vectorSha256,
    inputSha256: result.inputSha256
  });
}
__name(embedMemory, "embedMemory");
async function persistEmbedding(input, embedding) {
  if (!validInput2(input) || input.operation !== "upsert") throw new FatalError3("MEMORY_EMBEDDING_INVALID_OPERATION");
  const outcome = await runtime2().persistEmbedding(input, embedding);
  if (outcome === "conflict") throw new FatalError3("MEMORY_EMBEDDING_REPLAY_CONFLICT");
  return outcome;
}
__name(persistEmbedding, "persistEmbedding");
async function removeEmbedding(input) {
  if (!validInput2(input) || input.operation !== "remove") throw new FatalError3("MEMORY_EMBEDDING_INVALID_OPERATION");
  return runtime2().removeEmbedding(input);
}
__name(removeEmbedding, "removeEmbedding");
async function memoryEmbeddingWorkflow(input) {
  throw new Error("You attempted to execute workflow memoryEmbeddingWorkflow function directly. To start a workflow, use start(memoryEmbeddingWorkflow) from workflow/api");
}
__name(memoryEmbeddingWorkflow, "memoryEmbeddingWorkflow");
memoryEmbeddingWorkflow.workflowId = "workflow//./memory-embedding//memoryEmbeddingWorkflow";
registerStepFunction5("step//./memory-embedding//loadEligibility", loadEligibility);
registerStepFunction5("step//./memory-embedding//embedMemory", embedMemory);
registerStepFunction5("step//./memory-embedding//persistEmbedding", persistEmbedding);
registerStepFunction5("step//./memory-embedding//removeEmbedding", removeEmbedding);

// retention-cleanup.ts
import { registerStepFunction as registerStepFunction6 } from "workflow/internal/private";
import { FatalError as FatalError4, RetryableError as RetryableError4 } from "workflow";
var ports4 = null;
function runtime3() {
  if (!ports4) throw new FatalError4("RETENTION_CLEANUP_RUNTIME_UNCONFIGURED");
  return ports4;
}
__name(runtime3, "runtime");
function validInput3(input) {
  return Object.values(input).every((value) => typeof value === "string" && value.length > 0 && value.length <= 512) && /^[a-f0-9]{64}$/u.test(input.requestSha256);
}
__name(validInput3, "validInput");
function validAuthorization(input, authorization) {
  return authorization.requestId === input.requestId && authorization.memoryItemId === input.memoryItemId && authorization.careSpaceId === input.careSpaceId && authorization.childId === input.childId && authorization.resourceVersion.length > 0 && (authorization.status === "pending" || authorization.status === "completed" || authorization.status === "legal_hold") && authorization.legalHold === (authorization.status === "legal_hold");
}
__name(validAuthorization, "validAuthorization");
function validPlan(plan) {
  return /^[a-f0-9]{64}$/u.test(plan.planSha256) && Object.values(plan).filter((value) => typeof value === "number").every((value) => Number.isInteger(value) && value >= 0 && value <= 1e5);
}
__name(validPlan, "validPlan");
async function loadAuthorizedRequest(input) {
  if (!validInput3(input)) throw new FatalError4("RETENTION_CLEANUP_INVALID_INPUT");
  let authorization;
  try {
    authorization = await runtime3().loadAuthorizedRequest(input);
  } catch (error) {
    if (error instanceof FatalError4) throw error;
    throw new RetryableError4("RETENTION_CLEANUP_AUTHORIZATION_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
  if (!validAuthorization(input, authorization)) throw new FatalError4("RETENTION_CLEANUP_SCOPE_INVALID");
  return Object.freeze({
    ...authorization
  });
}
__name(loadAuthorizedRequest, "loadAuthorizedRequest");
async function revokeEligibility(input, authorization) {
  if (!validInput3(input) || !validAuthorization(input, authorization) || authorization.status !== "pending" || authorization.legalHold) throw new FatalError4("RETENTION_CLEANUP_REVOCATION_INVALID");
  let plan;
  try {
    plan = await runtime3().revokeEligibility(input, authorization);
  } catch (error) {
    if (error instanceof FatalError4) throw error;
    throw new RetryableError4("RETENTION_CLEANUP_REVOCATION_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
  if (!validPlan(plan)) throw new FatalError4("RETENTION_CLEANUP_PLAN_INVALID");
  return Object.freeze({
    ...plan
  });
}
__name(revokeEligibility, "revokeEligibility");
async function effectStep(name, input, plan) {
  if (!validInput3(input) || !validPlan(plan)) throw new FatalError4("RETENTION_CLEANUP_EFFECT_INVALID");
  try {
    await runtime3()[name](input, plan);
  } catch (error) {
    if (error instanceof FatalError4) throw error;
    throw new RetryableError4(`RETENTION_CLEANUP_${name.toUpperCase()}_UNAVAILABLE`, {
      retryAfter: "30s"
    });
  }
}
__name(effectStep, "effectStep");
async function verifyClosure(input, plan) {
  if (!validInput3(input) || !validPlan(plan)) throw new FatalError4("RETENTION_CLEANUP_CLOSURE_INVALID");
  let result;
  try {
    result = await runtime3().verifyClosure(input, plan);
  } catch (error) {
    if (error instanceof FatalError4) throw error;
    throw new RetryableError4("RETENTION_CLEANUP_CLOSURE_UNAVAILABLE", {
      retryAfter: "30s"
    });
  }
  if (!Number.isInteger(result.orphanCount) || result.orphanCount < 0 || !/^[a-f0-9]{64}$/u.test(result.proofSha256)) throw new FatalError4("RETENTION_CLEANUP_PROOF_INVALID");
  if (result.orphanCount > 0) throw new RetryableError4("RETENTION_CLEANUP_CLOSURE_INCOMPLETE", {
    retryAfter: "30s"
  });
  return Object.freeze({
    ...result
  });
}
__name(verifyClosure, "verifyClosure");
async function finalizeEvidence(input, plan, proof) {
  if (!validInput3(input) || !validPlan(plan) || proof.orphanCount !== 0 || !/^[a-f0-9]{64}$/u.test(proof.proofSha256)) throw new FatalError4("RETENTION_CLEANUP_EVIDENCE_INVALID");
  try {
    return await runtime3().finalizeEvidence(input, plan, proof);
  } catch (error) {
    if (error instanceof FatalError4) throw error;
    throw new RetryableError4("RETENTION_CLEANUP_EVIDENCE_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
}
__name(finalizeEvidence, "finalizeEvidence");
async function retentionCleanupWorkflow(input) {
  throw new Error("You attempted to execute workflow retentionCleanupWorkflow function directly. To start a workflow, use start(retentionCleanupWorkflow) from workflow/api");
}
__name(retentionCleanupWorkflow, "retentionCleanupWorkflow");
retentionCleanupWorkflow.workflowId = "workflow//./retention-cleanup//retentionCleanupWorkflow";
registerStepFunction6("step//./retention-cleanup//loadAuthorizedRequest", loadAuthorizedRequest);
registerStepFunction6("step//./retention-cleanup//revokeEligibility", revokeEligibility);
registerStepFunction6("step//./retention-cleanup//effectStep", effectStep);
registerStepFunction6("step//./retention-cleanup//verifyClosure", verifyClosure);
registerStepFunction6("step//./retention-cleanup//finalizeEvidence", finalizeEvidence);

// vaccination-card-pdf.ts
import { registerStepFunction as registerStepFunction7 } from "workflow/internal/private";
import { FatalError as FatalError5, RetryableError as RetryableError5 } from "workflow";
var ports5 = null;
function runtime4() {
  if (!ports5) throw new FatalError5("VACCINATION_PDF_RUNTIME_UNCONFIGURED");
  return ports5;
}
__name(runtime4, "runtime");
function valid(input) {
  return Object.values(input).every((v) => typeof v === "string" && v.length > 0 && v.length <= 512) && /^[a-f0-9]{64}$/u.test(input.factsDigest) && (input.country === "CO" || input.country === "US");
}
__name(valid, "valid");
async function loadSnapshot(input) {
  if (!valid(input)) throw new FatalError5("VACCINATION_PDF_INVALID_INPUT");
  let snapshot;
  try {
    snapshot = await runtime4().loadSnapshot(input);
  } catch {
    throw new RetryableError5("VACCINATION_PDF_SOURCE_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
  if (!snapshot || snapshot.documentId !== input.documentId || snapshot.factsDigest !== input.factsDigest || snapshot.country !== input.country || !Number.isInteger(snapshot.rows) || snapshot.rows < 0 || snapshot.rows > 500) throw new FatalError5("VACCINATION_PDF_SNAPSHOT_INVALID");
  return snapshot;
}
__name(loadSnapshot, "loadSnapshot");
async function renderPdf(snapshot, templateVersion) {
  if (!snapshot || snapshot.rows < 0 || typeof templateVersion !== "string" || templateVersion.length === 0) throw new FatalError5("VACCINATION_PDF_TEMPLATE_INVALID");
  try {
    const render = await runtime4().renderPdf(snapshot, templateVersion);
    if (!render || !/^[-A-Za-z0-9._:]{1,256}$/u.test(render.renderId) || !/^[a-f0-9]{64}$/u.test(render.bytesSha256) || !Number.isInteger(render.sizeBytes) || render.sizeBytes <= 0 || render.sizeBytes > 52428800) throw new FatalError5("VACCINATION_PDF_RENDER_INVALID");
    return render;
  } catch (error) {
    if (error instanceof FatalError5) throw error;
    throw new RetryableError5("VACCINATION_PDF_RENDER_UNAVAILABLE", {
      retryAfter: "30s"
    });
  }
}
__name(renderPdf, "renderPdf");
async function uploadPrivateObject(input, render) {
  if (!valid(input) || !render) throw new FatalError5("VACCINATION_PDF_UPLOAD_INVALID");
  try {
    return await runtime4().uploadPrivateObject(input, render);
  } catch {
    throw new RetryableError5("VACCINATION_PDF_STORAGE_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
}
__name(uploadPrivateObject, "uploadPrivateObject");
async function finalizeDocument(input, render) {
  if (!valid(input) || !render) throw new FatalError5("VACCINATION_PDF_FINALIZE_INVALID");
  try {
    return await runtime4().finalizeDocument(input, render);
  } catch {
    throw new RetryableError5("VACCINATION_PDF_FINALIZE_UNAVAILABLE", {
      retryAfter: "10s"
    });
  }
}
__name(finalizeDocument, "finalizeDocument");
async function cleanupPartial(input, render) {
  if (!valid(input) || !render) throw new FatalError5("VACCINATION_PDF_CLEANUP_INVALID");
  await runtime4().cleanupPartial(input, render);
}
__name(cleanupPartial, "cleanupPartial");
async function vaccinationCardPdfWorkflow(input) {
  throw new Error("You attempted to execute workflow vaccinationCardPdfWorkflow function directly. To start a workflow, use start(vaccinationCardPdfWorkflow) from workflow/api");
}
__name(vaccinationCardPdfWorkflow, "vaccinationCardPdfWorkflow");
vaccinationCardPdfWorkflow.workflowId = "workflow//./vaccination-card-pdf//vaccinationCardPdfWorkflow";
registerStepFunction7("step//./vaccination-card-pdf//loadSnapshot", loadSnapshot);
registerStepFunction7("step//./vaccination-card-pdf//renderPdf", renderPdf);
registerStepFunction7("step//./vaccination-card-pdf//uploadPrivateObject", uploadPrivateObject);
registerStepFunction7("step//./vaccination-card-pdf//finalizeDocument", finalizeDocument);
registerStepFunction7("step//./vaccination-card-pdf//cleanupPartial", cleanupPartial);

// virtual-entry.js
import { stepEntrypoint, stepEntrypoint as stepEntrypoint2 } from "workflow/runtime";
export {
  stepEntrypoint as HEAD,
  stepEntrypoint2 as POST
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbm9kZV9tb2R1bGVzL3dvcmtmbG93L3NyYy9pbnRlcm5hbC9idWlsdGlucy50cyIsICIuLi9ub2RlX21vZHVsZXMvd29ya2Zsb3cvc3JjL3N0ZGxpYi50cyIsICIuLi9zcmMvd29ya2Zsb3dzL2NvbnZlcnNhdGlvbi1zdW1tYXJ5LnRzIiwgIi4uL3NyYy93b3JrZmxvd3MvZG9jdW1lbnQtcHJvY2Vzc2luZy50cyIsICIuLi9zcmMvd29ya2Zsb3dzL21lbW9yeS1lbWJlZGRpbmcudHMiLCAiLi4vc3JjL3dvcmtmbG93cy9yZXRlbnRpb24tY2xlYW51cC50cyIsICIuLi9zcmMvd29ya2Zsb3dzL3ZhY2NpbmF0aW9uLWNhcmQtcGRmLnRzIiwgIi4uL3NyYy93b3JrZmxvd3MvdmlydHVhbC1lbnRyeS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBUaGVzZSBhcmUgdGhlIGJ1aWx0LWluIHN0ZXBzIHRoYXQgYXJlIFwiYXV0b21hdGljYWxseSBhdmFpbGFibGVcIiBpbiB0aGUgd29ya2Zsb3cgc2NvcGUuIFRoZXkgYXJlXG4gKiBzaW1pbGFyIHRvIFwic3RkbGliXCIgZXhjZXB0IHRoYXQgYXJlIG5vdCBtZWFudCB0byBiZSBpbXBvcnRlZCBieSB1c2VycywgYnV0IGFyZSBpbnN0ZWFkIFwianVzdCBhdmFpbGFibGVcIlxuICogYWxvbmdzaWRlIHVzZXIgZGVmaW5lZCBzdGVwcy4gVGhleSBhcmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBydW50aW1lXG4gKi9cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIF9fYnVpbHRpbl9yZXNwb25zZV9hcnJheV9idWZmZXIoXG4gIHRoaXM6IFJlcXVlc3QgfCBSZXNwb25zZVxuKSB7XG4gICd1c2Ugc3RlcCc7XG4gIHJldHVybiB0aGlzLmFycmF5QnVmZmVyKCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBfX2J1aWx0aW5fcmVzcG9uc2VfanNvbih0aGlzOiBSZXF1ZXN0IHwgUmVzcG9uc2UpIHtcbiAgJ3VzZSBzdGVwJztcbiAgcmV0dXJuIHRoaXMuanNvbigpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gX19idWlsdGluX3Jlc3BvbnNlX3RleHQodGhpczogUmVxdWVzdCB8IFJlc3BvbnNlKSB7XG4gICd1c2Ugc3RlcCc7XG4gIHJldHVybiB0aGlzLnRleHQoKTtcbn1cbiIsICIvKipcbiAqIFRoaXMgaXMgdGhlIFwic3RhbmRhcmQgbGlicmFyeVwiIG9mIHN0ZXBzIHRoYXQgd2UgbWFrZSBhdmFpbGFibGUgdG8gYWxsIHdvcmtmbG93IHVzZXJzLlxuICogVGhlIGNhbiBiZSBpbXBvcnRlZCBsaWtlIHNvOiBgaW1wb3J0IHsgZmV0Y2ggfSBmcm9tICd3b3JrZmxvdydgLiBhbmQgdXNlZCBpbiB3b3JrZmxvdy5cbiAqIFRoZSBuZWVkIHRvIGJlIGV4cG9ydGVkIGRpcmVjdGx5IGluIHRoaXMgcGFja2FnZSBhbmQgY2Fubm90IGxpdmUgaW4gYGNvcmVgIHRvIHByZXZlbnRcbiAqIGNpcmN1bGFyIGRlcGVuZGVuY2llcyBwb3N0LWNvbXBpbGF0aW9uLlxuICovXG5cbi8qKlxuICogQSBob2lzdGVkIGBmZXRjaCgpYCBmdW5jdGlvbiB0aGF0IGlzIGV4ZWN1dGVkIGFzIGEgXCJzdGVwXCIgZnVuY3Rpb24sXG4gKiBmb3IgdXNlIHdpdGhpbiB3b3JrZmxvdyBmdW5jdGlvbnMuXG4gKlxuICogQHNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRmV0Y2hfQVBJXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaCguLi5hcmdzOiBQYXJhbWV0ZXJzPHR5cGVvZiBnbG9iYWxUaGlzLmZldGNoPikge1xuICAndXNlIHN0ZXAnO1xuICByZXR1cm4gZ2xvYmFsVGhpcy5mZXRjaCguLi5hcmdzKTtcbn1cbiIsICJpbXBvcnQgeyByZWdpc3RlclN0ZXBGdW5jdGlvbiB9IGZyb20gXCJ3b3JrZmxvdy9pbnRlcm5hbC9wcml2YXRlXCI7XG5pbXBvcnQgeyBGYXRhbEVycm9yLCBSZXRyeWFibGVFcnJvciB9IGZyb20gXCJ3b3JrZmxvd1wiO1xuaW1wb3J0IHsgeiB9IGZyb20gXCJ6b2RcIjtcbi8qKl9faW50ZXJuYWxfd29ya2Zsb3dze1wid29ya2Zsb3dzXCI6e1wiY29udmVyc2F0aW9uLXN1bW1hcnkudHNcIjp7XCJjb252ZXJzYXRpb25TdW1tYXJ5V29ya2Zsb3dcIjp7XCJ3b3JrZmxvd0lkXCI6XCJ3b3JrZmxvdy8vLi9jb252ZXJzYXRpb24tc3VtbWFyeS8vY29udmVyc2F0aW9uU3VtbWFyeVdvcmtmbG93XCJ9fX0sXCJzdGVwc1wiOntcImNvbnZlcnNhdGlvbi1zdW1tYXJ5LnRzXCI6e1wiZ2VuZXJhdGVDYW5kaWRhdGVTdW1tYXJ5XCI6e1wic3RlcElkXCI6XCJzdGVwLy8uL2NvbnZlcnNhdGlvbi1zdW1tYXJ5Ly9nZW5lcmF0ZUNhbmRpZGF0ZVN1bW1hcnlcIn0sXCJsb2FkRWxpZ2libGVNZXNzYWdlc1wiOntcInN0ZXBJZFwiOlwic3RlcC8vLi9jb252ZXJzYXRpb24tc3VtbWFyeS8vbG9hZEVsaWdpYmxlTWVzc2FnZXNcIn0sXCJwZXJzaXN0Q2FuZGlkYXRlc1wiOntcInN0ZXBJZFwiOlwic3RlcC8vLi9jb252ZXJzYXRpb24tc3VtbWFyeS8vcGVyc2lzdENhbmRpZGF0ZXNcIn0sXCJ2YWxpZGF0ZUNhbmRpZGF0ZVBvbGljeVwiOntcInN0ZXBJZFwiOlwic3RlcC8vLi9jb252ZXJzYXRpb24tc3VtbWFyeS8vdmFsaWRhdGVDYW5kaWRhdGVQb2xpY3lcIn19fX0qLztcbmNvbnN0IFVVSUQgPSB6LnN0cmluZygpLnV1aWQoKTtcbmNvbnN0IERJR0VTVCA9IHouc3RyaW5nKCkucmVnZXgoL15bYS1mMC05XXs2NH0kL3UpO1xuY29uc3QgSU5TVEFOVCA9IHouc3RyaW5nKCkuZGF0ZXRpbWUoe1xuICAgIG9mZnNldDogdHJ1ZVxufSk7XG5jb25zdCBTQUZFX1ZFUlNJT04gPSB6LnN0cmluZygpLnJlZ2V4KC9eW0EtWmEtejAtOV1bQS1aYS16MC05Ll86LV17MCw2M30kL3UpO1xuY29uc3QgSU5QVVQgPSB6Lm9iamVjdCh7XG4gICAgb3duZXJVc2VySWQ6IFVVSUQsXG4gICAgY2FyZVNwYWNlSWQ6IFVVSUQsXG4gICAgY2hpbGRJZDogVVVJRCxcbiAgICBzZXNzaW9uSWQ6IFVVSUQsXG4gICAgc291cmNlU2Vzc2lvbklkOiBVVUlELFxuICAgIHNvdXJjZURpZ2VzdDogRElHRVNULFxuICAgIGN1dG9mZkF0OiBJTlNUQU5ULFxuICAgIHByb21wdFZlcnNpb246IFNBRkVfVkVSU0lPTixcbiAgICBzY2hlbWFWZXJzaW9uOiBTQUZFX1ZFUlNJT04sXG4gICAgaWRlbXBvdGVuY3lLZXk6IHouc3RyaW5nKCkucmVnZXgoL15bQS1aYS16MC05XVtBLVphLXowLTkuXzotXXswLDEyN30kL3UpXG59KS5zdHJpY3QoKTtcbmxldCBwb3J0cyA9IG51bGw7XG5jb25zdCBQT1JUU19LRVkgPSBTeW1ib2wuZm9yKFwiYWdlbnQtdHJ1amlsbG8ud29ya2Zsb3cuY29udmVyc2F0aW9uLXN1bW1hcnkucG9ydHNcIik7XG5leHBvcnQgZnVuY3Rpb24gY29uZmlndXJlQ29udmVyc2F0aW9uU3VtbWFyeVBvcnRzKHZhbHVlKSB7XG4gICAgcG9ydHMgPSB2YWx1ZTtcbiAgICBjb25zdCBydW50aW1lR2xvYmFsID0gZ2xvYmFsVGhpcztcbiAgICBpZiAodmFsdWUpIHJ1bnRpbWVHbG9iYWxbUE9SVFNfS0VZXSA9IHZhbHVlO1xuICAgIGVsc2UgZGVsZXRlIHJ1bnRpbWVHbG9iYWxbUE9SVFNfS0VZXTtcbn1cbmZ1bmN0aW9uIHBhcnNlSW5wdXQodmFsdWUpIHtcbiAgICBjb25zdCBwYXJzZWQgPSBJTlBVVC5zYWZlUGFyc2UodmFsdWUpO1xuICAgIGlmICghcGFyc2VkLnN1Y2Nlc3MpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiU1VNTUFSWV9JTlZBTElEX0lOUFVUXCIpO1xuICAgIHJldHVybiBPYmplY3QuZnJlZXplKHBhcnNlZC5kYXRhKTtcbn1cbmZ1bmN0aW9uIHJlcXVpcmVQb3J0cygpIHtcbiAgICBjb25zdCBjb25maWd1cmVkID0gcG9ydHMgPz8gZ2xvYmFsVGhpc1tQT1JUU19LRVldO1xuICAgIGlmICghY29uZmlndXJlZCkgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJTVU1NQVJZX1JVTlRJTUVfVU5DT05GSUdVUkVEXCIpO1xuICAgIHJldHVybiBjb25maWd1cmVkO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVNZXNzYWdlKG1lc3NhZ2UsIGlucHV0KSB7XG4gICAgcmV0dXJuIFVVSUQuc2FmZVBhcnNlKG1lc3NhZ2UuaWQpLnN1Y2Nlc3MgJiYgbWVzc2FnZS5vd25lclVzZXJJZCA9PT0gaW5wdXQub3duZXJVc2VySWQgJiYgbWVzc2FnZS5jYXJlU3BhY2VJZCA9PT0gaW5wdXQuY2FyZVNwYWNlSWQgJiYgbWVzc2FnZS5jaGlsZElkID09PSBpbnB1dC5jaGlsZElkICYmIG1lc3NhZ2Uuc2Vzc2lvbklkID09PSBpbnB1dC5zb3VyY2VTZXNzaW9uSWQgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIobWVzc2FnZS5zZXF1ZW5jZSkgJiYgbWVzc2FnZS5zZXF1ZW5jZSA+IDAgJiYgKG1lc3NhZ2UuYWN0b3IgPT09IFwiZ3VhcmRpYW5cIiB8fCBtZXNzYWdlLmFjdG9yID09PSBcImFzc2lzdGFudFwiKSAmJiBtZXNzYWdlLnN0YXR1cyA9PT0gXCJjb21wbGV0ZWRcIiAmJiBJTlNUQU5ULnNhZmVQYXJzZShtZXNzYWdlLm9jY3VycmVkQXQpLnN1Y2Nlc3MgJiYgRGF0ZS5wYXJzZShtZXNzYWdlLm9jY3VycmVkQXQpIDw9IERhdGUucGFyc2UoaW5wdXQuY3V0b2ZmQXQpICYmIHR5cGVvZiBtZXNzYWdlLnRleHQgPT09IFwic3RyaW5nXCIgJiYgbWVzc2FnZS50ZXh0Lmxlbmd0aCA+IDAgJiYgbWVzc2FnZS50ZXh0Lmxlbmd0aCA8PSA4XzAwMDtcbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkRWxpZ2libGVNZXNzYWdlcyhyYXdJbnB1dCkge1xuICAgIGNvbnN0IGlucHV0ID0gcGFyc2VJbnB1dChyYXdJbnB1dCk7XG4gICAgY29uc3QgcnVudGltZSA9IHJlcXVpcmVQb3J0cygpO1xuICAgIGxldCBsb2FkZWQ7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9hZGVkID0gYXdhaXQgcnVudGltZS5sb2FkTWVzc2FnZXMoaW5wdXQpO1xuICAgIH0gY2F0Y2ggIHtcbiAgICAgICAgdGhyb3cgbmV3IFJldHJ5YWJsZUVycm9yKFwiU1VNTUFSWV9TT1VSQ0VfVU5BVkFJTEFCTEVcIiwge1xuICAgICAgICAgICAgcmV0cnlBZnRlcjogXCIxMHNcIlxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKGxvYWRlZC5zZXNzaW9uU3RhdGUgPT09IFwidXJnZW50XCIpIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICAgICAgc3RhdHVzOiBcInNraXBwZWRcIixcbiAgICAgICAgcmVhc29uOiBcInVyZ2VudF9zZXNzaW9uXCJcbiAgICB9KTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkobG9hZGVkLm1lc3NhZ2VzKSB8fCBsb2FkZWQubWVzc2FnZXMubGVuZ3RoID09PSAwIHx8IGxvYWRlZC5tZXNzYWdlcy5sZW5ndGggPiAxMDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJTVU1NQVJZX1NPVVJDRV9JTlZBTElEXCIpO1xuICAgIH1cbiAgICBjb25zdCBtZXNzYWdlcyA9IFtcbiAgICAgICAgLi4ubG9hZGVkLm1lc3NhZ2VzXG4gICAgXS5maWx0ZXIoKG1lc3NhZ2UpPT52YWxpZGF0ZU1lc3NhZ2UobWVzc2FnZSwgaW5wdXQpKS5zb3J0KChsZWZ0LCByaWdodCk9PmxlZnQuc2VxdWVuY2UgLSByaWdodC5zZXF1ZW5jZSk7XG4gICAgaWYgKG1lc3NhZ2VzLmxlbmd0aCAhPT0gbG9hZGVkLm1lc3NhZ2VzLmxlbmd0aCkgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJTVU1NQVJZX1NDT1BFX01JU01BVENIXCIpO1xuICAgIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICAgICAgc3RhdHVzOiBcImxvYWRlZFwiLFxuICAgICAgICBpbnB1dCxcbiAgICAgICAgbWVzc2FnZXM6IE9iamVjdC5mcmVlemUobWVzc2FnZXMpXG4gICAgfSk7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVDYW5kaWRhdGVTdW1tYXJ5KGxvYWRlZCkge1xuICAgIGlmIChsb2FkZWQuc3RhdHVzID09PSBcInNraXBwZWRcIikgcmV0dXJuIGxvYWRlZDtcbiAgICBjb25zdCBydW50aW1lID0gcmVxdWlyZVBvcnRzKCk7XG4gICAgbGV0IGRyYWZ0O1xuICAgIHRyeSB7XG4gICAgICAgIGRyYWZ0ID0gYXdhaXQgcnVudGltZS5zdW1tYXJpemUobG9hZGVkLm1lc3NhZ2VzLCBsb2FkZWQuaW5wdXQpO1xuICAgIH0gY2F0Y2ggIHtcbiAgICAgICAgdGhyb3cgbmV3IFJldHJ5YWJsZUVycm9yKFwiU1VNTUFSWV9QUk9WSURFUl9VTkFWQUlMQUJMRVwiLCB7XG4gICAgICAgICAgICByZXRyeUFmdGVyOiBcIjMwc1wiXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoIWRyYWZ0IHx8IHR5cGVvZiBkcmFmdC50ZXh0ICE9PSBcInN0cmluZ1wiIHx8IGRyYWZ0LnRleHQudHJpbSgpLmxlbmd0aCA9PT0gMCB8fCBkcmFmdC50ZXh0Lmxlbmd0aCA+IDJfMDAwKSB7XG4gICAgICAgIHRocm93IG5ldyBGYXRhbEVycm9yKFwiU1VNTUFSWV9PVVRQVVRfSU5WQUxJRFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgICAgICBzdGF0dXM6IFwiZHJhZnRcIixcbiAgICAgICAgaW5wdXQ6IGxvYWRlZC5pbnB1dCxcbiAgICAgICAgZHJhZnQ6IE9iamVjdC5mcmVlemUoe1xuICAgICAgICAgICAgLi4uZHJhZnQsXG4gICAgICAgICAgICBjaXRhdGlvbnM6IE9iamVjdC5mcmVlemUoW1xuICAgICAgICAgICAgICAgIC4uLmRyYWZ0LmNpdGF0aW9uc1xuICAgICAgICAgICAgXSlcbiAgICAgICAgfSlcbiAgICB9KTtcbn1cbmZ1bmN0aW9uIGFzc2VydENhbmRpZGF0ZVBvbGljeSh2YWx1ZSkge1xuICAgIGNvbnN0IHVuc2FmZSA9IC9cXGIoPzpkaWFnbm9zKD86ZXxpc3xlZCl8cHJlc2NyaWIoPzplfGluZyl8cHJlc2NyaXB0aW9ufGRvc2FnZXxkb3Npc3x0cmF0YW1pZW50b3x0cmVhdClcXGIvaXU7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZS50ZXh0ICE9PSBcInN0cmluZ1wiIHx8IHZhbHVlLnRleHQudHJpbSgpLmxlbmd0aCA9PT0gMCB8fCB2YWx1ZS50ZXh0Lmxlbmd0aCA+IDJfMDAwIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmNpdGF0aW9ucykgfHwgdmFsdWUuY2l0YXRpb25zLmxlbmd0aCA9PT0gMCB8fCB2YWx1ZS5jaXRhdGlvbnMubGVuZ3RoID4gMTYgfHwgdW5zYWZlLnRlc3QodmFsdWUudGV4dCkpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiU1VNTUFSWV9QT0xJQ1lfUkVKRUNURURcIik7XG4gICAgaWYgKCF2YWx1ZS5jaXRhdGlvbnMuZXZlcnkoKGNpdGF0aW9uKT0+VVVJRC5zYWZlUGFyc2UoY2l0YXRpb24ubWVzc2FnZUlkKS5zdWNjZXNzICYmIE51bWJlci5pc0ludGVnZXIoY2l0YXRpb24uc3RhcnQpICYmIGNpdGF0aW9uLnN0YXJ0ID49IDAgJiYgTnVtYmVyLmlzSW50ZWdlcihjaXRhdGlvbi5lbmQpICYmIGNpdGF0aW9uLmVuZCA+IGNpdGF0aW9uLnN0YXJ0KSkge1xuICAgICAgICB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlNVTU1BUllfQ0lUQVRJT05fSU5WQUxJRFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgICAgICB0ZXh0OiB2YWx1ZS50ZXh0LnRyaW0oKSxcbiAgICAgICAgY2l0YXRpb25zOiBPYmplY3QuZnJlZXplKFtcbiAgICAgICAgICAgIC4uLnZhbHVlLmNpdGF0aW9uc1xuICAgICAgICBdKVxuICAgIH0pO1xufVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZhbGlkYXRlQ2FuZGlkYXRlUG9saWN5KHZhbHVlKSB7XG4gICAgcmV0dXJuIGFzc2VydENhbmRpZGF0ZVBvbGljeSh2YWx1ZSk7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGVyc2lzdENhbmRpZGF0ZXModmFsdWUpIHtcbiAgICBpZiAodmFsdWUuc3RhdHVzID09PSBcInNraXBwZWRcIikgcmV0dXJuIHZhbHVlO1xuICAgIGlmICh2YWx1ZS5zdGF0dXMgIT09IFwiZHJhZnRcIikgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJTVU1NQVJZX0RSQUZUX1JFUVVJUkVEXCIpO1xuICAgIGNvbnN0IHJ1bnRpbWUgPSByZXF1aXJlUG9ydHMoKTtcbiAgICBjb25zdCBkcmFmdCA9IGFzc2VydENhbmRpZGF0ZVBvbGljeSh2YWx1ZS5kcmFmdCk7XG4gICAgbGV0IHBlcnNpc3RlZDtcbiAgICB0cnkge1xuICAgICAgICBwZXJzaXN0ZWQgPSBhd2FpdCBydW50aW1lLnBlcnNpc3RDYW5kaWRhdGUoT2JqZWN0LmZyZWV6ZSh7XG4gICAgICAgICAgICAuLi52YWx1ZS5pbnB1dCxcbiAgICAgICAgICAgIC4uLmRyYWZ0LFxuICAgICAgICAgICAgbGlmZWN5Y2xlOiBcInBlbmRpbmdcIlxuICAgICAgICB9KSk7XG4gICAgfSBjYXRjaCAge1xuICAgICAgICB0aHJvdyBuZXcgUmV0cnlhYmxlRXJyb3IoXCJTVU1NQVJZX1NUT1JBR0VfVU5BVkFJTEFCTEVcIiwge1xuICAgICAgICAgICAgcmV0cnlBZnRlcjogXCIxMHNcIlxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHBlcnNpc3RlZC5vdXRjb21lID09PSBcImNvbmZsaWN0XCIgfHwgIVVVSUQuc2FmZVBhcnNlKHBlcnNpc3RlZC5jYW5kaWRhdGVJZCkuc3VjY2Vzcykge1xuICAgICAgICB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlNVTU1BUllfUkVQTEFZX0NPTkZMSUNUXCIpO1xuICAgIH1cbiAgICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgICAgIHN0YXR1czogXCJwZXJzaXN0ZWRcIixcbiAgICAgICAgb3V0Y29tZTogcGVyc2lzdGVkLm91dGNvbWUsXG4gICAgICAgIGNhbmRpZGF0ZUlkOiBwZXJzaXN0ZWQuY2FuZGlkYXRlSWRcbiAgICB9KTtcbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb252ZXJzYXRpb25TdW1tYXJ5V29ya2Zsb3cocmF3SW5wdXQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJZb3UgYXR0ZW1wdGVkIHRvIGV4ZWN1dGUgd29ya2Zsb3cgY29udmVyc2F0aW9uU3VtbWFyeVdvcmtmbG93IGZ1bmN0aW9uIGRpcmVjdGx5LiBUbyBzdGFydCBhIHdvcmtmbG93LCB1c2Ugc3RhcnQoY29udmVyc2F0aW9uU3VtbWFyeVdvcmtmbG93KSBmcm9tIHdvcmtmbG93L2FwaVwiKTtcbn1cbmNvbnZlcnNhdGlvblN1bW1hcnlXb3JrZmxvdy53b3JrZmxvd0lkID0gXCJ3b3JrZmxvdy8vLi9jb252ZXJzYXRpb24tc3VtbWFyeS8vY29udmVyc2F0aW9uU3VtbWFyeVdvcmtmbG93XCI7XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RhcnRDb252ZXJzYXRpb25TdW1tYXJ5KHJhd0lucHV0LCBzdGFydCkge1xuICAgIGNvbnN0IGlucHV0ID0gcGFyc2VJbnB1dChyYXdJbnB1dCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc3RhcnQoaW5wdXQpO1xuICAgIGlmICghcmVzdWx0IHx8IHR5cGVvZiByZXN1bHQucnVuSWQgIT09IFwic3RyaW5nXCIgfHwgIS9ed3J1bl9bQS1aYS16MC05Ll86LV17MSwxMjd9JC91LnRlc3QocmVzdWx0LnJ1bklkKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTVU1NQVJZX1NUQVJUX0lOVkFMSURcIik7XG4gICAgfVxuICAgIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICAgICAgcnVuSWQ6IHJlc3VsdC5ydW5JZFxuICAgIH0pO1xufVxucmVnaXN0ZXJTdGVwRnVuY3Rpb24oXCJzdGVwLy8uL2NvbnZlcnNhdGlvbi1zdW1tYXJ5Ly9sb2FkRWxpZ2libGVNZXNzYWdlc1wiLCBsb2FkRWxpZ2libGVNZXNzYWdlcyk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vY29udmVyc2F0aW9uLXN1bW1hcnkvL2dlbmVyYXRlQ2FuZGlkYXRlU3VtbWFyeVwiLCBnZW5lcmF0ZUNhbmRpZGF0ZVN1bW1hcnkpO1xucmVnaXN0ZXJTdGVwRnVuY3Rpb24oXCJzdGVwLy8uL2NvbnZlcnNhdGlvbi1zdW1tYXJ5Ly92YWxpZGF0ZUNhbmRpZGF0ZVBvbGljeVwiLCB2YWxpZGF0ZUNhbmRpZGF0ZVBvbGljeSk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vY29udmVyc2F0aW9uLXN1bW1hcnkvL3BlcnNpc3RDYW5kaWRhdGVzXCIsIHBlcnNpc3RDYW5kaWRhdGVzKTtcbiIsICJpbXBvcnQgeyByZWdpc3RlclN0ZXBGdW5jdGlvbiB9IGZyb20gXCJ3b3JrZmxvdy9pbnRlcm5hbC9wcml2YXRlXCI7XG5pbXBvcnQgeyBGYXRhbEVycm9yLCBSZXRyeWFibGVFcnJvciB9IGZyb20gXCJ3b3JrZmxvd1wiO1xuLyoqX19pbnRlcm5hbF93b3JrZmxvd3N7XCJ3b3JrZmxvd3NcIjp7XCJkb2N1bWVudC1wcm9jZXNzaW5nLnRzXCI6e1wiZG9jdW1lbnRQcm9jZXNzaW5nV29ya2Zsb3dcIjp7XCJ3b3JrZmxvd0lkXCI6XCJ3b3JrZmxvdy8vLi9kb2N1bWVudC1wcm9jZXNzaW5nLy9kb2N1bWVudFByb2Nlc3NpbmdXb3JrZmxvd1wifX19LFwic3RlcHNcIjp7XCJkb2N1bWVudC1wcm9jZXNzaW5nLnRzXCI6e1wiY2xlYW51cFwiOntcInN0ZXBJZFwiOlwic3RlcC8vLi9kb2N1bWVudC1wcm9jZXNzaW5nLy9jbGVhbnVwXCJ9LFwiZXh0cmFjdERyYWZ0XCI6e1wic3RlcElkXCI6XCJzdGVwLy8uL2RvY3VtZW50LXByb2Nlc3NpbmcvL2V4dHJhY3REcmFmdFwifSxcImZpbmFsaXplXCI6e1wic3RlcElkXCI6XCJzdGVwLy8uL2RvY3VtZW50LXByb2Nlc3NpbmcvL2ZpbmFsaXplXCJ9LFwicGVyc2lzdERyYWZ0XCI6e1wic3RlcElkXCI6XCJzdGVwLy8uL2RvY3VtZW50LXByb2Nlc3NpbmcvL3BlcnNpc3REcmFmdFwifSxcInF1YXJhbnRpbmVcIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vZG9jdW1lbnQtcHJvY2Vzc2luZy8vcXVhcmFudGluZVwifSxcInNjYW5PYmplY3RcIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vZG9jdW1lbnQtcHJvY2Vzc2luZy8vc2Nhbk9iamVjdFwifSxcInZlcmlmeU9iamVjdFwiOntcInN0ZXBJZFwiOlwic3RlcC8vLi9kb2N1bWVudC1wcm9jZXNzaW5nLy92ZXJpZnlPYmplY3RcIn19fX0qLztcbmxldCBwb3J0cyA9IG51bGw7XG5leHBvcnQgZnVuY3Rpb24gY29uZmlndXJlRG9jdW1lbnRQcm9jZXNzaW5nUG9ydHModmFsdWUpIHtcbiAgICBwb3J0cyA9IHZhbHVlO1xufVxuZnVuY3Rpb24gcnVudGltZSgpIHtcbiAgICBpZiAoIXBvcnRzKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIkRPQ1VNRU5UX1BST0NFU1NJTkdfUlVOVElNRV9VTkNPTkZJR1VSRURcIik7XG4gICAgcmV0dXJuIHBvcnRzO1xufVxuZnVuY3Rpb24gdmFsaWRJbnB1dChpbnB1dCkge1xuICAgIHJldHVybiBPYmplY3QudmFsdWVzKGlucHV0KS5ldmVyeSgodmFsdWUpPT50eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIgJiYgdmFsdWUubGVuZ3RoID4gMCAmJiB2YWx1ZS5sZW5ndGggPD0gNTEyKSAmJiAvXlthLWYwLTldezY0fSQvdS50ZXN0KGlucHV0Lm9iamVjdFNoYTI1NikgJiYgaW5wdXQucHVycG9zZSAhPT0gdW5kZWZpbmVkO1xufVxuZnVuY3Rpb24gdmFsaWRPYmplY3QoaW5wdXQsIG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QuZG9jdW1lbnRJZCA9PT0gaW5wdXQuZG9jdW1lbnRJZCAmJiBvYmplY3Qub2JqZWN0U2hhMjU2ID09PSBpbnB1dC5vYmplY3RTaGEyNTYgJiYgb2JqZWN0Lm9iamVjdFZlcnNpb24ubGVuZ3RoID4gMCAmJiBOdW1iZXIuaXNJbnRlZ2VyKG9iamVjdC5zaXplQnl0ZXMpICYmIG9iamVjdC5zaXplQnl0ZXMgPiAwICYmIG9iamVjdC5zaXplQnl0ZXMgPD0gNTJfNDI4XzgwMDtcbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB2ZXJpZnlPYmplY3QoaW5wdXQpIHtcbiAgICBpZiAoIXZhbGlkSW5wdXQoaW5wdXQpKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIkRPQ1VNRU5UX1BST0NFU1NJTkdfSU5WQUxJRF9JTlBVVFwiKTtcbiAgICBsZXQgb2JqZWN0O1xuICAgIHRyeSB7XG4gICAgICAgIG9iamVjdCA9IGF3YWl0IHJ1bnRpbWUoKS52ZXJpZnlPYmplY3QoaW5wdXQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEZhdGFsRXJyb3IpIHRocm93IGVycm9yO1xuICAgICAgICB0aHJvdyBuZXcgUmV0cnlhYmxlRXJyb3IoXCJET0NVTUVOVF9QUk9DRVNTSU5HX09CSkVDVF9VTkFWQUlMQUJMRVwiLCB7XG4gICAgICAgICAgICByZXRyeUFmdGVyOiBcIjEwc1wiXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoIXZhbGlkT2JqZWN0KGlucHV0LCBvYmplY3QpKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIkRPQ1VNRU5UX1BST0NFU1NJTkdfT0JKRUNUX01JU01BVENIXCIpO1xuICAgIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICAgICAgLi4ub2JqZWN0XG4gICAgfSk7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2Nhbk9iamVjdChpbnB1dCwgb2JqZWN0KSB7XG4gICAgaWYgKCF2YWxpZElucHV0KGlucHV0KSB8fCAhdmFsaWRPYmplY3QoaW5wdXQsIG9iamVjdCkpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiRE9DVU1FTlRfUFJPQ0VTU0lOR19TQ0FOX0lOVkFMSURcIik7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHJ1bnRpbWUoKS5zY2FuT2JqZWN0KGlucHV0LCBvYmplY3QpO1xuICAgIH0gY2F0Y2ggIHtcbiAgICAgICAgdGhyb3cgbmV3IFJldHJ5YWJsZUVycm9yKFwiRE9DVU1FTlRfUFJPQ0VTU0lOR19TQ0FOTkVSX1VOQVZBSUxBQkxFXCIsIHtcbiAgICAgICAgICAgIHJldHJ5QWZ0ZXI6IFwiMzBzXCJcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4dHJhY3REcmFmdChpbnB1dCwgb2JqZWN0KSB7XG4gICAgaWYgKCF2YWxpZElucHV0KGlucHV0KSB8fCAhdmFsaWRPYmplY3QoaW5wdXQsIG9iamVjdCkpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiRE9DVU1FTlRfUFJPQ0VTU0lOR19FWFRSQUNUSU9OX0lOVkFMSURcIik7XG4gICAgbGV0IGRyYWZ0O1xuICAgIHRyeSB7XG4gICAgICAgIGRyYWZ0ID0gYXdhaXQgcnVudGltZSgpLmV4dHJhY3REcmFmdChpbnB1dCwgb2JqZWN0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBGYXRhbEVycm9yKSB0aHJvdyBlcnJvcjtcbiAgICAgICAgdGhyb3cgbmV3IFJldHJ5YWJsZUVycm9yKFwiRE9DVU1FTlRfUFJPQ0VTU0lOR19FWFRSQUNUT1JfVU5BVkFJTEFCTEVcIiwge1xuICAgICAgICAgICAgcmV0cnlBZnRlcjogXCIzMHNcIlxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKCFkcmFmdC51bnRydXN0ZWQgfHwgIWRyYWZ0LmNvbmZpcm1hdGlvblJlcXVpcmVkIHx8ICEvXlthLWYwLTldezY0fSQvdS50ZXN0KGRyYWZ0Lm91dHB1dFNoYTI1NikgfHwgZHJhZnQuZHJhZnRJZC5sZW5ndGggPT09IDAgfHwgIU51bWJlci5pc0ludGVnZXIoZHJhZnQuY2FuZGlkYXRlQ291bnQpIHx8IGRyYWZ0LmNhbmRpZGF0ZUNvdW50IDwgMCB8fCBkcmFmdC5jYW5kaWRhdGVDb3VudCA+IDIwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIkRPQ1VNRU5UX1BST0NFU1NJTkdfRFJBRlRfSU5WQUxJRFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgICAgICAuLi5kcmFmdCxcbiAgICAgICAgdW50cnVzdGVkOiB0cnVlLFxuICAgICAgICBjb25maXJtYXRpb25SZXF1aXJlZDogdHJ1ZVxuICAgIH0pO1xufVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBlcnNpc3REcmFmdChpbnB1dCwgb2JqZWN0LCBkcmFmdCkge1xuICAgIGlmICghdmFsaWRJbnB1dChpbnB1dCkgfHwgIXZhbGlkT2JqZWN0KGlucHV0LCBvYmplY3QpIHx8ICFkcmFmdC51bnRydXN0ZWQgfHwgIWRyYWZ0LmNvbmZpcm1hdGlvblJlcXVpcmVkKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIkRPQ1VNRU5UX1BST0NFU1NJTkdfUEVSU0lTVF9JTlZBTElEXCIpO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCBydW50aW1lKCkucGVyc2lzdERyYWZ0KGlucHV0LCBvYmplY3QsIGRyYWZ0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBGYXRhbEVycm9yKSB0aHJvdyBlcnJvcjtcbiAgICAgICAgdGhyb3cgbmV3IFJldHJ5YWJsZUVycm9yKFwiRE9DVU1FTlRfUFJPQ0VTU0lOR19QRVJTSVNUX1VOQVZBSUxBQkxFXCIsIHtcbiAgICAgICAgICAgIHJldHJ5QWZ0ZXI6IFwiMTBzXCJcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZpbmFsaXplKGlucHV0LCBvYmplY3QsIGRyYWZ0KSB7XG4gICAgaWYgKCF2YWxpZElucHV0KGlucHV0KSB8fCAhdmFsaWRPYmplY3QoaW5wdXQsIG9iamVjdCkgfHwgIWRyYWZ0LnVudHJ1c3RlZCB8fCAhZHJhZnQuY29uZmlybWF0aW9uUmVxdWlyZWQpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiRE9DVU1FTlRfUFJPQ0VTU0lOR19GSU5BTElaRV9JTlZBTElEXCIpO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCBydW50aW1lKCkuZmluYWxpemUoaW5wdXQsIG9iamVjdCwgZHJhZnQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEZhdGFsRXJyb3IpIHRocm93IGVycm9yO1xuICAgICAgICB0aHJvdyBuZXcgUmV0cnlhYmxlRXJyb3IoXCJET0NVTUVOVF9QUk9DRVNTSU5HX0ZJTkFMSVpFX1VOQVZBSUxBQkxFXCIsIHtcbiAgICAgICAgICAgIHJldHJ5QWZ0ZXI6IFwiMTBzXCJcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHF1YXJhbnRpbmUoaW5wdXQsIG9iamVjdCwgcmVhc29uKSB7XG4gICAgaWYgKCF2YWxpZElucHV0KGlucHV0KSB8fCAhdmFsaWRPYmplY3QoaW5wdXQsIG9iamVjdCkpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiRE9DVU1FTlRfUFJPQ0VTU0lOR19RVUFSQU5USU5FX0lOVkFMSURcIik7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHJ1bnRpbWUoKS5xdWFyYW50aW5lKGlucHV0LCBvYmplY3QsIHJlYXNvbik7XG4gICAgfSBjYXRjaCAge1xuICAgICAgICB0aHJvdyBuZXcgUmV0cnlhYmxlRXJyb3IoXCJET0NVTUVOVF9QUk9DRVNTSU5HX1FVQVJBTlRJTkVfVU5BVkFJTEFCTEVcIiwge1xuICAgICAgICAgICAgcmV0cnlBZnRlcjogXCIzMHNcIlxuICAgICAgICB9KTtcbiAgICB9XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xlYW51cChpbnB1dCwgb2JqZWN0KSB7XG4gICAgaWYgKCF2YWxpZElucHV0KGlucHV0KSB8fCAhdmFsaWRPYmplY3QoaW5wdXQsIG9iamVjdCkpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiRE9DVU1FTlRfUFJPQ0VTU0lOR19DTEVBTlVQX0lOVkFMSURcIik7XG4gICAgYXdhaXQgcnVudGltZSgpLmNsZWFudXAoaW5wdXQsIG9iamVjdCk7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZG9jdW1lbnRQcm9jZXNzaW5nV29ya2Zsb3coaW5wdXQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJZb3UgYXR0ZW1wdGVkIHRvIGV4ZWN1dGUgd29ya2Zsb3cgZG9jdW1lbnRQcm9jZXNzaW5nV29ya2Zsb3cgZnVuY3Rpb24gZGlyZWN0bHkuIFRvIHN0YXJ0IGEgd29ya2Zsb3csIHVzZSBzdGFydChkb2N1bWVudFByb2Nlc3NpbmdXb3JrZmxvdykgZnJvbSB3b3JrZmxvdy9hcGlcIik7XG59XG5kb2N1bWVudFByb2Nlc3NpbmdXb3JrZmxvdy53b3JrZmxvd0lkID0gXCJ3b3JrZmxvdy8vLi9kb2N1bWVudC1wcm9jZXNzaW5nLy9kb2N1bWVudFByb2Nlc3NpbmdXb3JrZmxvd1wiO1xucmVnaXN0ZXJTdGVwRnVuY3Rpb24oXCJzdGVwLy8uL2RvY3VtZW50LXByb2Nlc3NpbmcvL3ZlcmlmeU9iamVjdFwiLCB2ZXJpZnlPYmplY3QpO1xucmVnaXN0ZXJTdGVwRnVuY3Rpb24oXCJzdGVwLy8uL2RvY3VtZW50LXByb2Nlc3NpbmcvL3NjYW5PYmplY3RcIiwgc2Nhbk9iamVjdCk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vZG9jdW1lbnQtcHJvY2Vzc2luZy8vZXh0cmFjdERyYWZ0XCIsIGV4dHJhY3REcmFmdCk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vZG9jdW1lbnQtcHJvY2Vzc2luZy8vcGVyc2lzdERyYWZ0XCIsIHBlcnNpc3REcmFmdCk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vZG9jdW1lbnQtcHJvY2Vzc2luZy8vZmluYWxpemVcIiwgZmluYWxpemUpO1xucmVnaXN0ZXJTdGVwRnVuY3Rpb24oXCJzdGVwLy8uL2RvY3VtZW50LXByb2Nlc3NpbmcvL3F1YXJhbnRpbmVcIiwgcXVhcmFudGluZSk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vZG9jdW1lbnQtcHJvY2Vzc2luZy8vY2xlYW51cFwiLCBjbGVhbnVwKTtcbiIsICJpbXBvcnQgeyByZWdpc3RlclN0ZXBGdW5jdGlvbiB9IGZyb20gXCJ3b3JrZmxvdy9pbnRlcm5hbC9wcml2YXRlXCI7XG5pbXBvcnQgeyBGYXRhbEVycm9yLCBSZXRyeWFibGVFcnJvciB9IGZyb20gXCJ3b3JrZmxvd1wiO1xuLyoqX19pbnRlcm5hbF93b3JrZmxvd3N7XCJ3b3JrZmxvd3NcIjp7XCJtZW1vcnktZW1iZWRkaW5nLnRzXCI6e1wibWVtb3J5RW1iZWRkaW5nV29ya2Zsb3dcIjp7XCJ3b3JrZmxvd0lkXCI6XCJ3b3JrZmxvdy8vLi9tZW1vcnktZW1iZWRkaW5nLy9tZW1vcnlFbWJlZGRpbmdXb3JrZmxvd1wifX19LFwic3RlcHNcIjp7XCJtZW1vcnktZW1iZWRkaW5nLnRzXCI6e1wiZW1iZWRNZW1vcnlcIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vbWVtb3J5LWVtYmVkZGluZy8vZW1iZWRNZW1vcnlcIn0sXCJsb2FkRWxpZ2liaWxpdHlcIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vbWVtb3J5LWVtYmVkZGluZy8vbG9hZEVsaWdpYmlsaXR5XCJ9LFwicGVyc2lzdEVtYmVkZGluZ1wiOntcInN0ZXBJZFwiOlwic3RlcC8vLi9tZW1vcnktZW1iZWRkaW5nLy9wZXJzaXN0RW1iZWRkaW5nXCJ9LFwicmVtb3ZlRW1iZWRkaW5nXCI6e1wic3RlcElkXCI6XCJzdGVwLy8uL21lbW9yeS1lbWJlZGRpbmcvL3JlbW92ZUVtYmVkZGluZ1wifX19fSovO1xubGV0IHBvcnRzID0gbnVsbDtcbmV4cG9ydCBmdW5jdGlvbiBjb25maWd1cmVNZW1vcnlFbWJlZGRpbmdQb3J0cyh2YWx1ZSkge1xuICAgIHBvcnRzID0gdmFsdWU7XG59XG5mdW5jdGlvbiBydW50aW1lKCkge1xuICAgIGlmICghcG9ydHMpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiTUVNT1JZX0VNQkVERElOR19SVU5USU1FX1VOQ09ORklHVVJFRFwiKTtcbiAgICByZXR1cm4gcG9ydHM7XG59XG5mdW5jdGlvbiB2YWxpZElucHV0KHZhbHVlKSB7XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXModmFsdWUpLmV2ZXJ5KChpdGVtKT0+dHlwZW9mIGl0ZW0gPT09IFwic3RyaW5nXCIgJiYgaXRlbS5sZW5ndGggPiAwICYmIGl0ZW0ubGVuZ3RoIDw9IDUxMikgJiYgL15bYS1mMC05XXs2NH0kL3UudGVzdCh2YWx1ZS5jb250ZW50U2hhMjU2KSAmJiAodmFsdWUub3BlcmF0aW9uID09PSBcInVwc2VydFwiIHx8IHZhbHVlLm9wZXJhdGlvbiA9PT0gXCJyZW1vdmVcIik7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZEVsaWdpYmlsaXR5KGlucHV0KSB7XG4gICAgaWYgKCF2YWxpZElucHV0KGlucHV0KSkgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJNRU1PUllfRU1CRURESU5HX0lOVkFMSURfSU5QVVRcIik7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHJ1bnRpbWUoKS5sb2FkRWxpZ2liaWxpdHkoaW5wdXQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEZhdGFsRXJyb3IpIHRocm93IGVycm9yO1xuICAgICAgICB0aHJvdyBuZXcgUmV0cnlhYmxlRXJyb3IoXCJNRU1PUllfRU1CRURESU5HX1NPVVJDRV9VTkFWQUlMQUJMRVwiLCB7XG4gICAgICAgICAgICByZXRyeUFmdGVyOiBcIjEwc1wiXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBlbWJlZE1lbW9yeShpbnB1dCwgZWxpZ2liaWxpdHkpIHtcbiAgICBpZiAoIXZhbGlkSW5wdXQoaW5wdXQpIHx8ICFlbGlnaWJpbGl0eS5lbGlnaWJsZSB8fCBlbGlnaWJpbGl0eS5jb250ZW50U2hhMjU2ICE9PSBpbnB1dC5jb250ZW50U2hhMjU2KSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIk1FTU9SWV9FTUJFRERJTkdfTk9UX0VMSUdJQkxFXCIpO1xuICAgIGlmIChlbGlnaWJpbGl0eS5zZWFyY2hhYmxlVGV4dC5sZW5ndGggPT09IDAgfHwgZWxpZ2liaWxpdHkuc2VhcmNoYWJsZVRleHQubGVuZ3RoID4gOF8wMDApIHRocm93IG5ldyBGYXRhbEVycm9yKFwiTUVNT1JZX0VNQkVERElOR19URVhUX0lOVkFMSURcIik7XG4gICAgbGV0IHJlc3VsdDtcbiAgICB0cnkge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCBydW50aW1lKCkuZW1iZWRNZW1vcnkoZWxpZ2liaWxpdHkuc2VhcmNoYWJsZVRleHQsIGlucHV0LmNvbXBhdGliaWxpdHlWZXJzaW9uKTtcbiAgICB9IGNhdGNoICB7XG4gICAgICAgIHRocm93IG5ldyBSZXRyeWFibGVFcnJvcihcIk1FTU9SWV9FTUJFRERJTkdfUFJPVklERVJfVU5BVkFJTEFCTEVcIiwge1xuICAgICAgICAgICAgcmV0cnlBZnRlcjogXCIzMHNcIlxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHJlc3VsdC52ZWN0b3IpIHx8IHJlc3VsdC52ZWN0b3IubGVuZ3RoICE9PSA3NjggfHwgcmVzdWx0LnZlY3Rvci5zb21lKCh2YWx1ZSk9PiFOdW1iZXIuaXNGaW5pdGUodmFsdWUpKSB8fCAhL15bYS1mMC05XXs2NH0kL3UudGVzdChyZXN1bHQudmVjdG9yU2hhMjU2KSB8fCAhL15bYS1mMC05XXs2NH0kL3UudGVzdChyZXN1bHQuaW5wdXRTaGEyNTYpKSB7XG4gICAgICAgIHRocm93IG5ldyBGYXRhbEVycm9yKFwiTUVNT1JZX0VNQkVERElOR19SRVNVTFRfSU5WQUxJRFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgICAgICB2ZWN0b3I6IE9iamVjdC5mcmVlemUoW1xuICAgICAgICAgICAgLi4ucmVzdWx0LnZlY3RvclxuICAgICAgICBdKSxcbiAgICAgICAgdmVjdG9yU2hhMjU2OiByZXN1bHQudmVjdG9yU2hhMjU2LFxuICAgICAgICBpbnB1dFNoYTI1NjogcmVzdWx0LmlucHV0U2hhMjU2XG4gICAgfSk7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGVyc2lzdEVtYmVkZGluZyhpbnB1dCwgZW1iZWRkaW5nKSB7XG4gICAgaWYgKCF2YWxpZElucHV0KGlucHV0KSB8fCBpbnB1dC5vcGVyYXRpb24gIT09IFwidXBzZXJ0XCIpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiTUVNT1JZX0VNQkVERElOR19JTlZBTElEX09QRVJBVElPTlwiKTtcbiAgICBjb25zdCBvdXRjb21lID0gYXdhaXQgcnVudGltZSgpLnBlcnNpc3RFbWJlZGRpbmcoaW5wdXQsIGVtYmVkZGluZyk7XG4gICAgaWYgKG91dGNvbWUgPT09IFwiY29uZmxpY3RcIikgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJNRU1PUllfRU1CRURESU5HX1JFUExBWV9DT05GTElDVFwiKTtcbiAgICByZXR1cm4gb3V0Y29tZTtcbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZW1vdmVFbWJlZGRpbmcoaW5wdXQpIHtcbiAgICBpZiAoIXZhbGlkSW5wdXQoaW5wdXQpIHx8IGlucHV0Lm9wZXJhdGlvbiAhPT0gXCJyZW1vdmVcIikgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJNRU1PUllfRU1CRURESU5HX0lOVkFMSURfT1BFUkFUSU9OXCIpO1xuICAgIHJldHVybiBydW50aW1lKCkucmVtb3ZlRW1iZWRkaW5nKGlucHV0KTtcbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtZW1vcnlFbWJlZGRpbmdXb3JrZmxvdyhpbnB1dCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIllvdSBhdHRlbXB0ZWQgdG8gZXhlY3V0ZSB3b3JrZmxvdyBtZW1vcnlFbWJlZGRpbmdXb3JrZmxvdyBmdW5jdGlvbiBkaXJlY3RseS4gVG8gc3RhcnQgYSB3b3JrZmxvdywgdXNlIHN0YXJ0KG1lbW9yeUVtYmVkZGluZ1dvcmtmbG93KSBmcm9tIHdvcmtmbG93L2FwaVwiKTtcbn1cbm1lbW9yeUVtYmVkZGluZ1dvcmtmbG93LndvcmtmbG93SWQgPSBcIndvcmtmbG93Ly8uL21lbW9yeS1lbWJlZGRpbmcvL21lbW9yeUVtYmVkZGluZ1dvcmtmbG93XCI7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vbWVtb3J5LWVtYmVkZGluZy8vbG9hZEVsaWdpYmlsaXR5XCIsIGxvYWRFbGlnaWJpbGl0eSk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vbWVtb3J5LWVtYmVkZGluZy8vZW1iZWRNZW1vcnlcIiwgZW1iZWRNZW1vcnkpO1xucmVnaXN0ZXJTdGVwRnVuY3Rpb24oXCJzdGVwLy8uL21lbW9yeS1lbWJlZGRpbmcvL3BlcnNpc3RFbWJlZGRpbmdcIiwgcGVyc2lzdEVtYmVkZGluZyk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vbWVtb3J5LWVtYmVkZGluZy8vcmVtb3ZlRW1iZWRkaW5nXCIsIHJlbW92ZUVtYmVkZGluZyk7XG4iLCAiaW1wb3J0IHsgcmVnaXN0ZXJTdGVwRnVuY3Rpb24gfSBmcm9tIFwid29ya2Zsb3cvaW50ZXJuYWwvcHJpdmF0ZVwiO1xuaW1wb3J0IHsgRmF0YWxFcnJvciwgUmV0cnlhYmxlRXJyb3IgfSBmcm9tIFwid29ya2Zsb3dcIjtcbi8qKl9faW50ZXJuYWxfd29ya2Zsb3dze1wid29ya2Zsb3dzXCI6e1wicmV0ZW50aW9uLWNsZWFudXAudHNcIjp7XCJyZXRlbnRpb25DbGVhbnVwV29ya2Zsb3dcIjp7XCJ3b3JrZmxvd0lkXCI6XCJ3b3JrZmxvdy8vLi9yZXRlbnRpb24tY2xlYW51cC8vcmV0ZW50aW9uQ2xlYW51cFdvcmtmbG93XCJ9fX0sXCJzdGVwc1wiOntcInJldGVudGlvbi1jbGVhbnVwLnRzXCI6e1wiZWZmZWN0U3RlcFwiOntcInN0ZXBJZFwiOlwic3RlcC8vLi9yZXRlbnRpb24tY2xlYW51cC8vZWZmZWN0U3RlcFwifSxcImZpbmFsaXplRXZpZGVuY2VcIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vcmV0ZW50aW9uLWNsZWFudXAvL2ZpbmFsaXplRXZpZGVuY2VcIn0sXCJsb2FkQXV0aG9yaXplZFJlcXVlc3RcIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vcmV0ZW50aW9uLWNsZWFudXAvL2xvYWRBdXRob3JpemVkUmVxdWVzdFwifSxcInJldm9rZUVsaWdpYmlsaXR5XCI6e1wic3RlcElkXCI6XCJzdGVwLy8uL3JldGVudGlvbi1jbGVhbnVwLy9yZXZva2VFbGlnaWJpbGl0eVwifSxcInZlcmlmeUNsb3N1cmVcIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vcmV0ZW50aW9uLWNsZWFudXAvL3ZlcmlmeUNsb3N1cmVcIn19fX0qLztcbmxldCBwb3J0cyA9IG51bGw7XG5leHBvcnQgZnVuY3Rpb24gY29uZmlndXJlUmV0ZW50aW9uQ2xlYW51cFBvcnRzKHZhbHVlKSB7XG4gICAgcG9ydHMgPSB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHJ1bnRpbWUoKSB7XG4gICAgaWYgKCFwb3J0cykgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJSRVRFTlRJT05fQ0xFQU5VUF9SVU5USU1FX1VOQ09ORklHVVJFRFwiKTtcbiAgICByZXR1cm4gcG9ydHM7XG59XG5mdW5jdGlvbiB2YWxpZElucHV0KGlucHV0KSB7XG4gICAgcmV0dXJuIE9iamVjdC52YWx1ZXMoaW5wdXQpLmV2ZXJ5KCh2YWx1ZSk9PnR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIiAmJiB2YWx1ZS5sZW5ndGggPiAwICYmIHZhbHVlLmxlbmd0aCA8PSA1MTIpICYmIC9eW2EtZjAtOV17NjR9JC91LnRlc3QoaW5wdXQucmVxdWVzdFNoYTI1Nik7XG59XG5mdW5jdGlvbiB2YWxpZEF1dGhvcml6YXRpb24oaW5wdXQsIGF1dGhvcml6YXRpb24pIHtcbiAgICByZXR1cm4gYXV0aG9yaXphdGlvbi5yZXF1ZXN0SWQgPT09IGlucHV0LnJlcXVlc3RJZCAmJiBhdXRob3JpemF0aW9uLm1lbW9yeUl0ZW1JZCA9PT0gaW5wdXQubWVtb3J5SXRlbUlkICYmIGF1dGhvcml6YXRpb24uY2FyZVNwYWNlSWQgPT09IGlucHV0LmNhcmVTcGFjZUlkICYmIGF1dGhvcml6YXRpb24uY2hpbGRJZCA9PT0gaW5wdXQuY2hpbGRJZCAmJiBhdXRob3JpemF0aW9uLnJlc291cmNlVmVyc2lvbi5sZW5ndGggPiAwICYmIChhdXRob3JpemF0aW9uLnN0YXR1cyA9PT0gXCJwZW5kaW5nXCIgfHwgYXV0aG9yaXphdGlvbi5zdGF0dXMgPT09IFwiY29tcGxldGVkXCIgfHwgYXV0aG9yaXphdGlvbi5zdGF0dXMgPT09IFwibGVnYWxfaG9sZFwiKSAmJiBhdXRob3JpemF0aW9uLmxlZ2FsSG9sZCA9PT0gKGF1dGhvcml6YXRpb24uc3RhdHVzID09PSBcImxlZ2FsX2hvbGRcIik7XG59XG5mdW5jdGlvbiB2YWxpZFBsYW4ocGxhbikge1xuICAgIHJldHVybiAvXlthLWYwLTldezY0fSQvdS50ZXN0KHBsYW4ucGxhblNoYTI1NikgJiYgT2JqZWN0LnZhbHVlcyhwbGFuKS5maWx0ZXIoKHZhbHVlKT0+dHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiKS5ldmVyeSgodmFsdWUpPT5OdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+PSAwICYmIHZhbHVlIDw9IDEwMF8wMDApO1xufVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRBdXRob3JpemVkUmVxdWVzdChpbnB1dCkge1xuICAgIGlmICghdmFsaWRJbnB1dChpbnB1dCkpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiUkVURU5USU9OX0NMRUFOVVBfSU5WQUxJRF9JTlBVVFwiKTtcbiAgICBsZXQgYXV0aG9yaXphdGlvbjtcbiAgICB0cnkge1xuICAgICAgICBhdXRob3JpemF0aW9uID0gYXdhaXQgcnVudGltZSgpLmxvYWRBdXRob3JpemVkUmVxdWVzdChpbnB1dCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRmF0YWxFcnJvcikgdGhyb3cgZXJyb3I7XG4gICAgICAgIHRocm93IG5ldyBSZXRyeWFibGVFcnJvcihcIlJFVEVOVElPTl9DTEVBTlVQX0FVVEhPUklaQVRJT05fVU5BVkFJTEFCTEVcIiwge1xuICAgICAgICAgICAgcmV0cnlBZnRlcjogXCIxMHNcIlxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKCF2YWxpZEF1dGhvcml6YXRpb24oaW5wdXQsIGF1dGhvcml6YXRpb24pKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlJFVEVOVElPTl9DTEVBTlVQX1NDT1BFX0lOVkFMSURcIik7XG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgICAgICAuLi5hdXRob3JpemF0aW9uXG4gICAgfSk7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmV2b2tlRWxpZ2liaWxpdHkoaW5wdXQsIGF1dGhvcml6YXRpb24pIHtcbiAgICBpZiAoIXZhbGlkSW5wdXQoaW5wdXQpIHx8ICF2YWxpZEF1dGhvcml6YXRpb24oaW5wdXQsIGF1dGhvcml6YXRpb24pIHx8IGF1dGhvcml6YXRpb24uc3RhdHVzICE9PSBcInBlbmRpbmdcIiB8fCBhdXRob3JpemF0aW9uLmxlZ2FsSG9sZCkgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJSRVRFTlRJT05fQ0xFQU5VUF9SRVZPQ0FUSU9OX0lOVkFMSURcIik7XG4gICAgbGV0IHBsYW47XG4gICAgdHJ5IHtcbiAgICAgICAgcGxhbiA9IGF3YWl0IHJ1bnRpbWUoKS5yZXZva2VFbGlnaWJpbGl0eShpbnB1dCwgYXV0aG9yaXphdGlvbik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRmF0YWxFcnJvcikgdGhyb3cgZXJyb3I7XG4gICAgICAgIHRocm93IG5ldyBSZXRyeWFibGVFcnJvcihcIlJFVEVOVElPTl9DTEVBTlVQX1JFVk9DQVRJT05fVU5BVkFJTEFCTEVcIiwge1xuICAgICAgICAgICAgcmV0cnlBZnRlcjogXCIxMHNcIlxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKCF2YWxpZFBsYW4ocGxhbikpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiUkVURU5USU9OX0NMRUFOVVBfUExBTl9JTlZBTElEXCIpO1xuICAgIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICAgICAgLi4ucGxhblxuICAgIH0pO1xufVxuYXN5bmMgZnVuY3Rpb24gZWZmZWN0U3RlcChuYW1lLCBpbnB1dCwgcGxhbikge1xuICAgIGlmICghdmFsaWRJbnB1dChpbnB1dCkgfHwgIXZhbGlkUGxhbihwbGFuKSkgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJSRVRFTlRJT05fQ0xFQU5VUF9FRkZFQ1RfSU5WQUxJRFwiKTtcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBydW50aW1lKClbbmFtZV0oaW5wdXQsIHBsYW4pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEZhdGFsRXJyb3IpIHRocm93IGVycm9yO1xuICAgICAgICB0aHJvdyBuZXcgUmV0cnlhYmxlRXJyb3IoYFJFVEVOVElPTl9DTEVBTlVQXyR7bmFtZS50b1VwcGVyQ2FzZSgpfV9VTkFWQUlMQUJMRWAsIHtcbiAgICAgICAgICAgIHJldHJ5QWZ0ZXI6IFwiMzBzXCJcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0IGNvbnN0IGRlbGV0ZVZlY3RvcnMgPSAoaW5wdXQsIHBsYW4pPT5lZmZlY3RTdGVwKFwiZGVsZXRlVmVjdG9yc1wiLCBpbnB1dCwgcGxhbik7XG5leHBvcnQgY29uc3QgZGVsZXRlT2JqZWN0cyA9IChpbnB1dCwgcGxhbik9PmVmZmVjdFN0ZXAoXCJkZWxldGVPYmplY3RzXCIsIGlucHV0LCBwbGFuKTtcbmV4cG9ydCBjb25zdCBkZWxldGVSb3dzID0gKGlucHV0LCBwbGFuKT0+ZWZmZWN0U3RlcChcImRlbGV0ZVJvd3NcIiwgaW5wdXQsIHBsYW4pO1xuZXhwb3J0IGNvbnN0IHB1cmdlQ2FjaGVzID0gKGlucHV0LCBwbGFuKT0+ZWZmZWN0U3RlcChcInB1cmdlQ2FjaGVzXCIsIGlucHV0LCBwbGFuKTtcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB2ZXJpZnlDbG9zdXJlKGlucHV0LCBwbGFuKSB7XG4gICAgaWYgKCF2YWxpZElucHV0KGlucHV0KSB8fCAhdmFsaWRQbGFuKHBsYW4pKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlJFVEVOVElPTl9DTEVBTlVQX0NMT1NVUkVfSU5WQUxJRFwiKTtcbiAgICBsZXQgcmVzdWx0O1xuICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHJ1bnRpbWUoKS52ZXJpZnlDbG9zdXJlKGlucHV0LCBwbGFuKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBGYXRhbEVycm9yKSB0aHJvdyBlcnJvcjtcbiAgICAgICAgdGhyb3cgbmV3IFJldHJ5YWJsZUVycm9yKFwiUkVURU5USU9OX0NMRUFOVVBfQ0xPU1VSRV9VTkFWQUlMQUJMRVwiLCB7XG4gICAgICAgICAgICByZXRyeUFmdGVyOiBcIjMwc1wiXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIocmVzdWx0Lm9ycGhhbkNvdW50KSB8fCByZXN1bHQub3JwaGFuQ291bnQgPCAwIHx8ICEvXlthLWYwLTldezY0fSQvdS50ZXN0KHJlc3VsdC5wcm9vZlNoYTI1NikpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiUkVURU5USU9OX0NMRUFOVVBfUFJPT0ZfSU5WQUxJRFwiKTtcbiAgICBpZiAocmVzdWx0Lm9ycGhhbkNvdW50ID4gMCkgdGhyb3cgbmV3IFJldHJ5YWJsZUVycm9yKFwiUkVURU5USU9OX0NMRUFOVVBfQ0xPU1VSRV9JTkNPTVBMRVRFXCIsIHtcbiAgICAgICAgcmV0cnlBZnRlcjogXCIzMHNcIlxuICAgIH0pO1xuICAgIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICAgICAgLi4ucmVzdWx0XG4gICAgfSk7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmluYWxpemVFdmlkZW5jZShpbnB1dCwgcGxhbiwgcHJvb2YpIHtcbiAgICBpZiAoIXZhbGlkSW5wdXQoaW5wdXQpIHx8ICF2YWxpZFBsYW4ocGxhbikgfHwgcHJvb2Yub3JwaGFuQ291bnQgIT09IDAgfHwgIS9eW2EtZjAtOV17NjR9JC91LnRlc3QocHJvb2YucHJvb2ZTaGEyNTYpKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlJFVEVOVElPTl9DTEVBTlVQX0VWSURFTkNFX0lOVkFMSURcIik7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHJ1bnRpbWUoKS5maW5hbGl6ZUV2aWRlbmNlKGlucHV0LCBwbGFuLCBwcm9vZik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRmF0YWxFcnJvcikgdGhyb3cgZXJyb3I7XG4gICAgICAgIHRocm93IG5ldyBSZXRyeWFibGVFcnJvcihcIlJFVEVOVElPTl9DTEVBTlVQX0VWSURFTkNFX1VOQVZBSUxBQkxFXCIsIHtcbiAgICAgICAgICAgIHJldHJ5QWZ0ZXI6IFwiMTBzXCJcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJldGVudGlvbkNsZWFudXBXb3JrZmxvdyhpbnB1dCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIllvdSBhdHRlbXB0ZWQgdG8gZXhlY3V0ZSB3b3JrZmxvdyByZXRlbnRpb25DbGVhbnVwV29ya2Zsb3cgZnVuY3Rpb24gZGlyZWN0bHkuIFRvIHN0YXJ0IGEgd29ya2Zsb3csIHVzZSBzdGFydChyZXRlbnRpb25DbGVhbnVwV29ya2Zsb3cpIGZyb20gd29ya2Zsb3cvYXBpXCIpO1xufVxucmV0ZW50aW9uQ2xlYW51cFdvcmtmbG93LndvcmtmbG93SWQgPSBcIndvcmtmbG93Ly8uL3JldGVudGlvbi1jbGVhbnVwLy9yZXRlbnRpb25DbGVhbnVwV29ya2Zsb3dcIjtcbnJlZ2lzdGVyU3RlcEZ1bmN0aW9uKFwic3RlcC8vLi9yZXRlbnRpb24tY2xlYW51cC8vbG9hZEF1dGhvcml6ZWRSZXF1ZXN0XCIsIGxvYWRBdXRob3JpemVkUmVxdWVzdCk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vcmV0ZW50aW9uLWNsZWFudXAvL3Jldm9rZUVsaWdpYmlsaXR5XCIsIHJldm9rZUVsaWdpYmlsaXR5KTtcbnJlZ2lzdGVyU3RlcEZ1bmN0aW9uKFwic3RlcC8vLi9yZXRlbnRpb24tY2xlYW51cC8vZWZmZWN0U3RlcFwiLCBlZmZlY3RTdGVwKTtcbnJlZ2lzdGVyU3RlcEZ1bmN0aW9uKFwic3RlcC8vLi9yZXRlbnRpb24tY2xlYW51cC8vdmVyaWZ5Q2xvc3VyZVwiLCB2ZXJpZnlDbG9zdXJlKTtcbnJlZ2lzdGVyU3RlcEZ1bmN0aW9uKFwic3RlcC8vLi9yZXRlbnRpb24tY2xlYW51cC8vZmluYWxpemVFdmlkZW5jZVwiLCBmaW5hbGl6ZUV2aWRlbmNlKTtcbiIsICJpbXBvcnQgeyByZWdpc3RlclN0ZXBGdW5jdGlvbiB9IGZyb20gXCJ3b3JrZmxvdy9pbnRlcm5hbC9wcml2YXRlXCI7XG5pbXBvcnQgeyBGYXRhbEVycm9yLCBSZXRyeWFibGVFcnJvciB9IGZyb20gXCJ3b3JrZmxvd1wiO1xuLyoqX19pbnRlcm5hbF93b3JrZmxvd3N7XCJ3b3JrZmxvd3NcIjp7XCJ2YWNjaW5hdGlvbi1jYXJkLXBkZi50c1wiOntcInZhY2NpbmF0aW9uQ2FyZFBkZldvcmtmbG93XCI6e1wid29ya2Zsb3dJZFwiOlwid29ya2Zsb3cvLy4vdmFjY2luYXRpb24tY2FyZC1wZGYvL3ZhY2NpbmF0aW9uQ2FyZFBkZldvcmtmbG93XCJ9fX0sXCJzdGVwc1wiOntcInZhY2NpbmF0aW9uLWNhcmQtcGRmLnRzXCI6e1wiY2xlYW51cFBhcnRpYWxcIjp7XCJzdGVwSWRcIjpcInN0ZXAvLy4vdmFjY2luYXRpb24tY2FyZC1wZGYvL2NsZWFudXBQYXJ0aWFsXCJ9LFwiZmluYWxpemVEb2N1bWVudFwiOntcInN0ZXBJZFwiOlwic3RlcC8vLi92YWNjaW5hdGlvbi1jYXJkLXBkZi8vZmluYWxpemVEb2N1bWVudFwifSxcImxvYWRTbmFwc2hvdFwiOntcInN0ZXBJZFwiOlwic3RlcC8vLi92YWNjaW5hdGlvbi1jYXJkLXBkZi8vbG9hZFNuYXBzaG90XCJ9LFwicmVuZGVyUGRmXCI6e1wic3RlcElkXCI6XCJzdGVwLy8uL3ZhY2NpbmF0aW9uLWNhcmQtcGRmLy9yZW5kZXJQZGZcIn0sXCJ1cGxvYWRQcml2YXRlT2JqZWN0XCI6e1wic3RlcElkXCI6XCJzdGVwLy8uL3ZhY2NpbmF0aW9uLWNhcmQtcGRmLy91cGxvYWRQcml2YXRlT2JqZWN0XCJ9fX19Ki87XG5sZXQgcG9ydHMgPSBudWxsO1xuZXhwb3J0IGZ1bmN0aW9uIGNvbmZpZ3VyZVZhY2NpbmF0aW9uQ2FyZFBkZlBvcnRzKHZhbHVlKSB7XG4gICAgcG9ydHMgPSB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHJ1bnRpbWUoKSB7XG4gICAgaWYgKCFwb3J0cykgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJWQUNDSU5BVElPTl9QREZfUlVOVElNRV9VTkNPTkZJR1VSRURcIik7XG4gICAgcmV0dXJuIHBvcnRzO1xufVxuZnVuY3Rpb24gdmFsaWQoaW5wdXQpIHtcbiAgICByZXR1cm4gT2JqZWN0LnZhbHVlcyhpbnB1dCkuZXZlcnkoKHYpPT50eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiB2Lmxlbmd0aCA+IDAgJiYgdi5sZW5ndGggPD0gNTEyKSAmJiAvXlthLWYwLTldezY0fSQvdS50ZXN0KGlucHV0LmZhY3RzRGlnZXN0KSAmJiAoaW5wdXQuY291bnRyeSA9PT0gXCJDT1wiIHx8IGlucHV0LmNvdW50cnkgPT09IFwiVVNcIik7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZFNuYXBzaG90KGlucHV0KSB7XG4gICAgaWYgKCF2YWxpZChpbnB1dCkpIHRocm93IG5ldyBGYXRhbEVycm9yKFwiVkFDQ0lOQVRJT05fUERGX0lOVkFMSURfSU5QVVRcIik7XG4gICAgbGV0IHNuYXBzaG90O1xuICAgIHRyeSB7XG4gICAgICAgIHNuYXBzaG90ID0gYXdhaXQgcnVudGltZSgpLmxvYWRTbmFwc2hvdChpbnB1dCk7XG4gICAgfSBjYXRjaCAge1xuICAgICAgICB0aHJvdyBuZXcgUmV0cnlhYmxlRXJyb3IoXCJWQUNDSU5BVElPTl9QREZfU09VUkNFX1VOQVZBSUxBQkxFXCIsIHtcbiAgICAgICAgICAgIHJldHJ5QWZ0ZXI6IFwiMTBzXCJcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGlmICghc25hcHNob3QgfHwgc25hcHNob3QuZG9jdW1lbnRJZCAhPT0gaW5wdXQuZG9jdW1lbnRJZCB8fCBzbmFwc2hvdC5mYWN0c0RpZ2VzdCAhPT0gaW5wdXQuZmFjdHNEaWdlc3QgfHwgc25hcHNob3QuY291bnRyeSAhPT0gaW5wdXQuY291bnRyeSB8fCAhTnVtYmVyLmlzSW50ZWdlcihzbmFwc2hvdC5yb3dzKSB8fCBzbmFwc2hvdC5yb3dzIDwgMCB8fCBzbmFwc2hvdC5yb3dzID4gNTAwKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlZBQ0NJTkFUSU9OX1BERl9TTkFQU0hPVF9JTlZBTElEXCIpO1xuICAgIHJldHVybiBzbmFwc2hvdDtcbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZW5kZXJQZGYoc25hcHNob3QsIHRlbXBsYXRlVmVyc2lvbikge1xuICAgIGlmICghc25hcHNob3QgfHwgc25hcHNob3Qucm93cyA8IDAgfHwgdHlwZW9mIHRlbXBsYXRlVmVyc2lvbiAhPT0gXCJzdHJpbmdcIiB8fCB0ZW1wbGF0ZVZlcnNpb24ubGVuZ3RoID09PSAwKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlZBQ0NJTkFUSU9OX1BERl9URU1QTEFURV9JTlZBTElEXCIpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlbmRlciA9IGF3YWl0IHJ1bnRpbWUoKS5yZW5kZXJQZGYoc25hcHNob3QsIHRlbXBsYXRlVmVyc2lvbik7XG4gICAgICAgIGlmICghcmVuZGVyIHx8ICEvXlstQS1aYS16MC05Ll86XXsxLDI1Nn0kL3UudGVzdChyZW5kZXIucmVuZGVySWQpIHx8ICEvXlthLWYwLTldezY0fSQvdS50ZXN0KHJlbmRlci5ieXRlc1NoYTI1NikgfHwgIU51bWJlci5pc0ludGVnZXIocmVuZGVyLnNpemVCeXRlcykgfHwgcmVuZGVyLnNpemVCeXRlcyA8PSAwIHx8IHJlbmRlci5zaXplQnl0ZXMgPiA1Ml80MjhfODAwKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlZBQ0NJTkFUSU9OX1BERl9SRU5ERVJfSU5WQUxJRFwiKTtcbiAgICAgICAgcmV0dXJuIHJlbmRlcjtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBGYXRhbEVycm9yKSB0aHJvdyBlcnJvcjtcbiAgICAgICAgdGhyb3cgbmV3IFJldHJ5YWJsZUVycm9yKFwiVkFDQ0lOQVRJT05fUERGX1JFTkRFUl9VTkFWQUlMQUJMRVwiLCB7XG4gICAgICAgICAgICByZXRyeUFmdGVyOiBcIjMwc1wiXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGxvYWRQcml2YXRlT2JqZWN0KGlucHV0LCByZW5kZXIpIHtcbiAgICBpZiAoIXZhbGlkKGlucHV0KSB8fCAhcmVuZGVyKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlZBQ0NJTkFUSU9OX1BERl9VUExPQURfSU5WQUxJRFwiKTtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYXdhaXQgcnVudGltZSgpLnVwbG9hZFByaXZhdGVPYmplY3QoaW5wdXQsIHJlbmRlcik7XG4gICAgfSBjYXRjaCAge1xuICAgICAgICB0aHJvdyBuZXcgUmV0cnlhYmxlRXJyb3IoXCJWQUNDSU5BVElPTl9QREZfU1RPUkFHRV9VTkFWQUlMQUJMRVwiLCB7XG4gICAgICAgICAgICByZXRyeUFmdGVyOiBcIjEwc1wiXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmaW5hbGl6ZURvY3VtZW50KGlucHV0LCByZW5kZXIpIHtcbiAgICBpZiAoIXZhbGlkKGlucHV0KSB8fCAhcmVuZGVyKSB0aHJvdyBuZXcgRmF0YWxFcnJvcihcIlZBQ0NJTkFUSU9OX1BERl9GSU5BTElaRV9JTlZBTElEXCIpO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCBydW50aW1lKCkuZmluYWxpemVEb2N1bWVudChpbnB1dCwgcmVuZGVyKTtcbiAgICB9IGNhdGNoICB7XG4gICAgICAgIHRocm93IG5ldyBSZXRyeWFibGVFcnJvcihcIlZBQ0NJTkFUSU9OX1BERl9GSU5BTElaRV9VTkFWQUlMQUJMRVwiLCB7XG4gICAgICAgICAgICByZXRyeUFmdGVyOiBcIjEwc1wiXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbGVhbnVwUGFydGlhbChpbnB1dCwgcmVuZGVyKSB7XG4gICAgaWYgKCF2YWxpZChpbnB1dCkgfHwgIXJlbmRlcikgdGhyb3cgbmV3IEZhdGFsRXJyb3IoXCJWQUNDSU5BVElPTl9QREZfQ0xFQU5VUF9JTlZBTElEXCIpO1xuICAgIGF3YWl0IHJ1bnRpbWUoKS5jbGVhbnVwUGFydGlhbChpbnB1dCwgcmVuZGVyKTtcbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB2YWNjaW5hdGlvbkNhcmRQZGZXb3JrZmxvdyhpbnB1dCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIllvdSBhdHRlbXB0ZWQgdG8gZXhlY3V0ZSB3b3JrZmxvdyB2YWNjaW5hdGlvbkNhcmRQZGZXb3JrZmxvdyBmdW5jdGlvbiBkaXJlY3RseS4gVG8gc3RhcnQgYSB3b3JrZmxvdywgdXNlIHN0YXJ0KHZhY2NpbmF0aW9uQ2FyZFBkZldvcmtmbG93KSBmcm9tIHdvcmtmbG93L2FwaVwiKTtcbn1cbnZhY2NpbmF0aW9uQ2FyZFBkZldvcmtmbG93LndvcmtmbG93SWQgPSBcIndvcmtmbG93Ly8uL3ZhY2NpbmF0aW9uLWNhcmQtcGRmLy92YWNjaW5hdGlvbkNhcmRQZGZXb3JrZmxvd1wiO1xucmVnaXN0ZXJTdGVwRnVuY3Rpb24oXCJzdGVwLy8uL3ZhY2NpbmF0aW9uLWNhcmQtcGRmLy9sb2FkU25hcHNob3RcIiwgbG9hZFNuYXBzaG90KTtcbnJlZ2lzdGVyU3RlcEZ1bmN0aW9uKFwic3RlcC8vLi92YWNjaW5hdGlvbi1jYXJkLXBkZi8vcmVuZGVyUGRmXCIsIHJlbmRlclBkZik7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vdmFjY2luYXRpb24tY2FyZC1wZGYvL3VwbG9hZFByaXZhdGVPYmplY3RcIiwgdXBsb2FkUHJpdmF0ZU9iamVjdCk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vdmFjY2luYXRpb24tY2FyZC1wZGYvL2ZpbmFsaXplRG9jdW1lbnRcIiwgZmluYWxpemVEb2N1bWVudCk7XG5yZWdpc3RlclN0ZXBGdW5jdGlvbihcInN0ZXAvLy4vdmFjY2luYXRpb24tY2FyZC1wZGYvL2NsZWFudXBQYXJ0aWFsXCIsIGNsZWFudXBQYXJ0aWFsKTtcbiIsICJcbiAgICAvLyBCdWlsdCBpbiBzdGVwc1xuICAgIGltcG9ydCAnd29ya2Zsb3cvaW50ZXJuYWwvYnVpbHRpbnMnO1xuICAgIC8vIFVzZXIgc3RlcHNcbiAgICBpbXBvcnQgJy4uLy4uL25vZGVfbW9kdWxlcy93b3JrZmxvdy9kaXN0L3N0ZGxpYi5qcyc7XG5pbXBvcnQgJy4vY29udmVyc2F0aW9uLXN1bW1hcnkudHMnO1xuaW1wb3J0ICcuL2RvY3VtZW50LXByb2Nlc3NpbmcudHMnO1xuaW1wb3J0ICcuL21lbW9yeS1lbWJlZGRpbmcudHMnO1xuaW1wb3J0ICcuL3JldGVudGlvbi1jbGVhbnVwLnRzJztcbmltcG9ydCAnLi92YWNjaW5hdGlvbi1jYXJkLXBkZi50cyc7XG4gICAgLy8gU2VyZGUgZmlsZXMgZm9yIGNyb3NzLWNvbnRleHQgY2xhc3MgcmVnaXN0cmF0aW9uXG4gICAgXG4gICAgLy8gQVBJIGVudHJ5cG9pbnRcbiAgICBleHBvcnQgeyBzdGVwRW50cnlwb2ludCBhcyBIRUFELCBzdGVwRW50cnlwb2ludCBhcyBQT1NUIH0gZnJvbSAnd29ya2Zsb3cvcnVudGltZSc7Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7OztBQUFBLFNBQUEsNEJBQUE7QUFTRSxlQUFXLGtDQUFBO0FBQ1gsU0FBTyxLQUFLLFlBQVc7QUFDekI7QUFGYTtBQUliLGVBQXNCLDBCQUF1QjtBQUMzQyxTQUFBLEtBQVcsS0FBQTs7QUFEUztBQUd0QixlQUFDLDBCQUFBO0FBRUQsU0FBTyxLQUFLLEtBQUE7O0FBRlg7cUJBSWlCLG1DQUFHLCtCQUFBO0FBQ3JCLHFCQUFDLDJCQUFBLHVCQUFBOzs7O0FDckJELFNBQUEsd0JBQUFBLDZCQUFBO0FBYUEsZUFBc0IsU0FBa0QsTUFBQTtBQUN0RSxTQUFBLFdBQVcsTUFBQSxHQUFBLElBQUE7O0FBRFM7QUFHdEJDLHNCQUFDLCtCQUFBLEtBQUE7OztBQ2hCRCxTQUFTLHdCQUFBQyw2QkFBNEI7QUFDckMsU0FBUyxZQUFZLHNCQUFzQjtBQUMzQyxTQUFTLFNBQVM7QUFFbEIsSUFBTSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUs7QUFDN0IsSUFBTSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0saUJBQWlCO0FBQ2pELElBQU0sVUFBVSxFQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDaEMsUUFBUTtBQUNaLENBQUM7QUFDRCxJQUFNLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUM7QUFDM0UsSUFBTSxRQUFRLEVBQUUsT0FBTztBQUFBLEVBQ25CLGFBQWE7QUFBQSxFQUNiLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFdBQVc7QUFBQSxFQUNYLGlCQUFpQjtBQUFBLEVBQ2pCLGNBQWM7QUFBQSxFQUNkLFVBQVU7QUFBQSxFQUNWLGVBQWU7QUFBQSxFQUNmLGVBQWU7QUFBQSxFQUNmLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFz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dGVyU3RlcEZ1bmN0aW9uIiwgInJ1bnRpbWUiLCAicmVnaXN0ZXJTdGVwRnVuY3Rpb24iLCAicmVnaXN0ZXJTdGVwRnVuY3Rpb24iLCAiRmF0YWxFcnJvciIsICJSZXRyeWFibGVFcnJvciIsICJwb3J0cyIsICJwb3J0cyIsICJGYXRhbEVycm9yIiwgIlJldHJ5YWJsZUVycm9yIiwgInJlZ2lzdGVyU3RlcEZ1bmN0aW9uIiwgInJlZ2lzdGVyU3RlcEZ1bmN0aW9uIiwgIkZhdGFsRXJyb3IiLCAiUmV0cnlhYmxlRXJyb3IiLCAicG9ydHMiLCAicnVudGltZSIsICJwb3J0cyIsICJGYXRhbEVycm9yIiwgInZhbGlkSW5wdXQiLCAiUmV0cnlhYmxlRXJyb3IiLCAicmVnaXN0ZXJTdGVwRnVuY3Rpb24iLCAicmVnaXN0ZXJTdGVwRnVuY3Rpb24iLCAiRmF0YWxFcnJvciIsICJSZXRyeWFibGVFcnJvciIsICJwb3J0cyIsICJydW50aW1lIiwgInBvcnRzIiwgIkZhdGFsRXJyb3IiLCAidmFsaWRJbnB1dCIsICJSZXRyeWFibGVFcnJvciIsICJ2YWxpZElucHV0IiwgIkZhdGFsRXJyb3IiLCAicnVudGltZSIsICJSZXRyeWFibGVFcnJvciIsICJyZWdpc3RlclN0ZXBGdW5jdGlvbiIsICJyZWdpc3RlclN0ZXBGdW5jdGlvbiIsICJGYXRhbEVycm9yIiwgIlJldHJ5YWJsZUVycm9yIiwgInBvcnRzIiwgInJ1bnRpbWUiLCAicG9ydHMiLCAiRmF0YWxFcnJvciIsICJSZXRyeWFibGVFcnJvciIsICJyZWdpc3RlclN0ZXBGdW5jdGlvbiIsICJzdGVwRW50cnlwb2ludCJdCn0K
