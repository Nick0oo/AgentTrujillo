import type { HandleMessageStreamEvent } from "eve/client";
import { describe, expect, it, vi } from "vitest";

import {
  EVE_EVENT_KIND_REGISTRY,
  mapEveEvent,
  type EveEventMappingContext,
  type TrustedMobileProjection,
  type TrustedMobileProjectionRegistry,
} from "../../../src/channels/creciendo/eve-event-mapper";
import { presentEmergencyRecommendation } from "../../../src/presentation/emergency-recommendation";
import { presentProfessionalRecommendation } from "../../../src/presentation/professional-recommendation";
import { presentToolState } from "../../../src/presentation/tool-state";
import { renderProfessionalReview } from "../../../src/safety/professional-review-policy";
import { urgentDecision } from "../../../src/safety/safety-decision";

const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const TURN_ID = "20000000-0000-4000-8000-000000000002";
const EVENT_ID = "30000000-0000-4000-8000-000000000003";
const MESSAGE_ID = "40000000-0000-4000-8000-000000000004";
const CURSOR = "opaque-cursor-value-0000000000000001";
const SOURCE_ID = "eve:turn-1:message.appended:7";

const EVE_KINDS = [
  "action.result",
  "actions.requested",
  "authorization.completed",
  "authorization.required",
  "compaction.completed",
  "compaction.requested",
  "input.requested",
  "message.appended",
  "message.completed",
  "message.received",
  "reasoning.appended",
  "reasoning.completed",
  "result.completed",
  "session.completed",
  "session.failed",
  "session.started",
  "session.waiting",
  "step.completed",
  "step.failed",
  "step.started",
  "subagent.called",
  "subagent.completed",
  "subagent.event",
  "subagent.started",
  "turn.cancelled",
  "turn.completed",
  "turn.failed",
  "turn.started",
] as const satisfies readonly HandleMessageStreamEvent["type"][];

function context(overrides: Partial<EveEventMappingContext> = {}): EveEventMappingContext {
  return {
    eventId: EVENT_ID,
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    messageId: MESSAGE_ID,
    sequence: 11,
    occurredAt: "2026-08-24T15:00:00.000Z",
    cursor: CURSOR,
    sourceEventId: SOURCE_ID,
    expectedEveTurnId: "eve-turn-1",
    effectState: "none",
    completionOutcome: "completed",
    terminalAlreadyEmitted: false,
    seenSourceEventIds: new Set<string>(),
    supportedWidgetVersions: new Set([
      "tool.state.v1",
      "professional.recommendation.v1",
    ]),
    ...overrides,
  };
}

function registry(projection: TrustedMobileProjection | null = null): TrustedMobileProjectionRegistry {
  return Object.freeze({
    resolveTrustedProjection: vi.fn(() => projection),
  });
}

function eveEvent(type: string, data: Readonly<Record<string, unknown>>): unknown {
  return { type, data, meta: { at: "2026-08-24T15:00:00.000Z" } };
}

function messageAppended(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return eveEvent("message.appended", {
    messageDelta: "Respuesta visible.",
    messageSoFar: "Respuesta visible.",
    sequence: 7,
    stepIndex: 0,
    turnId: "eve-turn-1",
    ...overrides,
  });
}

function actionResult(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return eveEvent("action.result", {
    result: {
      callId: "call-secret",
      kind: "tool-call",
      name: "get_growth_summary",
      output: { rawClinicalRecord: "never-mobile" },
    },
    sequence: 8,
    stepIndex: 0,
    status: "completed",
    turnId: "eve-turn-1",
    ...overrides,
  });
}

function toolStateWidget() {
  return presentToolState({
    kind: "trusted_tool_execution_state",
    version: "tool.execution-state.v1",
    toolId: "get_growth_summary",
    operationId: "operation.synthetic-1",
    sequence: 1,
    previous: null,
    state: { status: "queued", effectState: "none", commit: null, error: null },
    specializedWidget: null,
  }, "es-CO");
}

describe("Eve 0.27.13 to Creciendo event mapper", () => {
  it("pins every installed Eve event kind in one exhaustive registry", () => {
    expect(Object.keys(EVE_EVENT_KIND_REGISTRY).sort()).toEqual([...EVE_KINDS].sort());
    expect(new Set(Object.keys(EVE_EVENT_KIND_REGISTRY)).size).toBe(EVE_KINDS.length);
  });

  it("maps only the bounded assistant delta and preserves public/source ordering separately", () => {
    const trustedRegistry = registry();
    const mapped = mapEveEvent(messageAppended({
      reasoning: "private chain of thought",
      prompt: "hidden system instruction",
      providerMetadata: { credential: "secret-value" },
    }), context(), trustedRegistry);

    expect(mapped).toEqual({
      disposition: "emit",
      source: {
        eventId: SOURCE_ID,
        eveKind: "message.appended",
        eveSequence: 7,
      },
      event: {
        version: "creciendo.channel-event.v1",
        eventId: EVENT_ID,
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        sequence: 11,
        occurredAt: "2026-08-24T15:00:00.000Z",
        cursor: CURSOR,
        type: "text-delta",
        terminal: false,
        data: { text: "Respuesta visible." },
      },
    });
    expect(JSON.stringify(mapped)).not.toMatch(/reasoning|prompt|provider|credential|secret/iu);
    expect(trustedRegistry.resolveTrustedProjection).not.toHaveBeenCalled();
    if (mapped.disposition !== "emit") throw new Error("expected emit");
    expect(Object.isFrozen(mapped.event)).toBe(true);
  });

  it("never treats raw tool/model results as trusted mobile data", () => {
    const rawTool = mapEveEvent(actionResult(), context({ sourceEventId: "eve:action:8" }), registry());
    const rawModel = mapEveEvent(eveEvent("result.completed", {
      result: { kind: "growth_summary", privateChildId: SESSION_ID },
      sequence: 9,
      stepIndex: 0,
      turnId: "eve-turn-1",
    }), context({ sourceEventId: "eve:result:9" }), registry());

    expect(rawTool).toMatchObject({ disposition: "drop", reason: "untrusted-tool-payload" });
    expect(rawModel).toMatchObject({ disposition: "drop", reason: "untrusted-model-result" });
    expect(JSON.stringify([rawTool, rawModel])).not.toContain("never-mobile");
    expect(JSON.stringify([rawTool, rawModel])).not.toContain(SESSION_ID);
  });

  it("emits a tool state only from an out-of-band trusted registry projection", () => {
    const widget = toolStateWidget();
    const trustedRegistry = registry({ kind: "widget", widget });
    const mapped = mapEveEvent(
      actionResult({ result: { output: { prompt: "untrusted", childId: SESSION_ID } } }),
      context({ sourceEventId: "eve:action:8" }),
      trustedRegistry,
    );

    expect(mapped).toMatchObject({
      disposition: "emit",
      source: { eventId: "eve:action:8", eveKind: "action.result", eveSequence: 8 },
      event: { type: "tool-state", terminal: false, data: { widget } },
    });
    expect(trustedRegistry.resolveTrustedProjection).toHaveBeenCalledWith({
      sourceEventId: "eve:action:8",
      eveKind: "action.result",
      eveSequence: 8,
      expectedEveTurnId: "eve-turn-1",
    });
    expect(JSON.stringify(mapped)).not.toMatch(/untrusted|childId/iu);
  });

  it("maps strict widgets and public citations but rejects mismatches and unsafe URLs", () => {
    const widget = toolStateWidget();
    const professionalWidget = presentProfessionalRecommendation(
      renderProfessionalReview("rule_unavailable", "es-CO"),
      "es-CO",
    );
    const invalidVersion = { ...widget, version: "tool.state.v2" };
    const invalidWidget = mapEveEvent(
      actionResult(),
      context({ sourceEventId: "eve:action:bad-widget" }),
      registry({ kind: "widget", widget: invalidVersion }),
    );
    const citation = mapEveEvent(
      actionResult(),
      context({ sourceEventId: "eve:action:citation" }),
      registry({
        kind: "citation",
        citationId: "source.who-growth",
        label: "WHO Child Growth Standards",
        href: "https://www.who.int/tools/child-growth-standards",
      }),
    );
    const unsafeCitation = mapEveEvent(
      actionResult(),
      context({ sourceEventId: "eve:action:unsafe-citation" }),
      registry({
        kind: "citation",
        citationId: "source.private",
        label: "Private source",
        href: "https://example.test/source?token=secret",
      }),
    );
    const uiPart = mapEveEvent(
      actionResult(),
      context({ sourceEventId: "eve:action:professional-widget" }),
      registry({ kind: "widget", widget: professionalWidget }),
    );
    const clientMismatch = mapEveEvent(
      actionResult(),
      context({
        sourceEventId: "eve:action:unsupported-widget",
        supportedWidgetVersions: new Set(["tool.state.v1"]),
      }),
      registry({ kind: "widget", widget: professionalWidget }),
    );

    expect(invalidWidget).toMatchObject({ disposition: "fail_closed", code: "TRUSTED_PROJECTION_INVALID" });
    expect(citation).toMatchObject({
      disposition: "emit",
      event: {
        type: "citation",
        data: {
          citationId: "source.who-growth",
          label: "WHO Child Growth Standards",
          href: "https://www.who.int/tools/child-growth-standards",
        },
      },
    });
    expect(unsafeCitation).toMatchObject({ disposition: "fail_closed", code: "TRUSTED_PROJECTION_INVALID" });
    expect(uiPart).toMatchObject({
      disposition: "emit",
      event: { type: "ui-part", data: { widget: professionalWidget } },
    });
    expect(clientMismatch).toMatchObject({
      disposition: "fail_closed",
      code: "WIDGET_VERSION_UNSUPPORTED",
    });
    expect(JSON.stringify(unsafeCitation)).not.toContain("token=secret");
  });

  it("rejects every Eve-originated emergency spoof and never emits an emergency event", () => {
    const emergency = presentEmergencyRecommendation(
      urgentDecision(["synthetic-critical-rule"], "emergency_department_es_co_v1"),
      "es-CO",
    );
    const trustedSpoof = mapEveEvent(
      actionResult(),
      context({ sourceEventId: "eve:action:emergency-spoof" }),
      registry({ kind: "widget", widget: emergency }),
    );
    const modelSpoof = mapEveEvent(eveEvent("result.completed", {
      result: emergency,
      sequence: 9,
      stepIndex: 0,
      turnId: "eve-turn-1",
    }), context({ sourceEventId: "eve:result:emergency-spoof" }), registry());

    expect(trustedSpoof).toMatchObject({ disposition: "fail_closed", code: "EVE_EMERGENCY_FORBIDDEN" });
    expect(modelSpoof).toMatchObject({ disposition: "fail_closed", code: "EVE_EMERGENCY_FORBIDDEN" });
    expect(JSON.stringify([trustedSpoof, modelSpoof])).not.toContain("Acudan directamente");
  });

  it("maps only turn completion to one terminal public completion", () => {
    const complete = mapEveEvent(eveEvent("turn.completed", {
      sequence: 10,
      turnId: "eve-turn-1",
      details: { prompt: "must-not-copy" },
    }), context({ effectState: "committed" }), registry());
    const cancelled = mapEveEvent(eveEvent("turn.cancelled", {
      sequence: 10,
      turnId: "eve-turn-1",
    }), context(), registry());
    const completedSession = mapEveEvent({ type: "session.completed" }, context(), registry());

    expect(complete).toMatchObject({
      disposition: "emit",
      event: {
        type: "message-complete",
        terminal: true,
        data: { messageId: MESSAGE_ID, outcome: "completed", effectState: "committed" },
      },
    });
    expect(JSON.stringify(complete)).not.toContain("must-not-copy");
    expect(cancelled).toMatchObject({ disposition: "drop", reason: "public-cancel-ledger-owned" });
    expect(completedSession).toMatchObject({ disposition: "drop", reason: "duplicate-lifecycle-boundary" });
  });

  it("fails closed without attacker content on unknown kinds, failures, duplicate sources, or terminal append", () => {
    const throwingEvent = Object.create(null) as Record<string, unknown>;
    throwingEvent.type = "message.appended";
    Object.defineProperty(throwingEvent, "data", {
      enumerable: true,
      get() { throw new Error("getter-secret"); },
    });
    const cases = [
      mapEveEvent({ type: "provider.frame.v99", data: { secret: "unknown-secret" } }, context(), registry()),
      mapEveEvent(eveEvent("turn.failed", {
        code: "PROVIDER_RAW_CODE",
        message: "raw provider secret",
        details: { stack: "trace" },
        sequence: 10,
        turnId: "eve-turn-1",
      }), context(), registry()),
      mapEveEvent(messageAppended(), context({ seenSourceEventIds: new Set([SOURCE_ID]) }), registry()),
      mapEveEvent(messageAppended(), context({ terminalAlreadyEmitted: true }), registry()),
      mapEveEvent(throwingEvent, context(), registry()),
    ];

    expect(cases).toMatchObject([
      { disposition: "fail_closed", code: "UNKNOWN_EVE_EVENT", closeStream: true },
      { disposition: "fail_closed", code: "EVE_FAILURE", closeStream: true },
      { disposition: "fail_closed", code: "DUPLICATE_SOURCE_EVENT", closeStream: true },
      { disposition: "fail_closed", code: "EVENT_AFTER_TERMINAL", closeStream: true },
      { disposition: "fail_closed", code: "EVE_EVENT_INVALID", closeStream: true },
    ]);
    const serialized = JSON.stringify(cases);
    expect(serialized).not.toMatch(/unknown-secret|provider_raw_code|raw provider|stack|trace|getter-secret/iu);
  });

  it("fails closed on turn/source identity drift and payload/contract limits", () => {
    const wrongTurn = mapEveEvent(messageAppended({ turnId: "eve-turn-foreign" }), context(), registry());
    const unsafeText = mapEveEvent(messageAppended({ messageDelta: "bad\u0000text" }), context(), registry());
    const oversized = mapEveEvent(messageAppended({ messageDelta: "x".repeat(4_097) }), context(), registry());
    const unsafeSource = mapEveEvent(messageAppended(), context({ sourceEventId: "source with spaces" }), registry());

    for (const result of [wrongTurn, unsafeText, oversized, unsafeSource]) {
      expect(result).toMatchObject({ disposition: "fail_closed", closeStream: true });
      expect(JSON.stringify(result).length).toBeLessThan(1_000);
    }
  });

  it("classifies all 28 installed kinds without allowing an implicit default", () => {
    for (const eveKind of EVE_KINDS) {
      const result = mapEveEvent({ type: eveKind, data: {} }, context({
        sourceEventId: `eve:classification:${eveKind}`,
      }), registry());
      if (result.disposition === "fail_closed") {
        expect(result.code).not.toBe("UNKNOWN_EVE_EVENT");
        expect(result.telemetry.eveKind).toBe(eveKind);
      }
    }
  });
});
