import { describe, expect, it } from "vitest";

import {
  projectSessionEvent,
  type SessionProjectionEnvelope,
  type SessionProjectionTransaction,
  type SessionRecord,
  type ProcessedSessionEvent,
} from "../../src/projections/session-event-projection";

const scope = Object.freeze({
  ownerUserId: "00000000-0000-4000-8000-000000000010",
  careSpaceId: "00000000-0000-4000-8000-000000000011",
  childId: "00000000-0000-4000-8000-000000000012",
  productSessionId: "00000000-0000-4000-8000-000000000013",
});

const activeSession = (): SessionRecord => Object.freeze({
  ...scope,
  eveSessionId: null,
  status: "active",
  lastSequence: 0,
  completedAt: null,
});

function envelope(overrides: Partial<SessionProjectionEnvelope> = {}): SessionProjectionEnvelope {
  return Object.freeze({
    scope,
    sourceEventId: "eve-event-1",
    sourceEventVersion: "eve.event.v1",
    sourceSequence: 1,
    occurredAt: "2026-08-29T12:00:00.000Z",
    event: Object.freeze({ type: "session.started", eveSessionId: "eve-session-1" }),
    ...overrides,
  });
}

function transaction(session: SessionRecord | null = activeSession()) {
  const processed = new Map<string, ProcessedSessionEvent>();
  const calls: string[] = [];
  const tx: SessionProjectionTransaction = {
    async findSession(request) {
      calls.push(`find:${request.productSessionId}`);
      return session;
    },
    async findProcessedSource(request) {
      calls.push(`source:${request.sourceEventId}`);
      return processed.get(request.sourceEventId) ?? null;
    },
    async updateSession(input) {
      calls.push("update");
      session = Object.freeze({ ...session!, ...input });
      return session;
    },
    async appendSafeChannelEvent() {
      calls.push("channel");
    },
    async recordProcessedSource(event) {
      calls.push("processed");
      processed.set(event.sourceEventId, event);
    },
    async quarantine(input) {
      calls.push(`quarantine:${input.reason}`);
    },
  };
  return { tx, calls, processed, getSession: () => session };
}

describe("session event projection", () => {
  it("applies a valid lifecycle event and emits only a safe channel signal", async () => {
    const fixture = transaction();

    const result = await projectSessionEvent(fixture.tx, envelope());

    expect(result).toMatchObject({ outcome: "applied", status: "active", sourceEventId: "eve-event-1" });
    expect(fixture.getSession()).toMatchObject({ eveSessionId: "eve-session-1", lastSequence: 1, status: "active" });
    expect(fixture.calls).toEqual(["source:eve-event-1", "find:00000000-0000-4000-8000-000000000013", "update", "channel", "processed"]);
  });

  it("returns a replay without repeating either effect", async () => {
    const fixture = transaction();
    fixture.processed.set("eve-event-1", { sourceEventId: "eve-event-1", sourceEventVersion: "eve.event.v1", sourceSequence: 1, status: "active" });

    await expect(projectSessionEvent(fixture.tx, envelope())).resolves.toMatchObject({ outcome: "replayed" });
    expect(fixture.calls).toEqual(["source:eve-event-1"]);
  });

  it("quarantines an out-of-order event before changing the session", async () => {
    const fixture = transaction(Object.freeze({ ...activeSession(), lastSequence: 4 }));

    const result = await projectSessionEvent(fixture.tx, envelope({ sourceSequence: 3 }));

    expect(result).toMatchObject({ outcome: "quarantined", reason: "out_of_order" });
    expect(fixture.calls).toEqual(["source:eve-event-1", "find:00000000-0000-4000-8000-000000000013", "quarantine:out_of_order"]);
  });

  it("rejects a cross-scope session without writing or broadcasting", async () => {
    const fixture = transaction(Object.freeze({ ...activeSession(), childId: "00000000-0000-4000-8000-000000000099" }));

    const result = await projectSessionEvent(fixture.tx, envelope());

    expect(result).toMatchObject({ outcome: "rejected", reason: "scope_mismatch" });
    expect(fixture.calls).toEqual(["source:eve-event-1", "find:00000000-0000-4000-8000-000000000013"]);
  });

  it("does not reopen a terminal session", async () => {
    const fixture = transaction(Object.freeze({ ...activeSession(), status: "completed", lastSequence: 4 }));

    const result = await projectSessionEvent(fixture.tx, envelope({ sourceSequence: 5 }));

    expect(result).toMatchObject({ outcome: "quarantined", reason: "terminal_transition" });
    expect(fixture.calls).toEqual(["source:eve-event-1", "find:00000000-0000-4000-8000-000000000013", "quarantine:terminal_transition"]);
  });

  it("rejects extra envelope fields before touching the transaction", async () => {
    const fixture = transaction();

    const result = await projectSessionEvent(fixture.tx, { ...envelope(), unsafe: "ignored" });

    expect(result).toMatchObject({ outcome: "rejected", reason: "invalid_event" });
    expect(fixture.calls).toEqual([]);
  });

  it("quarantines an event bound to another Eve session", async () => {
    const fixture = transaction(Object.freeze({ ...activeSession(), eveSessionId: "eve-session-1" }));

    const result = await projectSessionEvent(fixture.tx, envelope({
      event: Object.freeze({ type: "session.completed", eveSessionId: "eve-session-foreign" }),
    }));

    expect(result).toMatchObject({ outcome: "quarantined", reason: "source_conflict" });
    expect(fixture.calls).toEqual(["source:eve-event-1", "find:00000000-0000-4000-8000-000000000013", "quarantine:source_conflict"]);
  });
});
