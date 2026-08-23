import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope";
import {
  createMemoryConfirmationService,
  type MemoryConfirmationCandidateSnapshot,
  type MemoryConfirmationSessionContext,
} from "../../../src/application/memory/confirmation-service";
import {
  classifyMemoryCandidate,
  computeMemoryCandidateInputDigest,
  DEFAULT_MEMORY_CONFIRMATION_POLICY,
} from "../../../src/clinical/memory/confirmation-policy";
import type {
  MemoryConfirmationItem,
  MemoryConfirmationRepository,
} from "../../../src/persistence/supabase/memory-confirmation-repository";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const SESSION = "00000000-0000-4000-8000-000000000004";
const CANDIDATE = "00000000-0000-4000-8000-000000000005";
const ITEM = "00000000-0000-4000-8000-000000000006";
const MESSAGE = "00000000-0000-4000-8000-000000000007";
const CUTOFF = "2026-08-23T12:00:00.000Z";
const EXPIRES = "2027-08-23T12:00:00.000Z";
const CONFIRMATION_SHA = "c".repeat(64);
const TEXT = "The child prefers blue cups.";

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

const inputSha256 = computeMemoryCandidateInputDigest({
  candidateId: CANDIDATE,
  memoryType: "preference",
  text: TEXT,
  provenanceType: "chat",
});

const classification = classifyMemoryCandidate({
  candidate: {
    candidateId: CANDIDATE,
    memoryType: "preference",
    text: TEXT,
    provenanceType: "chat",
    inputSha256,
  },
  policy: DEFAULT_MEMORY_CONFIRMATION_POLICY,
  safetyDecision: { decision: "not_urgent", responseMode: "continue" },
  cutoff: CUTOFF,
});

const context: MemoryConfirmationSessionContext = {
  sessionId: SESSION,
  ownerUserId: ACTOR,
  careSpaceId: SPACE,
  childId: CHILD,
  authorizationVersion: "m:1:a:1",
  status: "active",
  cutoffAt: CUTOFF,
  safetyDecision: { decision: "not_urgent", responseMode: "continue" },
};

const candidate: MemoryConfirmationCandidateSnapshot = {
  id: CANDIDATE,
  memoryType: "preference",
  text: TEXT,
  provenanceType: "chat",
  provenanceSourceId: MESSAGE,
  provenanceCapturedAt: "2026-08-23T11:59:00.000Z",
  sourceSpanStart: 0,
  sourceSpanEnd: TEXT.length,
  sourceSessionId: SESSION,
  sourceMessageId: MESSAGE,
  extractionConfidence: 1,
  sensitivity: "low",
  inputSha256,
  expiresAt: EXPIRES,
};

const item: MemoryConfirmationItem = {
  id: ITEM,
  careSpaceId: SPACE,
  childId: CHILD,
  memoryType: "preference",
  structuredContent: { text: TEXT },
  searchableText: TEXT,
  provenanceType: "chat",
  sourceSessionId: SESSION,
  sourceMessageId: MESSAGE,
  provenanceSourceId: MESSAGE,
  provenanceCapturedAt: "2026-08-23T11:59:00.000Z",
  sourceSpanStart: 0,
  sourceSpanEnd: TEXT.length,
  extractionConfidence: 1,
  sensitivity: "low",
  lifecycle: "active",
  retrievalEligibility: "eligible",
  inputSha256,
  contentSha256: "d".repeat(64),
  confirmationSha256: CONFIRMATION_SHA,
  confirmedAt: CUTOFF,
  validFrom: CUTOFF,
  validUntil: EXPIRES,
  supersedesId: null,
};

function repository(overrides: Partial<MemoryConfirmationRepository> = {}): MemoryConfirmationRepository {
  return {
    confirm: vi.fn().mockResolvedValue({ outcome: "confirmed", decisionId: null, eventId: null, eventKind: "memory_confirmed", eventVersion: 1, item }),
    reject: vi.fn().mockResolvedValue({ outcome: "rejected", decisionId: null, eventId: null, eventKind: "memory_rejected", eventVersion: 1, item: null }),
    correct: vi.fn().mockResolvedValue({ outcome: "corrected", decisionId: null, eventId: null, eventKind: "memory_corrected", eventVersion: 1, item: { ...item, supersedesId: ITEM } }),
    revoke: vi.fn().mockResolvedValue({ outcome: "revoked", decisionId: null, eventId: null, eventKind: "memory_revoked", eventVersion: 1, item: { ...item, retrievalEligibility: "ineligible", validUntil: "2026-08-23T12:00:01.000Z" } }),
    get: vi.fn().mockResolvedValue(item),
    list: vi.fn().mockResolvedValue([item]),
    ...overrides,
  };
}

function confirmInput(overrides: Record<string, unknown> = {}) {
  return {
    candidate,
    candidateInputSha256: inputSha256,
    policyDecisionSha256: classification.decisionSha256,
    confirmationSha256: CONFIRMATION_SHA,
    purpose: "guardian_controlled_memory",
    expiresAt: EXPIRES,
    idempotencyKey: "confirm-1",
    ...overrides,
  };
}

function terminalInput(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: CANDIDATE,
    candidateInputSha256: inputSha256,
    policySha256: DEFAULT_MEMORY_CONFIRMATION_POLICY.policySha256,
    confirmationSha256: CONFIRMATION_SHA,
    idempotencyKey: "terminal-1",
    ...overrides,
  };
}

function service(memoryRepository = repository(), policy = DEFAULT_MEMORY_CONFIRMATION_POLICY) {
  return createMemoryConfirmationService({ repository: memoryRepository, policy }, { now: () => new Date(CUTOFF) });
}

describe("MemoryConfirmationService", () => {
  it("confirms an unchanged policy-bound preview through one repository transaction", async () => {
    const memoryRepository = repository();
    const result = await service(memoryRepository).confirm(scope, context, confirmInput());

    expect(result).toEqual(expect.objectContaining({ ok: true, outcome: "confirmed", item: expect.objectContaining({ id: ITEM }) }));
    expect(memoryRepository.confirm).toHaveBeenCalledTimes(1);
    expect(memoryRepository.confirm).toHaveBeenCalledWith(expect.objectContaining({ scope, sessionId: SESSION }), expect.objectContaining({
      candidateId: CANDIDATE,
      candidateInputSha256: inputSha256,
      policySha256: DEFAULT_MEMORY_CONFIRMATION_POLICY.policySha256,
      confirmationSha256: CONFIRMATION_SHA,
      memoryItemId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      validFrom: CUTOFF,
      validUntil: EXPIRES,
    }));
  });

  it("fails closed on preview drift, invalid expiry, injected authority, and a revoked scope", async () => {
    const memoryRepository = repository();
    const confirmationService = service(memoryRepository);
    const drift = await confirmationService.confirm(scope, context, confirmInput({ policyDecisionSha256: "0".repeat(64) }));
    const expired = await confirmationService.confirm(scope, context, confirmInput({ candidate: { ...candidate, expiresAt: "2026-08-23T11:59:00.000Z" }, expiresAt: "2026-08-23T11:59:00.000Z" }));
    const injected = await confirmationService.confirm(scope, context, confirmInput({ childId: CHILD, permission: "record" }));
    const revokedScope = createAuthorizedChildScopeFromTrustedRow({
      actorUserId: ACTOR, careSpaceId: SPACE, childId: CHILD, permissions: ["read", "record"],
      countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1",
      issuedAt: new Date("2026-08-23T11:55:00.000Z"), expiresAt: new Date("2026-08-23T11:59:00.000Z"),
    });
    const revoked = await confirmationService.confirm(revokedScope, context, confirmInput());

    expect(drift).toEqual({ ok: false, status: "unavailable", code: "PREVIEW_DRIFT" });
    expect(expired).toEqual({ ok: false, status: "unavailable", code: "CANDIDATE_EXPIRED" });
    expect(injected).toEqual({ ok: false, status: "unavailable", code: "INVALID_INPUT" });
    expect(revoked).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(memoryRepository.confirm).not.toHaveBeenCalled();
  });

  it("lets Cloud converge an exact replay after expiry while a new stale attempt fails closed", async () => {
    const replayRepository = repository({
      confirm: vi.fn().mockResolvedValue({ outcome: "idempotent_replay", decisionId: null, eventId: null, eventKind: "memory_confirmed", eventVersion: 1, item }),
    });
    const staleRepository = repository({ confirm: vi.fn().mockRejectedValue(new Error("MEMORY_CONFIRMATION_RPC_EMPTY")) });
    const freshScope = createAuthorizedChildScopeFromTrustedRow({
      actorUserId: ACTOR, careSpaceId: SPACE, childId: CHILD, permissions: ["read", "record"],
      countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1",
      issuedAt: new Date("2027-08-23T11:56:00.000Z"), expiresAt: new Date("2027-08-23T12:01:00.000Z"),
    });
    const afterExpiry = { now: () => new Date("2027-08-23T12:00:30.000Z") };

    const replay = await createMemoryConfirmationService({ repository: replayRepository, policy: DEFAULT_MEMORY_CONFIRMATION_POLICY }, afterExpiry)
      .confirm(freshScope, context, confirmInput());
    const stale = await createMemoryConfirmationService({ repository: staleRepository, policy: DEFAULT_MEMORY_CONFIRMATION_POLICY }, afterExpiry)
      .confirm(freshScope, context, confirmInput({ idempotencyKey: "new-after-expiry" }));

    expect(replay).toEqual(expect.objectContaining({ ok: true, outcome: "idempotent_replay" }));
    expect(stale).toEqual({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" });
    expect(replayRepository.confirm).toHaveBeenCalledTimes(1);
    expect(staleRepository.confirm).toHaveBeenCalledTimes(1);
  });

  it("rejects without creating a fact and keeps rejection available without a current policy", async () => {
    const memoryRepository = repository();
    const result = await createMemoryConfirmationService({ repository: memoryRepository, policy: null }, { now: () => new Date(CUTOFF) })
      .reject(scope, context, terminalInput());

    expect(result).toEqual(expect.objectContaining({ ok: true, outcome: "rejected", item: null }));
    expect(memoryRepository.reject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ memoryItemId: null }));
  });

  it("allows a policy-safe correction and binds provenance while superseding the selected fact", async () => {
    const memoryRepository = repository();
    const result = await service(memoryRepository).correct(scope, context, {
      ...confirmInput({ idempotencyKey: "correct-1" }),
      correctedText: "The child prefers red cups.",
      supersedesId: ITEM,
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, outcome: "corrected" }));
    expect(memoryRepository.correct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      searchableText: "The child prefers red cups.",
      structuredContent: { text: "The child prefers red cups." },
      provenanceSourceId: MESSAGE,
      supersedesId: ITEM,
    }));
  });

  it("denies diagnosis-like corrections before persistence", async () => {
    const memoryRepository = repository();
    const result = await service(memoryRepository).correct(scope, context, {
      ...confirmInput({ idempotencyKey: "correct-unsafe" }),
      correctedText: "I think the diagnosis is asthma.",
      supersedesId: ITEM,
    });

    expect(result).toEqual({ ok: false, status: "unavailable", code: "POLICY_DENIED" });
    expect(memoryRepository.correct).not.toHaveBeenCalled();
  });

  it("revokes immediately even when policy and the original candidate expiry are unavailable", async () => {
    const memoryRepository = repository();
    const result = await createMemoryConfirmationService({ repository: memoryRepository, policy: null }, { now: () => new Date(CUTOFF) })
      .revoke(scope, context, terminalInput({ memoryItemId: ITEM }));

    expect(result).toEqual(expect.objectContaining({ ok: true, outcome: "revoked", item: expect.objectContaining({ retrievalEligibility: "ineligible" }) }));
    expect(memoryRepository.revoke).toHaveBeenCalledTimes(1);
  });

  it("maps replay convergence and changed replay without issuing a second read", async () => {
    const replayRepository = repository({
      confirm: vi.fn().mockResolvedValue({ outcome: "idempotent_replay", decisionId: null, eventId: null, eventKind: "memory_confirmed", eventVersion: 1, item }),
    });
    const conflictRepository = repository({ confirm: vi.fn().mockResolvedValue({ outcome: "conflict" }) });

    await expect(service(replayRepository).confirm(scope, context, confirmInput())).resolves.toEqual(expect.objectContaining({ ok: true, outcome: "idempotent_replay" }));
    await expect(service(conflictRepository).confirm(scope, context, confirmInput())).resolves.toEqual({ ok: false, status: "unavailable", code: "IDEMPOTENCY_CONFLICT" });
    expect(replayRepository.get).not.toHaveBeenCalled();
    expect(conflictRepository.get).not.toHaveBeenCalled();
  });

  it("fails closed on repository errors and foreign-scope projections", async () => {
    const thrown = repository({ confirm: vi.fn().mockRejectedValue(new Error("database unavailable")) });
    const foreign = repository({ confirm: vi.fn().mockResolvedValue({
      outcome: "confirmed", decisionId: null, eventId: null, eventKind: "memory_confirmed", eventVersion: 1,
      item: { ...item, childId: "00000000-0000-4000-8000-000000000099" },
    }) });

    await expect(service(thrown).confirm(scope, context, confirmInput())).resolves.toEqual({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" });
    await expect(service(foreign).confirm(scope, context, confirmInput())).resolves.toEqual({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" });
  });

  it("gets and lists only bounded same-scope facts with deterministic ordering", async () => {
    const later = { ...item, id: "00000000-0000-4000-8000-000000000009", validFrom: "2026-08-23T12:01:00.000Z" };
    const memoryRepository = repository({ list: vi.fn().mockResolvedValue([item, later]) });
    const confirmationService = service(memoryRepository);

    const found = await confirmationService.get(scope, context, ITEM);
    const listed = await confirmationService.list(scope, context);

    expect(found).toEqual(expect.objectContaining({ ok: true, item: expect.objectContaining({ id: ITEM }) }));
    expect(listed).toEqual(expect.objectContaining({ ok: true, items: [expect.objectContaining({ id: later.id }), expect.objectContaining({ id: ITEM })] }));
    expect(memoryRepository.get).toHaveBeenCalledWith(expect.objectContaining({ scope }), ITEM);
  });
});
