import { afterEach, describe, expect, it } from "vitest";
import { start } from "workflow/api";

import {
  configureConversationSummaryPorts,
  conversationSummaryWorkflow,
} from "../../src/workflows/conversation-summary";

const IDS = {
  ownerUserId: "00000000-0000-4000-8000-000000120001",
  careSpaceId: "00000000-0000-4000-8000-000000120002",
  childId: "00000000-0000-4000-8000-000000120003",
  sessionId: "00000000-0000-4000-8000-000000120004",
  messageId: "00000000-0000-4000-8000-000000120005",
  candidateId: "00000000-0000-4000-8000-000000120006",
} as const;

const INPUT = Object.freeze({
  ownerUserId: IDS.ownerUserId,
  careSpaceId: IDS.careSpaceId,
  childId: IDS.childId,
  sessionId: IDS.sessionId,
  sourceSessionId: IDS.sessionId,
  sourceDigest: "a".repeat(64),
  cutoffAt: "2026-08-29T12:00:00.000Z",
  promptVersion: "summary-prompt.v1",
  schemaVersion: "summary-candidate.v1",
  idempotencyKey: "summary:integration",
});

afterEach(() => configureConversationSummaryPorts(null));

describe("conversation summary workflow runtime", () => {
  it("runs through workflow/api and returns the persisted candidate outcome", async () => {
    configureConversationSummaryPorts({
      loadMessages: async () => ({
        sessionState: "ordinary",
        messages: [{
          id: IDS.messageId,
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
      summarize: async () => ({
        text: "El tutor reporta una mejoría del sueño.",
        citations: [{ messageId: IDS.messageId, start: 0, end: 23 }],
      }),
      persistCandidate: async () => ({ outcome: "created", candidateId: IDS.candidateId }),
    });

    const run = await start(conversationSummaryWorkflow, [INPUT]);
    const result = await run.returnValue;

    expect(result).toEqual({ status: "persisted", outcome: "created", candidateId: IDS.candidateId });
    await expect(run.status).resolves.toBe("completed");
  });
});
