import { describe, expect, it } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope";
import {
  createMemoryCandidateService,
  type MemoryCandidateRepository,
  type MemoryCandidateRepositoryRow,
  type MemoryCandidateSessionContext,
  type MemoryCandidateTransactionPort,
} from "../../../src/application/memory/candidate-service";
import { DEFAULT_MEMORY_CONFIRMATION_POLICY } from "../../../src/clinical/memory/confirmation-policy";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const SESSION = "00000000-0000-4000-8000-000000000004";
const MESSAGE = "00000000-0000-4000-8000-000000000005";
const CUTOFF = "2026-08-23T12:00:00.000Z";
const SOURCE_TEXT = "The child prefers blue cups.";

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

type SessionContextOverrides = Partial<Omit<MemoryCandidateSessionContext, "sourceMessage">>
  & { sourceMessage?: Partial<MemoryCandidateSessionContext["sourceMessage"]> };

function sessionContext(overrides: SessionContextOverrides = {}): MemoryCandidateSessionContext {
  const { sourceMessage, ...rest } = overrides;
  return {
    sessionId: SESSION,
    ownerUserId: ACTOR,
    careSpaceId: SPACE,
    childId: CHILD,
    authorizationVersion: "m:1:a:1",
    status: "active",
    cutoffAt: CUTOFF,
    safetyDecision: { decision: "not_urgent", responseMode: "continue" },
    ...rest,
    sourceMessage: {
      id: MESSAGE,
      agentSessionId: SESSION,
      text: SOURCE_TEXT,
      capturedAt: "2026-08-23T11:59:00.000Z",
      actorType: "guardian",
      actorUserId: ACTOR,
      status: "completed",
      ...sourceMessage,
    },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    memoryType: "preference" as const,
    content: { text: "The child prefers blue cups.", sourceSpan: { start: 0, end: SOURCE_TEXT.length } },
    idempotencyKey: "capture-1",
    ...overrides,
  };
}

function rowFromWrite(write: Record<string, unknown>): MemoryCandidateRepositoryRow {
  return {
    id: String(write.id),
    careSpaceId: String(write.careSpaceId),
    childId: String(write.childId),
    createdBy: String(write.createdBy),
    memoryType: String(write.memoryType) as MemoryCandidateRepositoryRow["memoryType"],
    candidateText: String(write.candidateText),
    provenanceType: "chat",
    provenanceSourceId: String(write.provenanceSourceId),
    provenanceCapturedAt: String(write.provenanceCapturedAt),
    sourceSpanStart: Number(write.sourceSpanStart),
    sourceSpanEnd: Number(write.sourceSpanEnd),
    sourceSessionId: String(write.sourceSessionId),
    sourceMessageId: String(write.sourceMessageId),
    extractionConfidence: Number(write.extractionConfidence),
    sensitivity: String(write.sensitivity) as MemoryCandidateRepositoryRow["sensitivity"],
    inputSha256: String(write.inputSha256),
    idempotencyKey: String(write.idempotencyKey),
    lifecycle: "pending",
    expiresAt: String(write.expiresAt),
    createdAt: "2026-08-23T12:00:00.000Z",
  };
}

function memoryRepository(): MemoryCandidateRepository {
  const rows: MemoryCandidateRepositoryRow[] = [];
  return {
    async capturePending(_scope, write) {
      const exact = rows.find((row) => row.idempotencyKey === write.idempotencyKey);
      if (exact) {
        return exact.inputSha256 === write.inputSha256
          ? { outcome: "idempotent_replay" as const, row: exact }
          : { outcome: "conflict" as const };
      }
      const source = rows.find((row) => row.sourceSessionId === write.sourceSessionId
        && row.sourceMessageId === write.sourceMessageId
        && row.sourceSpanStart === write.sourceSpanStart
        && row.sourceSpanEnd === write.sourceSpanEnd);
      if (source) {
        return source.inputSha256 === write.inputSha256
          ? { outcome: "source_replay" as const, row: source }
          : { outcome: "conflict" as const };
      }
      const row = rowFromWrite(write as unknown as Record<string, unknown>);
      rows.push(row);
      return { outcome: "created" as const, row };
    },
    async listPending() {
      return rows.filter((row) => row.lifecycle === "pending");
    },
  };
}

function transactionPort(): MemoryCandidateTransactionPort {
  return {
    async run(scopeValue, context, _cutoff, operation) {
      return operation({ scope: scopeValue, sessionContext: context });
    },
  };
}

function service(repository = memoryRepository()) {
  return createMemoryCandidateService({
    policy: DEFAULT_MEMORY_CONFIRMATION_POLICY,
    transaction: transactionPort(),
    repository,
  }, { now: () => new Date(CUTOFF) });
}

describe("MemoryCandidateService", () => {
  it("captures a policy-eligible candidate as pending with a confirmation preview", async () => {
    const result = await service().capture(scope, sessionContext(), input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("pending");
    expect(result.outcome).toBe("created");
    expect(result.candidate.lifecycle).toBe("pending");
    expect(result.candidate.careSpaceId).toBe(scope.careSpaceId);
    expect(result.candidate.childId).toBe(scope.childId);
    expect(result.candidate.provenance.sourceSpan).toEqual({ start: 0, end: SOURCE_TEXT.length });
    expect(result.confirmationPreview.candidateInputSha256).toBe(result.candidate.inputSha256);
    expect(result.confirmationPreview.confirmation.required).toBe(true);
  });

  it("converges an exact idempotency replay without creating a second candidate", async () => {
    const repository = memoryRepository();
    const candidateService = service(repository);
    const first = await candidateService.capture(scope, sessionContext(), input());
    const replay = await candidateService.capture(scope, sessionContext(), input());

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(replay.outcome).toBe("idempotent_replay");
    expect(replay.candidate.id).toBe(first.candidate.id);
    expect(replay.candidate.inputSha256).toBe(first.candidate.inputSha256);
  });

  it("lists only pending candidates for the reauthorized child scope", async () => {
    const candidateService = service();
    await candidateService.capture(scope, sessionContext(), input());

    const result = await candidateService.listPending(scope, sessionContext());

    expect(result).toEqual(expect.objectContaining({ ok: true, status: "available" }));
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].lifecycle).toBe("pending");
  });

  it("canonicalizes bounded text while preserving the original source span", async () => {
    const source = "The child   prefers blue cups.";
    const result = await service().capture(
      scope,
      sessionContext({ sourceMessage: { id: MESSAGE, text: source, capturedAt: "2026-08-23T11:59:00.000Z" } }),
      input({
        content: { text: source, sourceSpan: { start: 0, end: source.length } },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.content.text).toBe("The child prefers blue cups.");
    expect(result.candidate.content.sourceSpan).toEqual({ start: 0, end: source.length });
  });

  it.each([
    ["forged child", { childId: "00000000-0000-4000-8000-000000000099" }],
    ["forged tenant", { careSpaceId: "00000000-0000-4000-8000-000000000099" }],
    ["forged owner", { ownerUserId: "00000000-0000-4000-8000-000000000099" }],
    ["wrong session version", { authorizationVersion: "m:1:a:2" }],
  ])("denies %s session context before persistence", async (_label, override) => {
    let writes = 0;
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        writes += 1;
        throw new Error("write must not run");
      },
      async listPending() {
        return [];
      },
    };

    const result = await service(repository).capture(scope, sessionContext(override), input());

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(writes).toBe(0);
  });

  it("denies an expired scope and never starts the transaction", async () => {
    const expiredScope = createAuthorizedChildScopeFromTrustedRow({
      actorUserId: ACTOR,
      careSpaceId: SPACE,
      childId: CHILD,
      permissions: ["read", "record"],
      countryOfCare: "CO",
      timezone: "America/Bogota",
      authorizationVersion: "m:1:a:1",
      issuedAt: new Date("2026-08-23T11:56:00.000Z"),
      expiresAt: new Date("2026-08-23T11:59:00.000Z"),
    });
    let transactions = 0;
    const repository = memoryRepository();
    const result = await createMemoryCandidateService({
      policy: DEFAULT_MEMORY_CONFIRMATION_POLICY,
      repository,
      transaction: {
        async run(...args) {
          transactions += 1;
          return transactionPort().run(...args);
        },
      },
    }, { now: () => new Date(CUTOFF) }).capture(expiredScope, sessionContext(), input());

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(transactions).toBe(0);
  });

  it("rejects missing context, oversized input, and injected authority fields", async () => {
    const candidateService = service();

    const missingContext = await candidateService.capture(scope, undefined as unknown as MemoryCandidateSessionContext, input());
    const oversized = await candidateService.capture(scope, sessionContext(), input({
      content: { text: "x".repeat(8_001), sourceSpan: { start: 0, end: 8_001 } },
    }));
    const injected = await candidateService.capture(scope, sessionContext(), input({ childId: CHILD, careSpaceId: SPACE, countryOfCare: "US", confirmation: true }));
    const forgedProvenance = await candidateService.capture(scope, sessionContext(), input({ provenance: { type: "chat", sourceId: MESSAGE } }));
    const forgedConfidence = await candidateService.capture(scope, sessionContext(), input({ extractionConfidence: 0.01 }));

    expect(missingContext).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(oversized).toEqual({ ok: false, status: "unavailable", code: "INVALID_INPUT" });
    expect(injected).toEqual({ ok: false, status: "unavailable", code: "INVALID_INPUT" });
    expect(forgedProvenance).toEqual({ ok: false, status: "unavailable", code: "INVALID_INPUT" });
    expect(forgedConfidence).toEqual({ ok: false, status: "unavailable", code: "INVALID_INPUT" });
  });

  it("denies a source-span mismatch and mismatched provenance", async () => {
    const candidateService = service();
    const mismatch = await candidateService.capture(scope, sessionContext(), input({
      content: { text: "The child prefers red cups.", sourceSpan: { start: 0, end: SOURCE_TEXT.length } },
    }));

    expect(mismatch).toEqual({ ok: false, status: "unavailable", code: "SOURCE_SPAN_MISMATCH" });
  });

  it.each([
    ["another session", { agentSessionId: "00000000-0000-4000-8000-000000000099" }],
    ["another actor", { actorUserId: "00000000-0000-4000-8000-000000000099" }],
    ["agent actor type", { actorType: "agent" }],
    ["streaming status", { status: "streaming" }],
  ])("denies a trusted source message from %s", async (_label, sourceOverride) => {
    const result = await service().capture(
      scope,
      sessionContext({ sourceMessage: sourceOverride as Partial<MemoryCandidateSessionContext["sourceMessage"]> }),
      input(),
    );

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
  });

  it.each([
    ["a future source", { capturedAt: "2026-08-23T12:01:00.000Z" }, CUTOFF],
    ["a future cutoff", { capturedAt: "2026-08-23T11:59:00.000Z" }, "2026-08-23T12:01:00.000Z"],
    ["a source after its cutoff", { capturedAt: "2026-08-23T12:00:01.000Z" }, "2026-08-23T12:00:00.000Z"],
  ])("denies %s without persistence", async (_label, sourceOverride, cutoffAt) => {
    let writes = 0;
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        writes += 1;
        throw new Error("inconsistent time must not persist");
      },
      async listPending() {
        return [];
      },
    };
    const result = await service(repository).capture(
      scope,
      sessionContext({ cutoffAt, sourceMessage: sourceOverride as Partial<MemoryCandidateSessionContext["sourceMessage"]> }),
      input(),
    );

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(writes).toBe(0);
  });

  it.each([
    ["urgent", { decision: "urgent", responseMode: "emergency_recommendation", ruleCodes: ["synthetic"], copyKey: "emergency_department_es_co_v1" }],
    ["professional review", { decision: "professional_review", responseMode: "pediatrician_recommendation", reasonCode: "synthetic" }],
    ["indeterminate", { decision: "indeterminate", responseMode: "abstain", reasonCode: "synthetic" }],
  ])("does not write when trusted safety is %s", async (_label, safetyDecision) => {
    let writes = 0;
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        writes += 1;
        throw new Error("safety-blocked candidate must not persist");
      },
      async listPending() {
        return [];
      },
    };
    const result = await service(repository).capture(scope, sessionContext({ safetyDecision: safetyDecision as MemoryCandidateSessionContext["safetyDecision"] }), input());

    expect(result.ok).toBe(false);
    expect(result).toEqual(expect.objectContaining({ status: "unavailable", code: "SAFETY_BLOCKED" }));
    expect(writes).toBe(0);
  });

  it("denies prohibited and review-required policy candidates before the transaction", async () => {
    let writes = 0;
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        writes += 1;
        throw new Error("ineligible candidate must not persist");
      },
      async listPending() {
        return [];
      },
    };
    const prohibitedSource = "What should I give the child?";
    const prohibited = await service(repository).capture(
      scope,
      sessionContext({ sourceMessage: { id: MESSAGE, text: prohibitedSource, capturedAt: "2026-08-23T11:59:00.000Z" } }),
      input({
        memoryType: "medication",
        content: { text: prohibitedSource, sourceSpan: { start: 0, end: prohibitedSource.length } },
      }),
    );
    const reviewSource = "Maybe the child prefers blue cups.";
    const review = await service(repository).capture(
      scope,
      sessionContext({ sourceMessage: { id: MESSAGE, text: reviewSource, capturedAt: "2026-08-23T11:59:00.000Z" } }),
      input({
        content: { text: reviewSource, sourceSpan: { start: 0, end: reviewSource.length } },
      }),
    );

    expect(prohibited).toEqual(expect.objectContaining({ ok: false, status: "unavailable", code: "POLICY_DENIED" }));
    expect(review).toEqual(expect.objectContaining({ ok: false, status: "unavailable", code: "POLICY_REVIEW_REQUIRED" }));
    expect(writes).toBe(0);
  });

  it("fails closed on policy drift", async () => {
    let writes = 0;
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        writes += 1;
        throw new Error("policy drift must not persist");
      },
      async listPending() {
        return [];
      },
    };
    const result = await createMemoryCandidateService({
      policy: { ...DEFAULT_MEMORY_CONFIRMATION_POLICY, policySha256: "0".repeat(64) as typeof DEFAULT_MEMORY_CONFIRMATION_POLICY.policySha256 },
      transaction: transactionPort(),
      repository,
    }, { now: () => new Date(CUTOFF) }).capture(scope, sessionContext(), input());

    expect(result).toEqual(expect.objectContaining({ ok: false, status: "unavailable", code: "POLICY_UNAVAILABLE" }));
    expect(writes).toBe(0);
  });

  it("returns an exact source replay even when the idempotency key changes", async () => {
    const repository = memoryRepository();
    const candidateService = service(repository);
    const first = await candidateService.capture(scope, sessionContext(), input());
    const replay = await candidateService.capture(scope, sessionContext(), input({ idempotencyKey: "capture-2" }));

    expect(first.ok).toBe(true);
    expect(replay).toEqual(expect.objectContaining({ ok: true, status: "pending", outcome: "source_replay" }));
    if (!first.ok || !replay.ok) return;
    expect(replay.candidate.id).toBe(first.candidate.id);
    expect(replay.candidate.inputSha256).toBe(first.candidate.inputSha256);
  });

  it("returns a conflict for changed content under an existing idempotency key", async () => {
    const repository = memoryRepository();
    const candidateService = service(repository);
    const first = await candidateService.capture(scope, sessionContext(), input());
    const conflict = await candidateService.capture(scope, sessionContext(), input({ memoryType: "summary" }));

    expect(first.ok).toBe(true);
    expect(conflict).toEqual({ ok: false, status: "unavailable", code: "IDEMPOTENCY_CONFLICT" });
  });

  it("converges concurrent exact replays", async () => {
    const repository = memoryRepository();
    const candidateService = service(repository);
    const results = await Promise.all([
      candidateService.capture(scope, sessionContext(), input()),
      candidateService.capture(scope, sessionContext(), input()),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.map((result) => result.ok && result.outcome).sort()).toEqual(["created", "idempotent_replay"]);
  });

  it("does not claim success when the scoped transaction rolls back", async () => {
    let writes = 0;
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        writes += 1;
        throw new Error("transaction rollback");
      },
      async listPending() {
        return [];
      },
    };
    const result = await createMemoryCandidateService({
      policy: DEFAULT_MEMORY_CONFIRMATION_POLICY,
      repository,
      transaction: {
        async run() {
          throw new Error("rollback");
        },
      },
    }, { now: () => new Date(CUTOFF) }).capture(scope, sessionContext(), input());

    expect(result).toEqual({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" });
    expect(writes).toBe(0);
  });

  it("denies when reauthorization returns a revoked or changed session context", async () => {
    let writes = 0;
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        writes += 1;
        throw new Error("revoked context must not persist");
      },
      async listPending() {
        return [];
      },
    };
    const result = await createMemoryCandidateService({
      policy: DEFAULT_MEMORY_CONFIRMATION_POLICY,
      repository,
      transaction: {
        async run(_scope, context, _cutoff, operation) {
          return operation({
            scope: createAuthorizedChildScopeFromTrustedRow({
              actorUserId: ACTOR,
              careSpaceId: SPACE,
              childId: CHILD,
              permissions: ["read", "record"],
              countryOfCare: "CO",
              timezone: "America/Bogota",
              authorizationVersion: "m:1:a:2",
              issuedAt: new Date("2026-08-23T11:56:00.000Z"),
              expiresAt: new Date("2026-08-23T12:01:00.000Z"),
            }),
            sessionContext: { ...context, authorizationVersion: "m:1:a:2" },
          });
        },
      },
    }, { now: () => new Date(CUTOFF) }).capture(scope, sessionContext(), input());

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(writes).toBe(0);
  });

  it("keeps digests and candidate identity stable for the same fixed cutoff", async () => {
    const first = await service().capture(scope, sessionContext(), input());
    const second = await service().capture(scope, sessionContext(), input());

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.candidate.id).toBe(first.candidate.id);
    expect(second.candidate.inputSha256).toBe(first.candidate.inputSha256);
    expect(second.candidate.expiresAt).toBe(first.candidate.expiresAt);
  });

  it("never auto-confirms a candidate or exposes confirmation authority in the result", async () => {
    const result = await service().capture(scope, sessionContext(), input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate.lifecycle).toBe("pending");
    expect("confirmationStatus" in result.candidate).toBe(false);
    expect("careSpaceId" in result.confirmationPreview).toBe(false);
    expect("childId" in result.confirmationPreview).toBe(false);
    expect("guardianId" in result.confirmationPreview).toBe(false);
  });

  it("lists a same-child candidate created by another authorized guardian", async () => {
    const first = await service().capture(scope, sessionContext(), input());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const otherGuardian = rowFromWrite({
      id: first.candidate.id,
      careSpaceId: SPACE,
      childId: CHILD,
      createdBy: "00000000-0000-4000-8000-000000000099",
      memoryType: first.candidate.memoryType,
      candidateText: first.candidate.content.text,
      provenanceSourceId: MESSAGE,
      provenanceCapturedAt: first.candidate.provenance.capturedAt,
      sourceSpanStart: first.candidate.content.sourceSpan.start,
      sourceSpanEnd: first.candidate.content.sourceSpan.end,
      sourceSessionId: SESSION,
      sourceMessageId: MESSAGE,
      extractionConfidence: first.candidate.extractionConfidence,
      sensitivity: first.candidate.sensitivity,
      inputSha256: first.candidate.inputSha256,
      idempotencyKey: "other-guardian",
      expiresAt: first.candidate.expiresAt,
    });
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        return { outcome: "created" as const, row: otherGuardian };
      },
      async listPending() {
        return [otherGuardian];
      },
    };

    const result = await service(repository).listPending(scope, sessionContext());

    expect(result).toEqual(expect.objectContaining({ ok: true, status: "available" }));
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].careSpaceId).toBe(SPACE);
    expect(result.candidates[0].childId).toBe(CHILD);
  });

  it("does not accept a capture replay row attributed to another guardian", async () => {
    const otherGuardian = rowFromWrite({
      id: "00000000-0000-4000-8000-000000000099",
      careSpaceId: SPACE,
      childId: CHILD,
      createdBy: "00000000-0000-4000-8000-000000000099",
      memoryType: "preference",
      candidateText: SOURCE_TEXT,
      provenanceSourceId: MESSAGE,
      provenanceCapturedAt: "2026-08-23T11:59:00.000Z",
      sourceSpanStart: 0,
      sourceSpanEnd: SOURCE_TEXT.length,
      sourceSessionId: SESSION,
      sourceMessageId: MESSAGE,
      extractionConfidence: 1,
      sensitivity: "low",
      inputSha256: "0".repeat(64),
      idempotencyKey: "capture-1",
      expiresAt: "2027-08-23T12:00:00.000Z",
    });
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        return { outcome: "idempotent_replay" as const, row: otherGuardian };
      },
      async listPending() {
        return [];
      },
    };

    const result = await service(repository).capture(scope, sessionContext(), input());

    expect(result).toEqual({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" });
  });

  it("fails closed instead of leaking a sibling row from listPending", async () => {
    const first = await service().capture(scope, sessionContext(), input());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const sibling = {
      ...rowFromWrite({
        id: first.candidate.id,
        careSpaceId: "00000000-0000-4000-8000-000000000099",
        childId: "00000000-0000-4000-8000-000000000099",
        createdBy: ACTOR,
        memoryType: first.candidate.memoryType,
        candidateText: first.candidate.content.text,
        provenanceSourceId: MESSAGE,
        provenanceCapturedAt: first.candidate.provenance.capturedAt,
        sourceSpanStart: 0,
        sourceSpanEnd: SOURCE_TEXT.length,
        sourceSessionId: SESSION,
        sourceMessageId: MESSAGE,
        extractionConfidence: first.candidate.extractionConfidence,
        sensitivity: first.candidate.sensitivity,
        inputSha256: first.candidate.inputSha256,
        idempotencyKey: "sibling",
        expiresAt: first.candidate.expiresAt,
      }),
      careSpaceId: "00000000-0000-4000-8000-000000000099",
      childId: "00000000-0000-4000-8000-000000000099",
    };
    const repository: MemoryCandidateRepository = {
      async capturePending() {
        return { outcome: "created" as const, row: first.candidate as unknown as MemoryCandidateRepositoryRow };
      },
      async listPending() {
        return [sibling];
      },
    };
    const result = await service(repository).listPending(scope, sessionContext());

    expect(result).toEqual({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" });
  });
});
