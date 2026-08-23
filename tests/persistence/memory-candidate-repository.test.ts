import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import {
  createMemoryCandidateRepository,
} from "../../src/persistence/supabase/memory-candidate-repository";
import type {
  MemoryCandidateSessionContext,
  MemoryCandidateTransactionContext,
  MemoryCandidateRepositoryRow,
  MemoryCandidateWrite,
} from "../../src/application/memory/candidate-service";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const SESSION = "00000000-0000-4000-8000-000000000004";
const MESSAGE = "00000000-0000-4000-8000-000000000005";
const CUTOFF = "2026-08-23T12:00:00.000Z";
const CAPTURED_AT = "2026-08-23T11:59:00.000Z";

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: ACTOR,
  careSpaceId: SPACE,
  childId: CHILD,
  permissions: ["read", "record"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-23T11:56:00.000Z"),
  expiresAt: new Date("2026-08-23T12:01:00.000Z"),
});

const sessionContext: MemoryCandidateSessionContext = {
  sessionId: SESSION,
  ownerUserId: ACTOR,
  careSpaceId: SPACE,
  childId: CHILD,
  authorizationVersion: "m:1:a:1",
  status: "active",
  cutoffAt: CUTOFF,
  safetyDecision: { decision: "not_urgent", responseMode: "continue" },
  sourceMessage: {
    id: MESSAGE,
    agentSessionId: SESSION,
    text: "The child prefers blue cups.",
    capturedAt: CAPTURED_AT,
    actorType: "guardian",
    actorUserId: ACTOR,
    status: "completed",
  },
};

const write: MemoryCandidateWrite = {
  id: "00000000-0000-4000-8000-000000000006",
  careSpaceId: SPACE,
  childId: CHILD,
  createdBy: ACTOR,
  memoryType: "preference",
  candidateText: "The child prefers blue cups.",
  provenanceType: "chat",
  provenanceSourceId: MESSAGE,
  provenanceCapturedAt: CAPTURED_AT,
  sourceSpanStart: 0,
  sourceSpanEnd: 28,
  sourceSessionId: SESSION,
  sourceMessageId: MESSAGE,
  extractionConfidence: 1,
  sensitivity: "low",
  inputSha256: "a".repeat(64) as MemoryCandidateWrite["inputSha256"],
  idempotencyKey: "capture-1",
  lifecycle: "pending",
  expiresAt: "2027-08-23T12:00:00.000Z",
  createdAt: CUTOFF,
};

const row: MemoryCandidateRepositoryRow = {
  id: write.id,
  careSpaceId: SPACE,
  childId: CHILD,
  createdBy: ACTOR,
  memoryType: "preference",
  candidateText: write.candidateText,
  provenanceType: "chat",
  provenanceSourceId: MESSAGE,
  provenanceCapturedAt: CAPTURED_AT,
  sourceSpanStart: 0,
  sourceSpanEnd: 28,
  sourceSessionId: SESSION,
  sourceMessageId: MESSAGE,
  extractionConfidence: 1,
  sensitivity: "low",
  inputSha256: write.inputSha256,
  idempotencyKey: "capture-1",
  lifecycle: "pending",
  expiresAt: write.expiresAt,
  createdAt: CUTOFF,
};

function context(): MemoryCandidateTransactionContext {
  return { scope, sessionContext };
}

function rpcResult(outcome: string, value: MemoryCandidateRepositoryRow | null = row) {
  if (outcome === "conflict") return { data: [{ outcome }], error: null };
  return {
    data: [{
      outcome,
      id: value?.id,
      care_space_id: value?.careSpaceId,
      child_id: value?.childId,
      created_by: value?.createdBy,
      memory_type: value?.memoryType,
      candidate_text: value?.candidateText,
      provenance_type: value?.provenanceType,
      provenance_source_id: value?.provenanceSourceId,
      provenance_captured_at: value?.provenanceCapturedAt,
      source_span_start: value?.sourceSpanStart,
      source_span_end: value?.sourceSpanEnd,
      source_session_id: value?.sourceSessionId,
      source_message_id: value?.sourceMessageId,
      extraction_confidence: value?.extractionConfidence,
      sensitivity: value?.sensitivity,
      input_sha256: value?.inputSha256,
      idempotency_key: value?.idempotencyKey,
      lifecycle: value?.lifecycle,
      expires_at: value?.expiresAt,
      created_at: value?.createdAt,
    }],
    error: null,
  };
}

describe("Cloud memory candidate repository", () => {
  it("captures through exactly one scoped RPC and maps the persisted row", async () => {
    const rpc = vi.fn().mockResolvedValue(rpcResult("created"));
    const repository = createMemoryCandidateRepository({ rpc } as never);

    const result = await repository.capturePending(context(), write);

    expect(result).toEqual({ outcome: "created", row });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("capture_memory_candidate", expect.objectContaining({
      p_care_space_id: SPACE,
      p_child_id: CHILD,
      p_session_id: SESSION,
      p_authorization_version: "m:1:a:1",
      p_source_message_id: MESSAGE,
      p_candidate_id: write.id,
      p_input_sha256: write.inputSha256,
    }));
  });

  it.each(["idempotent_replay", "source_replay"] as const)("maps a %s from the single RPC", async (outcome) => {
    const rpc = vi.fn().mockResolvedValue(rpcResult(outcome));
    const repository = createMemoryCandidateRepository({ rpc } as never);

    await expect(repository.capturePending(context(), write)).resolves.toEqual({ outcome, row });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("maps a conflict without attempting a table read or write", async () => {
    const rpc = vi.fn().mockResolvedValue(rpcResult("conflict"));
    const repository = createMemoryCandidateRepository({ rpc } as never);

    await expect(repository.capturePending(context(), write)).resolves.toEqual({ outcome: "conflict" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("canonicalizes Cloud timestamp offsets before returning repository rows", async () => {
    const rpc = vi.fn().mockResolvedValue(rpcResult("created", {
      ...row,
      provenanceCapturedAt: "2026-08-23T06:59:00-05:00",
      createdAt: "2026-08-23T07:00:00-05:00",
      expiresAt: "2027-08-23T07:00:00-05:00",
    }));
    const repository = createMemoryCandidateRepository({ rpc } as never);

    const result = await repository.capturePending(context(), write);

    expect(result).toEqual(expect.objectContaining({
      row: expect.objectContaining({
        provenanceCapturedAt: "2026-08-23T11:59:00.000Z",
        createdAt: "2026-08-23T12:00:00.000Z",
        expiresAt: "2027-08-23T12:00:00.000Z",
      }),
    }));
  });

  it("fails closed when Cloud reports an RPC error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const repository = createMemoryCandidateRepository({ rpc } as never);

    await expect(repository.capturePending(context(), write)).rejects.toThrow("MEMORY_CANDIDATE_RPC_FAILED");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a capture response has an unknown outcome or malformed row", async () => {
    const unknownOutcome = vi.fn().mockResolvedValue({ data: [{ outcome: "unexpected" }], error: null });
    const malformedRow = vi.fn().mockResolvedValue({ data: [{ ...rpcResult("created").data[0], candidate_text: null }], error: null });

    await expect(createMemoryCandidateRepository({ rpc: unknownOutcome } as never).capturePending(context(), write))
      .rejects.toThrow("MEMORY_CANDIDATE_OUTCOME_INVALID");
    await expect(createMemoryCandidateRepository({ rpc: malformedRow } as never).capturePending(context(), write))
      .rejects.toThrow("MEMORY_CANDIDATE_ROW_INVALID");
  });

  it("lists through exactly one scoped RPC and maps rows", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [rpcResult("created").data[0]], error: null });
    const repository = createMemoryCandidateRepository({ rpc } as never);

    await expect(repository.listPending(context())).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_pending_memory_candidates", expect.objectContaining({
      p_care_space_id: SPACE,
      p_child_id: CHILD,
      p_session_id: SESSION,
      p_authorization_version: "m:1:a:1",
    }));
  });

  it("fails closed when list returns an error or malformed row", async () => {
    const errorRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    const malformedRpc = vi.fn().mockResolvedValue({ data: [{ ...rpcResult("created").data[0], expires_at: "not-an-instant" }], error: null });

    await expect(createMemoryCandidateRepository({ rpc: errorRpc } as never).listPending(context()))
      .rejects.toThrow("MEMORY_CANDIDATE_RPC_FAILED");
    await expect(createMemoryCandidateRepository({ rpc: malformedRpc } as never).listPending(context()))
      .rejects.toThrow("MEMORY_CANDIDATE_ROW_INVALID");
  });

  it("does not call Cloud when the trusted scope lacks the required permission", async () => {
    const rpc = vi.fn();
    const repository = createMemoryCandidateRepository({ rpc } as never);
    const readOnly = createAuthorizedChildScopeFromTrustedRow({
      actorUserId: ACTOR,
      careSpaceId: SPACE,
      childId: CHILD,
      permissions: ["read"],
      countryOfCare: "CO",
      timezone: "America/Bogota",
      authorizationVersion: "m:1:a:1",
      issuedAt: new Date("2026-08-23T11:56:00.000Z"),
      expiresAt: new Date("2026-08-23T12:01:00.000Z"),
    });

    await expect(repository.capturePending({ scope: readOnly, sessionContext }, write)).rejects.toThrow("MEMORY_CANDIDATE_NOT_AUTHORIZED");
    expect(rpc).not.toHaveBeenCalled();
  });
});
