import { describe, expect, it } from "vitest";

import {
  runProjectionBatch,
  type ProjectionBatchEvent,
  type ProjectionBatchStore,
} from "../../src/projections/projection-runner";

const SCOPE = Object.freeze({
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  productSessionId: "00000000-0000-4000-8000-000000000004",
});

const EVENT = Object.freeze({
  scope: SCOPE,
  sourceEventId: "source-1",
  sourceEventVersion: "source.v1",
  sourceSequence: 1,
  inputDigest: "a".repeat(64),
  payload: Object.freeze({ kind: "synthetic" }),
});

class FakeStore implements ProjectionBatchStore {
  readonly claims = new Map<string, { status: "claimed" | "completed"; inputDigest: string }>();
  readonly completed: string[] = [];
  readonly failed: string[] = [];
  readonly checkpoints: number[] = [];
  readonly projected: string[] = [];
  crashAfterProject = false;
  failTransiently = false;

  async claim(input: { projectorName: string; projectorVersion: string; event: ProjectionBatchEvent }) {
    const event = input.event;
    const current = this.claims.get(event.sourceEventId);
    if (current && current.inputDigest !== event.inputDigest) return { outcome: "conflict" as const };
    if (current?.status === "completed") return { outcome: "completed" as const };
    this.claims.set(event.sourceEventId, { status: "claimed", inputDigest: event.inputDigest });
    return { outcome: "claimed" as const };
  }

  async project(event: ProjectionBatchEvent) {
    this.projected.push(event.sourceEventId);
    if (this.failTransiently) throw Object.assign(new Error("temporary database outage"), { retryable: true });
    if (this.crashAfterProject) throw new Error("crash after projection");
  }

  async commit(input: { projectorName: string; projectorVersion: string; event: ProjectionBatchEvent }) {
    const event = input.event;
    this.completed.push(event.sourceEventId);
    this.claims.set(event.sourceEventId, { status: "completed", inputDigest: event.inputDigest });
    this.checkpoints.push(event.sourceSequence);
  }

  async fail(input: { projectorName: string; projectorVersion: string; event: ProjectionBatchEvent }) { this.failed.push(input.event.sourceEventId); }
  async quarantine(_input: { projectorName: string; projectorVersion: string; event: ProjectionBatchEvent; reason: string }) { return undefined; }
}

describe("projection replay runner", () => {
  it("converges an identical replay without invoking the projector twice", async () => {
    const store = new FakeStore();
    expect(Object.keys(EVENT)).toHaveLength(6);
    expect(Object.keys(EVENT.scope)).toHaveLength(4);
    const first = await runProjectionBatch(store, { projectorName: "messages", projectorVersion: "v1", events: [EVENT] });
    const replay = await runProjectionBatch(store, { projectorName: "messages", projectorVersion: "v1", events: [EVENT] });

    expect(first).toMatchObject({ disposition: "completed", completed: 1, replayed: 0 });
    expect(replay).toMatchObject({ disposition: "completed", completed: 0, replayed: 1 });
    expect(store.projected).toEqual(["source-1"]);
    expect(store.checkpoints).toEqual([1]);
  });

  it("quarantines changed replays and never advances their checkpoint", async () => {
    const store = new FakeStore();
    await runProjectionBatch(store, { projectorName: "messages", projectorVersion: "v1", events: [EVENT] });
    const result = await runProjectionBatch(store, { projectorName: "messages", projectorVersion: "v1", events: [{ ...EVENT, inputDigest: "b".repeat(64) }] });

    expect(result).toMatchObject({ disposition: "quarantined", quarantined: 1 });
    expect(store.projected).toEqual(["source-1"]);
    expect(store.checkpoints).toEqual([1]);
  });

  it("resumes after a transient failure without marking the source complete", async () => {
    const store = new FakeStore();
    store.failTransiently = true;
    const failed = await runProjectionBatch(store, { projectorName: "messages", projectorVersion: "v1", events: [EVENT] });
    store.failTransiently = false;
    const resumed = await runProjectionBatch(store, { projectorName: "messages", projectorVersion: "v1", events: [EVENT] });

    expect(failed).toMatchObject({ disposition: "retryable", pending: 1 });
    expect(resumed).toMatchObject({ disposition: "completed", completed: 1 });
    expect(store.completed).toEqual(["source-1"]);
  });

  it("quarantines a poison event and does not continue past it", async () => {
    const store = new FakeStore();
    store.crashAfterProject = true;
    const result = await runProjectionBatch(store, { projectorName: "messages", projectorVersion: "v1", events: [EVENT] });

    expect(result).toMatchObject({ disposition: "quarantined", pending: 1, quarantined: 1 });
    expect(store.completed).toHaveLength(0);
    expect(store.checkpoints).toHaveLength(0);
  });
});
