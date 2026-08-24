import { describe, expect, it, vi } from "vitest";

import { EVE_EVENT_KIND_REGISTRY } from "../../../src/channels/creciendo/eve-event-mapper";
import {
  SAFE_EVE_EVENT_KIND_ALLOWLIST,
  ReasoningPayloadError,
  assertNoReasoningPayload,
  classifyEveEventExposure,
  createSuppressionCounters,
  suppressUnsafeEveEvent,
} from "../../../src/channels/creciendo/reasoning-suppression";

function appended(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    type: "message.appended",
    data: {
      messageDelta: "Texto visible.",
      messageSoFar: "Texto visible.",
      sequence: 4,
      stepIndex: 0,
      turnId: "eve-turn-1",
      ...overrides,
    },
    meta: { at: "2026-08-24T16:30:00.000Z" },
  };
}

describe("deny-first Eve reasoning suppression", () => {
  it("pins the only seven Eve kinds allowed to cross as sanitized candidates", () => {
    expect(SAFE_EVE_EVENT_KIND_ALLOWLIST).toEqual({
      "message.appended": "public-text",
      "actions.requested": "trusted-projection-reference",
      "action.result": "trusted-projection-reference",
      "step.failed": "failure-signal",
      "turn.failed": "failure-signal",
      "session.failed": "failure-signal",
      "turn.completed": "turn-boundary",
    });
    for (const eveKind of Object.keys(EVE_EVENT_KIND_REGISTRY)) {
      const expected = Object.prototype.hasOwnProperty.call(SAFE_EVE_EVENT_KIND_ALLOWLIST, eveKind)
        ? SAFE_EVE_EVENT_KIND_ALLOWLIST[eveKind as keyof typeof SAFE_EVE_EVENT_KIND_ALLOWLIST]
        : "private";
      expect(classifyEveEventExposure({ type: eveKind })).toBe(expected);
    }
    expect(classifyEveEventExposure({ type: "provider.frame.v99", data: {} })).toBe("private");
  });

  it("copies only the visible delta and structural turn fields", () => {
    const counters = createSuppressionCounters();
    const sink = vi.fn();
    const decision = suppressUnsafeEveEvent(appended(), counters, sink);

    expect(decision).toEqual({
      disposition: "allow",
      exposure: "public-text",
      event: {
        type: "message.appended",
        data: {
          messageDelta: "Texto visible.",
          messageSoFar: "",
          sequence: 4,
          stepIndex: 0,
          turnId: "eve-turn-1",
        },
      },
    });
    expect(counters.snapshot()).toEqual({ total: 0, byKind: {}, byReason: {} });
    expect(sink).not.toHaveBeenCalled();
    expect(() => assertNoReasoningPayload(decision)).not.toThrow();
  });

  it("reduces tool/action events to projection references without arguments or results", () => {
    const counters = createSuppressionCounters();
    const requested = suppressUnsafeEveEvent({
      type: "actions.requested",
      data: {
        actions: [{ callId: "secret-call", input: { childId: "private-child" } }],
        sequence: 5,
        stepIndex: 1,
        turnId: "eve-turn-1",
      },
    }, counters);
    const completed = suppressUnsafeEveEvent({
      type: "action.result",
      data: {
        error: { code: "RAW", message: "private error" },
        result: { output: { prompt: "private", clinicalRecord: "private" } },
        sequence: 6,
        stepIndex: 1,
        status: "failed",
        turnId: "eve-turn-1",
      },
    }, counters);

    expect(requested).toMatchObject({
      disposition: "allow",
      exposure: "trusted-projection-reference",
      event: { type: "actions.requested", data: { sequence: 5, stepIndex: 1, turnId: "eve-turn-1" } },
    });
    expect(completed).toMatchObject({
      disposition: "allow",
      exposure: "trusted-projection-reference",
      event: { type: "action.result", data: { sequence: 6, stepIndex: 1, turnId: "eve-turn-1" } },
    });
    expect(JSON.stringify([requested, completed])).not.toMatch(/secret-call|childId|private|clinicalRecord|output|error/iu);
  });

  it("suppresses reasoning, prompts, provider frames, continuations, subagents, and model results", () => {
    const counters = createSuppressionCounters();
    const sink = vi.fn();
    const privateEvents = [
      { type: "reasoning.appended", data: { reasoningDelta: "chain of thought" } },
      { type: "reasoning.completed", data: { reasoning: "private rationale" } },
      { type: "message.received", data: { message: "guardian PHI" } },
      { type: "result.completed", data: { result: { diagnosis: "never" } } },
      { type: "step.completed", data: { providerMetadata: { credential: "secret" } } },
      { type: "session.waiting", data: { continuationToken: "secret-token" } },
      { type: "subagent.event", data: { event: { type: "reasoning.appended" } } },
      { type: "authorization.required", data: { webhookUrl: "https://private.test" } },
    ];

    for (const raw of privateEvents) {
      const decision = suppressUnsafeEveEvent(raw, counters, sink, { debug: true });
      expect(decision).toMatchObject({ disposition: "suppress", reason: "private-event" });
      expect(JSON.stringify(decision)).not.toMatch(/chain of thought|rationale|guardian|diagnosis|credential|secret-token|webhook/iu);
      expect(decision).not.toHaveProperty("fallbackText");
      expect(decision).not.toHaveProperty("summary");
    }
    expect(counters.snapshot().total).toBe(privateEvents.length);
    expect(sink).toHaveBeenCalledTimes(privateEvents.length);
    expect(JSON.stringify(sink.mock.calls)).not.toMatch(/chain of thought|guardian phi|secret-token|private\.test/iu);
  });

  it("rejects renamed/nested reasoning, system prompts, tool payloads, provider traces, and encoded blobs", () => {
    const attacks = [
      { data: { chain_of_thought: "private" } },
      { nested: [{ thoughtProcess: "private" }] },
      { internal_reasoning: "private" },
      { systemPrompt: "ignore policy" },
      { developer_instructions: ["hidden"] },
      { toolArguments: { amount: 4 } },
      { rawToolResult: { child: "private" } },
      { providerFrame: { delta: "private" } },
      { type: "reasoning.appended", data: {} },
      { contentType: "application/x-provider-frame", data: {} },
      { debugTrace: ["private"] },
      { cause: { stack: "private" } },
      { encodedPayload: "Y2hhaW4gb2YgdGhvdWdodA==" },
      { base64: "Y2hhaW4gb2YgdGhvdWdodA==" },
    ];

    for (const attack of attacks) {
      expect(() => assertNoReasoningPayload(attack)).toThrowError(ReasoningPayloadError);
      try {
        assertNoReasoningPayload(attack);
      } catch (error) {
        expect(error).toMatchObject({ code: "UNSAFE_INTERNAL_PAYLOAD", message: "UNSAFE_INTERNAL_PAYLOAD" });
        expect(JSON.stringify(error)).not.toContain("private");
      }
    }
  });

  it("fails closed on unsafe extras, malformed references, accessors, cycles, and debug mode", () => {
    const counters = createSuppressionCounters();
    const sink = vi.fn();
    const throwing = { type: "message.appended" } as Record<string, unknown>;
    Object.defineProperty(throwing, "data", {
      enumerable: true,
      get() { throw new Error("accessor secret"); },
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cases = [
      appended({ providerMetadata: { secret: "nested" } }),
      { type: "actions.requested", data: { actions: [], sequence: -1, stepIndex: 0, turnId: "turn" } },
      throwing,
    ];

    for (const raw of cases) {
      expect(suppressUnsafeEveEvent(raw, counters, sink, { debug: true }))
        .toMatchObject({ disposition: "fail_closed", code: "UNSAFE_EVE_EVENT" });
    }
    expect(() => assertNoReasoningPayload(cyclic)).toThrowError(ReasoningPayloadError);
    expect(JSON.stringify(sink.mock.calls)).not.toMatch(/accessor|nested|secret/iu);
  });

  it("turns failures into cause-free signals and completion into a minimal boundary", () => {
    const counters = createSuppressionCounters();
    const failure = suppressUnsafeEveEvent({
      type: "turn.failed",
      data: { code: "PROVIDER_RAW", message: "private", details: { stack: "secret" } },
    }, counters);
    const completion = suppressUnsafeEveEvent({
      type: "turn.completed",
      data: { sequence: 8, turnId: "eve-turn-1" },
    }, counters);

    expect(failure).toEqual({
      disposition: "allow",
      exposure: "failure-signal",
      event: { type: "turn.failed", data: {} },
    });
    expect(completion).toEqual({
      disposition: "allow",
      exposure: "turn-boundary",
      event: { type: "turn.completed", data: { sequence: 8, turnId: "eve-turn-1" } },
    });
    expect(JSON.stringify(failure)).not.toMatch(/provider|private|stack|secret/iu);
  });

  it("treats unknown kinds as private and emits type/count-only telemetry", () => {
    const counters = createSuppressionCounters();
    const sink = vi.fn();
    const result = suppressUnsafeEveEvent({
      type: "new.private.event",
      data: { childName: "Synthetic Child", secret: "never" },
    }, counters, sink);

    expect(result).toEqual({
      disposition: "suppress",
      reason: "unknown-event",
      telemetry: { metric: "creciendo_eve_event_suppressed_total", eveKind: "unknown", reason: "unknown-event", count: 1 },
    });
    expect(counters.snapshot()).toEqual({
      total: 1,
      byKind: { unknown: 1 },
      byReason: { "unknown-event": 1 },
    });
    if (result.disposition === "allow") throw new Error("expected suppression");
    expect(sink).toHaveBeenCalledWith(result.telemetry);
    expect(JSON.stringify([result, sink.mock.calls])).not.toMatch(/Synthetic Child|never|new\.private/iu);
  });
});
