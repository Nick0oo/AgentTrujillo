import { describe, expect, it } from "vitest";

import {
  projectMessageEvent,
  type MessageProjectionEnvelope,
  type MessageProjectionRecord,
  type MessageProjectionTransaction,
} from "../../src/projections/message-event-projection";

const scope = Object.freeze({
  ownerUserId: "00000000-0000-4000-8000-000000000010",
  careSpaceId: "00000000-0000-4000-8000-000000000011",
  childId: "00000000-0000-4000-8000-000000000012",
  productSessionId: "00000000-0000-4000-8000-000000000013",
});

const messageId = "00000000-0000-4000-8000-000000000014";

function envelope(overrides: Partial<MessageProjectionEnvelope> = {}): MessageProjectionEnvelope {
  return Object.freeze({
    scope,
    sourceEventId: "eve-message-1",
    sourceEventVersion: "eve.event.v1",
    sourceSequence: 1,
    occurredAt: "2026-08-29T12:00:00.000Z",
    event: Object.freeze({ type: "assistant.text", messageId, messageSequence: 2, text: "Respuesta educativa." }),
    ...overrides,
  });
}

function transaction(message: MessageProjectionRecord | null = null) {
  const calls: string[] = [];
  const processed = new Map<string, { sourceEventId: string; sourceEventVersion: string; sourceSequence: number; disposition: "stored" }>();
  const tx: MessageProjectionTransaction = {
    async findMessage() {
      calls.push("message");
      return message;
    },
    async findProcessedSource(input) {
      calls.push(`source:${input.sourceEventId}`);
      return processed.get(input.sourceEventId) ?? null;
    },
    async upsertMessage(input) {
      calls.push("upsert");
      message = Object.freeze({ ...input });
      return message;
    },
    async appendSafeChannelEvent() {
      calls.push("channel");
    },
    async recordProcessedSource(input) {
      calls.push("processed");
      processed.set(input.sourceEventId, input);
    },
    async quarantine(input) {
      calls.push(`quarantine:${input.reason}`);
    },
  };
  return { tx, calls, processed, getMessage: () => message };
}

describe("message event projection", () => {
  it("stores a bounded assistant text part and emits a safe signal", async () => {
    const fixture = transaction();

    const result = await projectMessageEvent(fixture.tx, envelope());

    expect(result).toMatchObject({ disposition: "stored", messageId, sourceEventId: "eve-message-1" });
    expect(fixture.getMessage()).toMatchObject({ actorType: "agent", status: "streaming", sequence: 2, parts: [{ kind: "text", text: "Respuesta educativa." }] });
    expect(fixture.calls).toEqual(["source:eve-message-1", "message", "upsert", "channel", "processed"]);
  });

  it("appends a citation to the same agent message without accepting raw provider data", async () => {
    const existing: MessageProjectionRecord = Object.freeze({
      scope,
      messageId,
      actorType: "agent",
      sequence: 2,
      status: "streaming",
      parts: Object.freeze([{ kind: "text" as const, text: "Respuesta educativa." }]),
    });
    const fixture = transaction(existing);

    const result = await projectMessageEvent(fixture.tx, envelope({
      sourceEventId: "eve-message-2",
      sourceSequence: 2,
      event: Object.freeze({ type: "assistant.citation", messageId, messageSequence: 2, citationId: "source-1", label: "Fuente pública", href: "https://who.int" }),
    }));

    expect(result).toMatchObject({ disposition: "stored" });
    expect(fixture.getMessage()?.parts).toEqual([
      { kind: "text", text: "Respuesta educativa." },
      { kind: "citation", citationId: "source-1", label: "Fuente pública", href: "https://who.int" },
    ]);
  });

  it("suppresses an untrusted reasoning/provider event without persistence", async () => {
    const fixture = transaction();

    const result = await projectMessageEvent(fixture.tx, { ...envelope(), event: { type: "reasoning.appended", text: "internal" } });

    expect(result).toEqual({ disposition: "suppressed", reason: "untrusted_event" });
    expect(fixture.calls).toEqual([]);
  });

  it("replays the same source once and quarantines a sequence regression", async () => {
    const fixture = transaction();
    await projectMessageEvent(fixture.tx, envelope());
    fixture.calls.length = 0;

    await expect(projectMessageEvent(fixture.tx, envelope())).resolves.toMatchObject({ disposition: "stored", outcome: "replayed" });
    expect(fixture.calls).toEqual(["source:eve-message-1"]);

    const older = transaction(Object.freeze({
      scope,
      messageId,
      actorType: "agent",
      sequence: 4,
      status: "streaming",
      parts: Object.freeze([] as const),
    }));
    await expect(projectMessageEvent(older.tx, envelope({ sourceEventId: "eve-message-old", sourceSequence: 3 }))).resolves.toMatchObject({ disposition: "quarantined", reason: "out_of_order" });
  });
});
