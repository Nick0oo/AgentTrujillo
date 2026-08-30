import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureConversationSummaryPorts,
  conversationSummaryWorkflow,
  generateCandidateSummary,
  loadEligibleMessages,
  persistCandidates,
  startConversationSummary,
  validateCandidatePolicy,
  type ConversationSummaryInput,
  type ConversationSummaryPorts,
} from "../../src/workflows/conversation-summary";

const IDS = {
  ownerUserId: "00000000-0000-4000-8000-000000120001",
  careSpaceId: "00000000-0000-4000-8000-000000120002",
  childId: "00000000-0000-4000-8000-000000120003",
  sessionId: "00000000-0000-4000-8000-000000120004",
} as const;
const MESSAGE_ID = "00000000-0000-4000-8000-000000120005";

const INPUT: ConversationSummaryInput = Object.freeze({
  ...IDS,
  sourceSessionId: IDS.sessionId,
  sourceDigest: "a".repeat(64),
  cutoffAt: "2026-08-29T12:00:00.000Z",
  promptVersion: "summary-prompt.v1",
  schemaVersion: "summary-candidate.v1",
  idempotencyKey: "summary:120001",
});

function ports(overrides: Partial<ConversationSummaryPorts> = {}): ConversationSummaryPorts {
  return {
    loadMessages: vi.fn().mockResolvedValue({
      sessionState: "ordinary",
      messages: [{
        id: MESSAGE_ID,
        ownerUserId: IDS.ownerUserId,
        careSpaceId: IDS.careSpaceId,
        childId: IDS.childId,
        sessionId: IDS.sessionId,
        sequence: 1,
        actor: "guardian",
        status: "completed",
        occurredAt: "2026-08-29T11:00:00.000Z",
        text: "El niño duerme mejor.",
      }],
    }),
    summarize: vi.fn().mockResolvedValue({
      text: "El tutor reporta una mejoría del sueño.",
      citations: [{ messageId: MESSAGE_ID, start: 0, end: 23 }],
    }),
    persistCandidate: vi.fn().mockResolvedValue({ outcome: "created", candidateId: "00000000-0000-4000-8000-000000120006" }),
    ...overrides,
  };
}

afterEach(() => configureConversationSummaryPorts(null));

describe("conversation summary workflow", () => {
  it("loads only same-child completed messages and persists an unconfirmed candidate idempotently", async () => {
    const configured = ports();
    configureConversationSummaryPorts(configured);

    await expect(conversationSummaryWorkflow(INPUT)).resolves.toEqual({
      status: "persisted",
      outcome: "created",
      candidateId: "00000000-0000-4000-8000-000000120006",
    });
    expect(configured.persistCandidate).toHaveBeenCalledWith(expect.objectContaining({
      lifecycle: "pending",
      sourceSessionId: IDS.sessionId,
      childId: IDS.childId,
    }));
  });

  it("skips urgent sessions before any model or persistence effect", async () => {
    const configured = ports({ loadMessages: vi.fn().mockResolvedValue({ sessionState: "urgent", messages: [] }) });
    configureConversationSummaryPorts(configured);

    await expect(conversationSummaryWorkflow(INPUT)).resolves.toEqual({ status: "skipped", reason: "urgent_session" });
    expect(configured.summarize).not.toHaveBeenCalled();
    expect(configured.persistCandidate).not.toHaveBeenCalled();
  });

  it("rejects a policy-unsafe generated candidate as a fatal error", async () => {
    configureConversationSummaryPorts(ports({
      summarize: vi.fn().mockResolvedValue({ text: "Prescribe una dosis para tratarlo.", citations: [] }),
    }));

    await expect(conversationSummaryWorkflow(INPUT)).rejects.toMatchObject({ message: "SUMMARY_POLICY_REJECTED" });
  });

  it("classifies provider outages as retryable and never persists partial output", async () => {
    const configured = ports({ summarize: vi.fn().mockRejectedValue(new Error("provider unavailable")) });
    configureConversationSummaryPorts(configured);

    await expect(generateCandidateSummary(await loadEligibleMessages(INPUT))).rejects.toMatchObject({
      message: "SUMMARY_PROVIDER_UNAVAILABLE",
    });
    expect(configured.persistCandidate).not.toHaveBeenCalled();
  });

  it("keeps the start adapter opaque and returns only a run id", async () => {
    const start = vi.fn().mockResolvedValue({ runId: "wrun_summary_120001" });
    await expect(startConversationSummary(INPUT, start)).resolves.toEqual({ runId: "wrun_summary_120001" });
    expect(start).toHaveBeenCalledWith(INPUT);
  });

  it("rejects direct policy validation when a generated candidate lacks citations", async () => {
    await expect(validateCandidatePolicy({ text: "Resumen", citations: [] })).rejects.toMatchObject({
      message: "SUMMARY_POLICY_REJECTED",
    });
  });

  it("fails closed when no runtime ports are configured", async () => {
    await expect(loadEligibleMessages(INPUT)).rejects.toMatchObject({ message: "SUMMARY_RUNTIME_UNCONFIGURED" });
  });
});
