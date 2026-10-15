import { describe, expect, it } from "vitest";

import {
  projectToolExecutionEvent,
  type ToolExecutionProjectionState,
  type ToolExecutionProjectionEnvelope,
  type ToolExecutionProjectionTransaction,
} from "../../src/projections/tool-execution-projection";

const scope = Object.freeze({
  ownerUserId: "00000000-0000-4000-8000-000000000010",
  careSpaceId: "00000000-0000-4000-8000-000000000011",
  childId: "00000000-0000-4000-8000-000000000012",
  productSessionId: "00000000-0000-4000-8000-000000000013",
});

const executionId = "00000000-0000-4000-8000-000000000014";

const state = (overrides: Partial<ToolExecutionProjectionState> = {}): ToolExecutionProjectionState => Object.freeze({
  scope,
  executionId,
  toolName: "register_anthropometry",
  toolVersion: "register_anthropometry.v1",
  idempotencyKey: "operation.synthetic-1",
  confirmationStatus: "confirmed",
  executionStatus: "requested",
  inputDigest: "a".repeat(64),
  authorizationDigest: "b".repeat(64),
  resultDigest: null,
  resourceId: null,
  effectState: "none",
  lastSequence: 0,
  ...overrides,
});

function envelope(overrides: Partial<ToolExecutionProjectionEnvelope> = {}): ToolExecutionProjectionEnvelope {
  return Object.freeze({
    scope,
    sourceEventId: "eve-tool-1",
    sourceEventVersion: "eve.event.v1",
    sourceSequence: 1,
    occurredAt: "2026-08-29T12:00:00.000Z",
    event: Object.freeze({
      type: "tool.requested",
      executionId,
      toolName: "register_anthropometry",
      toolVersion: "register_anthropometry.v1",
      idempotencyKey: "operation.synthetic-1",
      confirmationStatus: "confirmed",
      inputDigest: "a".repeat(64),
      authorizationDigest: "b".repeat(64),
    }),
    ...overrides,
  });
}

function transaction(current: ToolExecutionProjectionState | null = null, registration: boolean | null = true) {
  const calls: string[] = [];
  const processed = new Map<string, { sourceEventId: string; sourceEventVersion: string; sourceSequence: number; executionStatus: ToolExecutionProjectionState["executionStatus"] }>();
  const tx: ToolExecutionProjectionTransaction = {
    async findExecution() { calls.push("execution"); return current; },
    async findProcessedSource(input) { calls.push(`source:${input.sourceEventId}`); return processed.get(input.sourceEventId) ?? null; },
    async findToolRegistration() { calls.push("registration"); return registration ? { registered: true } : null; },
    async upsertExecution(input) { calls.push("upsert"); current = Object.freeze({ ...input }); return current; },
    async appendSafeChannelEvent() { calls.push("channel"); },
    async recordProcessedSource(input) { calls.push("processed"); processed.set(input.sourceEventId, input); },
    async quarantine(input) { calls.push(`quarantine:${input.reason}`); },
  };
  return { tx, calls, getState: () => current };
}

describe("tool execution projection", () => {
  it("stores a registered request using digests and emits a safe signal", async () => {
    const fixture = transaction();

    const result = await projectToolExecutionEvent(fixture.tx, envelope());

    expect(result).toMatchObject({ disposition: "stored", executionId, executionStatus: "requested" });
    expect(fixture.getState()).toMatchObject({ toolName: "register_anthropometry", executionStatus: "requested", resultDigest: null, resourceId: null });
    expect(fixture.calls).toEqual(["source:eve-tool-1", "registration", "execution", "upsert", "channel", "processed"]);
  });

  it("rejects unknown tools before persistence", async () => {
    const fixture = transaction(null, false);

    const result = await projectToolExecutionEvent(fixture.tx, envelope());

    expect(result).toMatchObject({ disposition: "rejected", reason: "unknown_tool" });
    expect(fixture.calls).toEqual(["source:eve-tool-1", "registration"]);
  });

  it("allows only monotonic lifecycle transitions and preserves effect certainty", async () => {
    const fixture = transaction(state({ executionStatus: "running" }));
    const result = await projectToolExecutionEvent(fixture.tx, envelope({
      sourceEventId: "eve-tool-2",
      sourceSequence: 2,
      event: Object.freeze({
        type: "tool.failed",
        executionId,
        toolName: "register_anthropometry",
        toolVersion: "register_anthropometry.v1",
        idempotencyKey: "operation.synthetic-1",
        errorCode: "PERSISTENCE_UNAVAILABLE",
        effectState: "unknown",
      }),
    }));

    expect(result).toMatchObject({ disposition: "stored", executionStatus: "failed", effectState: "unknown" });
    expect(fixture.getState()).toMatchObject({ executionStatus: "failed", effectState: "unknown", resultDigest: null, resourceId: null });

    const terminal = transaction(state({ executionStatus: "failed", effectState: "unknown", lastSequence: 2 }));
    await expect(projectToolExecutionEvent(terminal.tx, envelope({ sourceSequence: 3 }))).resolves.toMatchObject({ disposition: "quarantined", reason: "terminal_transition" });
  });

  it("rejects a result reference that changes the declared execution identity", async () => {
    const fixture = transaction(state({ executionStatus: "running" }));

    const result = await projectToolExecutionEvent(fixture.tx, envelope({
      sourceEventId: "eve-tool-3",
      sourceSequence: 3,
      event: Object.freeze({
        type: "tool.succeeded",
        executionId,
        toolName: "register_anthropometry",
        toolVersion: "other-tool.v1",
        idempotencyKey: "operation.synthetic-1",
        resultDigest: "c".repeat(64),
        resourceId: "resource-1",
      }),
    }));

    expect(result).toMatchObject({ disposition: "quarantined", reason: "result_reference_mismatch" });
  });

  it("suppresses raw tool payloads without invoking the transaction", async () => {
    const fixture = transaction();

    const result = await projectToolExecutionEvent(fixture.tx, { ...envelope(), event: { type: "action.result", result: { weight: 10 } } });

    expect(result).toEqual({ disposition: "suppressed", reason: "untrusted_tool_payload" });
    expect(fixture.calls).toEqual([]);
  });
});
