import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import {
  createMemoryConfirmationRepository,
  type MemoryConfirmationContext,
  type MemoryConfirmationCorrection,
  type MemoryConfirmationDecisionInput,
  type MemoryConfirmationItem,
} from "../../src/persistence/supabase/memory-confirmation-repository";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const SESSION = "00000000-0000-4000-8000-000000000004";
const CANDIDATE = "00000000-0000-4000-8000-000000000005";
const ITEM = "00000000-0000-4000-8000-000000000006";
const DECISION = "00000000-0000-4000-8000-000000000007";
const EVENT = "00000000-0000-4000-8000-000000000008";
const CUTOFF = "2026-08-23T12:00:00.000Z";
const CAPTURED_AT = "2026-08-23T11:59:00.000Z";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);

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

const context: MemoryConfirmationContext = {
  scope,
  sessionId: SESSION,
  authorizationVersion: "m:1:a:1",
  cutoffAt: CUTOFF,
};

const item: MemoryConfirmationItem = {
  id: ITEM,
  careSpaceId: SPACE,
  childId: CHILD,
  memoryType: "preference",
  structuredContent: { text: "The child prefers blue cups." },
  searchableText: "The child prefers blue cups.",
  provenanceType: "chat",
  sourceSessionId: SESSION,
  sourceMessageId: "00000000-0000-4000-8000-000000000009",
  provenanceSourceId: "00000000-0000-4000-8000-000000000009",
  provenanceCapturedAt: CAPTURED_AT,
  sourceSpanStart: 0,
  sourceSpanEnd: 28,
  extractionConfidence: 1,
  sensitivity: "low",
  lifecycle: "active",
  retrievalEligibility: "eligible",
  inputSha256: DIGEST_A,
  contentSha256: DIGEST_B,
  confirmationSha256: DIGEST_C,
  confirmedAt: CUTOFF,
  validFrom: CUTOFF,
  validUntil: null,
  supersedesId: null,
};

const decisionInput: MemoryConfirmationDecisionInput = {
  candidateId: CANDIDATE,
  candidateInputSha256: DIGEST_A,
  policySha256: DIGEST_D,
  confirmationSha256: DIGEST_C,
  idempotencyKey: "memory-decision-1",
  memoryItemId: ITEM,
  contentSha256: DIGEST_B,
  validFrom: CUTOFF,
  validUntil: null,
};

const correction: MemoryConfirmationCorrection = {
  ...decisionInput,
  memoryItemId: ITEM,
  memoryType: "preference",
  structuredContent: { text: "The child prefers red cups." },
  searchableText: "The child prefers red cups.",
  provenanceType: "chat",
  provenanceSourceId: "00000000-0000-4000-8000-000000000009",
  provenanceCapturedAt: CAPTURED_AT,
  sourceSessionId: SESSION,
  sourceMessageId: "00000000-0000-4000-8000-000000000009",
  sourceSpanStart: 0,
  sourceSpanEnd: 28,
  extractionConfidence: 1,
  sensitivity: "low",
  validFrom: CUTOFF,
  validUntil: null,
  supersedesId: ITEM,
};

function rpcRow(outcome: string, value: MemoryConfirmationItem | null = item) {
  return {
    data: [{
      outcome,
      decision_id: DECISION,
      event_id: EVENT,
      event_kind: `memory_${outcome}`,
      event_version: 1,
      candidate_id: CANDIDATE,
      memory_item_id: value?.id ?? null,
      care_space_id: SPACE,
      child_id: CHILD,
      candidate_input_sha256: DIGEST_A,
      policy_sha256: DIGEST_D,
      content_sha256: value?.contentSha256 ?? null,
      confirmation_sha256: DIGEST_C,
      event_payload_sha256: DIGEST_B,
      ...value && {
        memory_type: value.memoryType,
        structured_content: value.structuredContent,
        searchable_text: value.searchableText,
        provenance_type: value.provenanceType,
        provenance_source_id: value.provenanceSourceId,
        provenance_captured_at: value.provenanceCapturedAt,
        source_span_start: value.sourceSpanStart,
        source_span_end: value.sourceSpanEnd,
        source_session_id: value.sourceSessionId,
        source_message_id: value.sourceMessageId,
        extraction_confidence: value.extractionConfidence,
        sensitivity: value.sensitivity,
        lifecycle: value.lifecycle,
        retrieval_eligibility: value.retrievalEligibility,
        input_sha256: value.inputSha256,
        confirmed_at: value.confirmedAt,
        valid_from: value.validFrom,
        valid_until: value.validUntil,
        supersedes_id: value.supersedesId,
      },
    }],
    error: null,
  };
}

describe("Cloud memory confirmation repository", () => {
  it("confirms through one scoped RPC and maps the bounded item/event projection", async () => {
    const rpc = vi.fn().mockResolvedValue(rpcRow("confirmed"));
    const repository = createMemoryConfirmationRepository({ rpc } as never);

    await expect(repository.confirm(context, decisionInput)).resolves.toEqual(expect.objectContaining({
      outcome: "confirmed",
      decisionId: DECISION,
      eventId: EVENT,
      item,
    }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("decide_memory_candidate", expect.objectContaining({
      p_decision: "confirm",
      p_care_space_id: SPACE,
      p_child_id: CHILD,
      p_session_id: SESSION,
      p_authorization_version: "m:1:a:1",
      p_candidate_id: CANDIDATE,
      p_candidate_input_sha256: DIGEST_A,
      p_policy_sha256: DIGEST_D,
      p_confirmation_sha256: DIGEST_C,
      p_idempotency_key: "memory-decision-1",
      p_valid_from: CUTOFF,
      p_valid_until: null,
    }));
  });

  it.each([
    ["reject", "rejected"],
    ["correct", "corrected"],
    ["revoke", "revoked"],
  ] as const)("maps %s outcomes from the same atomic decision RPC", async (method, outcome) => {
    const rpc = vi.fn().mockResolvedValue(rpcRow(outcome, method === "reject" ? null : item));
    const repository = createMemoryConfirmationRepository({ rpc } as never);
    const input = method === "correct" ? correction : decisionInput;

    await expect(repository[method](context, input as never)).resolves.toEqual(expect.objectContaining({ outcome }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("decide_memory_candidate", expect.objectContaining({ p_decision: method }));
  });

  it("returns conflict without a second read when the RPC reports changed replay", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ outcome: "conflict" }], error: null });
    const repository = createMemoryConfirmationRepository({ rpc } as never);

    await expect(repository.confirm(context, decisionInput)).resolves.toEqual({ outcome: "conflict" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("maps get and list through one scope-bound read RPC each", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce(rpcRow("found"))
      .mockResolvedValueOnce({ data: [rpcRow("found").data[0]], error: null });
    const repository = createMemoryConfirmationRepository({ rpc } as never);

    await expect(repository.get(context, ITEM)).resolves.toEqual(item);
    await expect(repository.list(context)).resolves.toEqual([item]);
    expect(rpc).toHaveBeenNthCalledWith(1, "get_confirmed_memory", expect.objectContaining({
      p_care_space_id: SPACE,
      p_child_id: CHILD,
      p_session_id: SESSION,
      p_memory_item_id: ITEM,
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "list_confirmed_memory", expect.objectContaining({
      p_care_space_id: SPACE,
      p_child_id: CHILD,
      p_session_id: SESSION,
      p_authorization_version: "m:1:a:1",
    }));
  });

  it("fails closed on RPC errors, empty rows, and malformed projections", async () => {
    const errorRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const emptyRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const malformedRpc = vi.fn().mockResolvedValue({ data: [{ ...rpcRow("confirmed").data[0], searchable_text: null }], error: null });

    await expect(createMemoryConfirmationRepository({ rpc: errorRpc } as never).confirm(context, decisionInput))
      .rejects.toThrow("MEMORY_CONFIRMATION_RPC_FAILED");
    await expect(createMemoryConfirmationRepository({ rpc: emptyRpc } as never).confirm(context, decisionInput))
      .rejects.toThrow("MEMORY_CONFIRMATION_RPC_EMPTY");
    await expect(createMemoryConfirmationRepository({ rpc: malformedRpc } as never).confirm(context, decisionInput))
      .rejects.toThrow("MEMORY_CONFIRMATION_ITEM_INVALID");
  });

  it("does not call Cloud when a trusted scope lacks the operation permission", async () => {
    const rpc = vi.fn();
    const repository = createMemoryConfirmationRepository({ rpc } as never);
    const readOnlyScope = createAuthorizedChildScopeFromTrustedRow({
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

    await expect(repository.confirm({ ...context, scope: readOnlyScope }, decisionInput))
      .rejects.toThrow("MEMORY_CONFIRMATION_NOT_AUTHORIZED");
    expect(rpc).not.toHaveBeenCalled();
  });
});
