import { describe, expect, it } from "vitest";

import {
  TOOL_STATE_INPUT_SCHEMA,
  TOOL_STATE_SCHEMA,
  ToolStatePresentationError,
  presentToolState,
} from "../../src/presentation/tool-state";

const HASH = "a".repeat(64);
const WIDGET = Object.freeze({
  kind: "growth_summary",
  version: "growth.summary.v1",
  reference: `widget:v1:${"b".repeat(64)}`,
});

const ERROR = Object.freeze({
  kind: "tool_error" as const,
  version: "safe-tool-error.v1" as const,
  code: "TIMEOUT" as const,
  retryable: false,
  retryAfterSeconds: null,
});

function input(
  state: Record<string, unknown>,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    kind: "trusted_tool_execution_state",
    version: "tool.execution-state.v1",
    toolId: "get_growth_summary",
    operationId: "operation.synthetic-1",
    sequence: 3,
    previous: { sequence: 2, status: "running" },
    state,
    specializedWidget: null,
    ...overrides,
  };
}

const STATES = [
  ["queued", input({ status: "queued", effectState: "none", commit: null, error: null }, {
    sequence: 1,
    previous: null,
  })],
  ["running", input({ status: "running", effectState: "none", commit: null, error: null })],
  ["awaiting_confirmation", input({
    status: "awaiting_confirmation",
    effectState: "none",
    commit: null,
    error: null,
    confirmationRequired: true,
  }, {
    toolId: "register_anthropometry",
    specializedWidget: WIDGET,
    previous: { sequence: 2, status: "queued" },
  })],
  ["succeeded", input({
    status: "succeeded",
    effectState: "committed",
    commit: { status: "persisted", outcome: "created", resultSha256: HASH },
    error: null,
  }, { toolId: "register_anthropometry", specializedWidget: WIDGET })],
  ["failed", input({ status: "failed", effectState: "unknown", commit: null, error: ERROR })],
  ["cancelled", input({
    status: "cancelled",
    effectState: "unknown",
    commit: null,
    error: { ...ERROR, code: "CANCELLED" },
  })],
] as const;

describe("generic tool-state presenter", () => {
  it.each(STATES)("renders the exact %s state without claiming more", (status, raw) => {
    const result = presentToolState(raw, "es-CO");

    expect(TOOL_STATE_INPUT_SCHEMA.safeParse(raw).success).toBe(true);
    expect(TOOL_STATE_SCHEMA.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      kind: "tool_state",
      version: "tool.state.v1",
      data: {
        locale: "es-CO",
        toolDisplayKey: `tool.${raw.toolId}`,
        operationId: "operation.synthetic-1",
        sequence: raw.sequence,
        status,
        effectState: raw.state.effectState,
        terminal: ["succeeded", "failed", "cancelled"].includes(status),
      },
    });
  });

  it("rejects out-of-order, regressive, impossible, and post-terminal transitions", () => {
    const attacks = [
      input({ status: "running", effectState: "none", commit: null, error: null }, {
        sequence: 2,
        previous: { sequence: 2, status: "queued" },
      }),
      input({ status: "running", effectState: "none", commit: null, error: null }, {
        previous: { sequence: 2, status: "succeeded" },
      }),
      input({
        status: "succeeded",
        effectState: "committed",
        commit: { status: "persisted", outcome: "created", resultSha256: HASH },
        error: null,
      }, { previous: { sequence: 2, status: "queued" } }),
      input({
        status: "awaiting_confirmation",
        effectState: "none",
        commit: null,
        error: null,
        confirmationRequired: true,
      }),
      input({ status: "running", effectState: "none", commit: null, error: null }, { previous: null }),
      input({
        status: "awaiting_confirmation",
        effectState: "none",
        commit: null,
        error: null,
        confirmationRequired: true,
      }),
      input({ status: "running", effectState: "none", commit: null, error: null }, {
        toolId: "register_anthropometry",
        previous: { sequence: 2, status: "queued" },
      }),
      input({
        status: "succeeded",
        effectState: "committed",
        commit: { status: "persisted", outcome: "replayed", resultSha256: HASH },
        error: null,
      }, {
        toolId: "register_anthropometry",
        previous: { sequence: 2, status: "queued" },
      }),
    ];

    for (const attack of attacks) {
      expect(() => presentToolState(attack, "es-CO")).toThrowError(ToolStatePresentationError);
    }
  });

  it("allows a consequential tool to run only after its confirmation state", () => {
    const approved = input({ status: "running", effectState: "none", commit: null, error: null }, {
      toolId: "register_anthropometry",
      previous: { sequence: 2, status: "awaiting_confirmation" },
    });

    expect(presentToolState(approved, "es-CO").data).toMatchObject({
      toolDisplayKey: "tool.register_anthropometry",
      status: "running",
    });
  });

  it("renders exact duplicate snapshots deterministically without creating an effect", () => {
    const raw = STATES[1][1];
    const first = presentToolState(raw, "en-US");
    const second = presentToolState(structuredClone(raw), "en-US");
    expect(first).toEqual(second);
  });

  it("requires a persisted result for success and preserves replay truth", () => {
    const replay = input({
      status: "succeeded",
      effectState: "committed",
      commit: { status: "persisted", outcome: "replayed", resultSha256: HASH },
      error: null,
    }, {
      toolId: "register_anthropometry",
      previous: { sequence: 2, status: "awaiting_confirmation" },
    });
    const result = presentToolState(replay, "en-US");
    expect(result.data).toMatchObject({ status: "succeeded", commitOutcome: "replayed" });
    expect(result.data.retry).toEqual({ allowed: false, afterSeconds: null });

    for (const attack of [
      input({ status: "succeeded", effectState: "committed", commit: null, error: null }),
      input({
        status: "succeeded",
        effectState: "none",
        commit: { status: "persisted", outcome: "created", resultSha256: HASH },
        error: null,
      }),
      input({
        status: "succeeded",
        effectState: "committed",
        commit: { status: "persisted", outcome: "created", resultSha256: "raw-result" },
        error: null,
      }),
    ]) expect(() => presentToolState(attack, "en-US")).toThrowError(ToolStatePresentationError);
  });

  it("persists read-only success without claiming a committed domain effect", () => {
    const readOnly = input({
      status: "succeeded",
      effectState: "none",
      commit: { status: "persisted", outcome: "no_effect", resultSha256: HASH },
      error: null,
    });

    expect(presentToolState(readOnly, "en-US").data).toMatchObject({
      status: "succeeded",
      effectState: "none",
      commitOutcome: "no_effect",
    });

    const readOnlyClaimingWrite = input({
      status: "succeeded",
      effectState: "committed",
      commit: { status: "persisted", outcome: "created", resultSha256: HASH },
      error: null,
    });
    const writeHidingEffect = input({
      status: "succeeded",
      effectState: "none",
      commit: { status: "persisted", outcome: "no_effect", resultSha256: HASH },
      error: null,
    }, { toolId: "register_anthropometry" });
    for (const attack of [readOnlyClaimingWrite, writeHidingEffect]) {
      expect(() => presentToolState(attack, "en-US")).toThrowError(ToolStatePresentationError);
    }
  });

  it("offers retry only for a safe transient failure proven before any effect", () => {
    const retryable = input({
      status: "failed",
      effectState: "none",
      commit: null,
      error: { ...ERROR, retryable: true },
    });
    expect(presentToolState(retryable, "en-US").data.retry).toEqual({
      allowed: true,
      afterSeconds: null,
    });
    const rateLimited = input({
      status: "failed",
      effectState: "none",
      commit: null,
      error: {
        ...ERROR,
        code: "RATE_LIMITED",
        retryable: true,
        retryAfterSeconds: 30,
      },
    });
    expect(presentToolState(rateLimited, "en-US").data.retry).toEqual({
      allowed: true,
      afterSeconds: 30,
    });

    for (const attack of [
      input({ status: "failed", effectState: "unknown", commit: null, error: { ...ERROR, retryable: true } }),
      input({ status: "failed", effectState: "none", commit: null, error: { ...ERROR, code: "INPUT_INVALID", retryable: true } }),
      input({ status: "failed", effectState: "none", commit: null, error: { ...ERROR, retryAfterSeconds: 30 } }),
    ]) expect(() => presentToolState(attack, "en-US")).toThrowError(ToolStatePresentationError);
  });

  it("preserves unknown-effect cancellation races and never advertises retry", () => {
    const cancelled = STATES[5][1];
    expect(presentToolState(cancelled, "es-CO").data).toMatchObject({
      status: "cancelled",
      effectState: "unknown",
      error: { code: "CANCELLED" },
      retry: { allowed: false, afterSeconds: null },
    });
    expect(() => presentToolState(input({
      status: "cancelled",
      effectState: "committed",
      commit: null,
      error: { ...ERROR, code: "CANCELLED" },
    }), "es-CO")).toThrowError(ToolStatePresentationError);
  });

  it("rejects raw payloads, internal errors, authority, actions, and unsafe widget references", () => {
    const raw = STATES[4][1];
    const attacks = [
      { ...raw, rawInput: { childId: "private-child" } },
      { ...raw, careSpaceId: "private-space" },
      { ...raw, state: { ...raw.state, stack: "SELECT * FROM private_table" } },
      { ...raw, state: { ...raw.state, error: { ...ERROR, message: "provider secret" } } },
      { ...raw, specializedWidget: { ...WIDGET, payload: { html: "<script>" } } },
      { ...raw, specializedWidget: { ...WIDGET, reference: "https://example.invalid/private" } },
      { ...raw, action: "retry_tool" },
      { ...raw, toolId: "evaluate_red_flags" },
    ];
    for (const attack of attacks) {
      expect(() => presentToolState(attack, "es-CO")).toThrowError(ToolStatePresentationError);
    }
  });

  it("keeps specialized widgets reference-only and only where presentation is safe", () => {
    expect(presentToolState(STATES[2][1], "es-CO").data.specializedWidget).toEqual(WIDGET);
    expect(presentToolState(STATES[3][1], "es-CO").data.specializedWidget).toEqual(WIDGET);
    expect(() => presentToolState({ ...STATES[1][1], specializedWidget: WIDGET }, "es-CO"))
      .toThrowError(ToolStatePresentationError);
    expect(() => presentToolState({
      ...STATES[2][1],
      specializedWidget: { ...WIDGET, kind: "emergency_recommendation" },
    }, "es-CO")).toThrowError(ToolStatePresentationError);
  });

  it("is accessible, localized, deeply immutable, and clinically neutral", () => {
    const es = presentToolState(STATES[4][1], "es-CO");
    const en = presentToolState(STATES[4][1], "en-US");
    expect(es.data.accessibility).toEqual({
      liveRegion: "assertive",
      announcement: "No se pudo completar la operación.",
      fallbackText: "No se pudo completar la operación.",
    });
    expect(en.data.accessibility.announcement).toBe("The operation could not be completed.");
    expect(Object.isFrozen(es)).toBe(true);
    expect(Object.isFrozen(es.data)).toBe(true);
    expect(Object.isFrozen(es.data.accessibility)).toBe(true);
    expect(JSON.stringify(es)).not.toMatch(/diagn[oó]st|prescri|medic|doctor|patient|child|careSpace|stack|sql|provider|prompt|reasoning|https?:/iu);
  });
});
