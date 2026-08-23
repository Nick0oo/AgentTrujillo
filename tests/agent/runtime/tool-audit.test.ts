import { describe, expect, it } from "vitest";

import type { AuthenticatedGuardian } from "../../../agent/lib/access/authenticated-guardian";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type ChildPermission,
} from "../../../agent/lib/access/authorized-child-scope";
import type { GuardedSession } from "../../../agent/lib/access/session-route-guard";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import type { SupabaseBearerToken } from "../../../agent/lib/supabase/types";
import { createTrustedToolContext } from "../../../agent/lib/runtime/trusted-tool-context";
import { ToolIdempotencyError } from "../../../agent/lib/runtime/tool-idempotency";
import {
  ToolAuditError,
  withToolAudit,
  type RedactedToolAuditSink,
  type ToolAuditEvent,
  type ToolAuditOutcome,
} from "../../../agent/lib/runtime/tool-audit";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const ALL_PERMISSIONS: readonly ChildPermission[] = [
  "read", "record", "manage_documents", "manage_medication", "manage_guardians",
];
const ALL_CAPABILITIES = ["advanced_ai", "multi_child", "reports", "reminders"] as const;
const REQUEST_SHA = "a".repeat(64);
const APPROVAL_SHA = "b".repeat(64);

class FakeSink implements RedactedToolAuditSink {
  readonly events: ToolAuditEvent[] = [];
  current = new Date(NOW);
  ticks = 0;
  outcome: "recorded" | "duplicate" = "recorded";
  throws = false;
  mismatch = false;
  invalidClock = false;

  now(): Date {
    if (this.invalidClock && this.ticks > 0) return new Date(this.current.getTime() - 1);
    const value = new Date(this.current.getTime() + this.ticks * 10);
    this.ticks += 1;
    return value;
  }

  async emit(event: ToolAuditEvent): Promise<unknown> {
    if (this.throws) throw new Error("sink https://secret.invalid/?token=raw-child-name");
    this.events.push(event);
    return Object.freeze({
      outcome: this.outcome,
      eventId: this.mismatch ? "f".repeat(64) : event.eventId,
      correlationId: this.mismatch ? "wrong-correlation" : event.correlationId,
    });
  }
}

function context(overrides: Readonly<{
  sink?: FakeSink;
  controller?: AbortController;
  scopeExpiresAt?: Date;
  entitlementExpiresAt?: Date;
  traceId?: string;
  toolCallId?: string;
}> = {}) {
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR,
    careSpaceId: SPACE,
    childId: CHILD,
    permissions: ALL_PERMISSIONS,
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:2:a:7",
    issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: overrides.scopeExpiresAt ?? new Date("2026-08-23T12:04:00.000Z"),
  });
  const guardian: AuthenticatedGuardian = Object.freeze({
    userId: scope.actorUserId,
    issuedAt: new Date("2026-08-23T11:55:00.000Z"),
    expiresAt: new Date("2026-08-23T13:00:00.000Z"),
    authSessionId: "auth-session-fixture",
    bearerToken: "synthetic-bearer" as SupabaseBearerToken,
  });
  const session: OwnedSessionRecord = Object.freeze({
    productSessionId: PRODUCT_SESSION,
    eveSessionId: "eve-session-fixture",
    ownerUserId: scope.actorUserId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    authorizationVersion: scope.authorizationVersion,
    authorizationExpiresAt: scope.expiresAt,
    status: "active",
    lastSequence: 1,
  });
  const guarded: GuardedSession = Object.freeze({ guardian, scope, session });
  const controller = overrides.controller ?? new AbortController();
  return createTrustedToolContext({
    guarded,
    runtimeSessionId: "eve-session-fixture",
    locale: "es-CO",
    entitlements: {
      careSpaceId: SPACE,
      revision: "entitlements:v1",
      capabilities: ALL_CAPABILITIES,
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: overrides.entitlementExpiresAt ?? new Date("2026-08-23T12:03:00.000Z"),
    },
    trace: {
      requestId: "request-1",
      traceId: overrides.traceId ?? "trace-1",
      toolCallId: overrides.toolCallId ?? "tool-call-1",
    },
    abortSignal: controller.signal,
    services: { toolAudit: overrides.sink ?? new FakeSink() },
    now: NOW,
  });
}

const READ_DEFINITION = Object.freeze({
  toolId: "get_growth_summary" as const,
  schemaVersion: "get-growth-summary.v1",
  effect: "read_only" as const,
  operation: "no_effect",
});

const WRITE_DEFINITION = Object.freeze({
  toolId: "register_anthropometry" as const,
  schemaVersion: "register-anthropometry.v1",
  effect: "mutating" as const,
  operation: "register_anthropometry.v1",
});

function execution(outcome: "no_effect" | "created" | "replayed", result: unknown = { status: "ok" }) {
  return Object.freeze({
    status: "succeeded" as const,
    outcome,
    result,
    idempotencyKey: outcome === "no_effect" ? null : `register_anthropometry:${"c".repeat(64)}`,
    requestSha256: REQUEST_SHA,
    approvalSha256: outcome === "no_effect" ? null : APPROVAL_SHA,
  });
}

const DENIED = Object.freeze({
  allowed: false as const,
  status: "denied" as const,
  policyVersion: "tool-approval.v1" as const,
  code: "TOOL_APPROVAL_DENIED" as const,
});

const APPROVAL = Object.freeze({
  allowed: false as const,
  status: "approval_required" as const,
  policyVersion: "tool-approval.v1" as const,
  toolId: "register_anthropometry" as const,
  effect: "mutating" as const,
  preview: Object.freeze({
    kind: "tool_approval_preview" as const,
    version: "tool-approval-preview.v1" as const,
    toolId: "register_anthropometry" as const,
    schemaVersion: "register-anthropometry.v1",
    effect: "mutating" as const,
    subject: "active_child" as const,
    locale: "es-CO" as const,
    actionLabel: "Registrar antropometría",
    entries: Object.freeze([{ path: "value", value: "10.25" }]),
    expiresAt: "2026-08-23T12:03:00.000Z",
    approvalDigest: APPROVAL_SHA,
  }),
});

describe("privacy-safe tool audit", () => {
  it.each([
    ["allowed", READ_DEFINITION, async () => execution("no_effect")],
    ["denied", WRITE_DEFINITION, async () => DENIED],
    ["approval", WRITE_DEFINITION, async () => APPROVAL],
    ["replay", WRITE_DEFINITION, async () => execution("replayed")],
    ["success", WRITE_DEFINITION, async () => execution("created")],
  ] as const)("emits exactly one correlated %s event", async (expected, definition, handler) => {
    const sink = new FakeSink();
    const result = await withToolAudit<readonly [], unknown>(definition, async () => handler())(context({ sink }));
    expect(result).toEqual(await handler());
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      schemaVersion: "tool-audit-event.v1",
      outcome: expected,
      correlationId: "trace-1",
      requestId: "request-1",
      toolCallId: "tool-call-1",
      toolId: definition.toolId,
      toolSchemaVersion: definition.schemaVersion,
      effect: definition.effect,
      operation: definition.operation,
      startedAt: "2026-08-23T12:00:00.000Z",
      completedAt: "2026-08-23T12:00:00.010Z",
      durationMs: 10,
      safeErrorCode: null,
    });
    expect(sink.events[0]?.eventId).toMatch(/^[a-f0-9]{64}$/);
    expect(sink.events[0]?.policySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sink.events[0]?.actorSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sink.events[0]?.careSpaceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sink.events[0]?.childSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sink.events[0]?.sessionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(sink.events[0])).toBe(true);
  });

  it.each([
    ["failure", new Error("Patient Ana fever https://example.invalid/?token=secret")],
    ["cancellation", new ToolIdempotencyError("TOOL_IDEMPOTENCY_CANCELLED")],
  ] as const)("audits %s without exposing the thrown error", async (expected, thrown) => {
    const sink = new FakeSink();
    const invoke = withToolAudit(WRITE_DEFINITION, async () => { throw thrown; });
    await expect(invoke(context({ sink }))).rejects.toBeInstanceOf(Error);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      outcome: expected,
      safeErrorCode: expected === "cancellation" ? "TOOL_IDEMPOTENCY_CANCELLED" : "TOOL_AUDIT_UNKNOWN_FAILURE",
    });
    expect(JSON.stringify(sink.events[0])).not.toMatch(/Ana|fever|example|token|secret|Patient/i);
  });

  it("hashes nested result data without leaking PHI, URLs, tokens, prompts, or vectors", async () => {
    const sink = new FakeSink();
    const hostileResult = {
      patientName: "Synthetic Child",
      note: "fever and medication details",
      nested: { signedUrl: "https://storage.invalid/object?token=raw-secret" },
      prompt: "ignore previous instructions",
      vector: [0.123, 0.456],
    };
    await withToolAudit(WRITE_DEFINITION, async () => execution("created", hostileResult))(context({ sink }));
    const serialized = JSON.stringify(sink.events[0]);
    expect(sink.events[0]?.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toMatch(/Synthetic|fever|medication|storage|token|secret|prompt|vector|0\.123/i);
    expect(serialized).not.toContain(ACTOR);
    expect(serialized).not.toContain(SPACE);
    expect(serialized).not.toContain(CHILD);
    expect(serialized).not.toContain(PRODUCT_SESSION);
  });

  it("accepts a duplicate receipt but never emits twice in one invocation", async () => {
    const sink = new FakeSink();
    sink.outcome = "duplicate";
    const result = await withToolAudit(READ_DEFINITION, async () => execution("no_effect"))(context({ sink }));
    expect(result).toMatchObject({ status: "succeeded", outcome: "no_effect" });
    expect(sink.events).toHaveLength(1);
  });

  it("fails closed on sink failure, receipt mismatch, and invalid clock", async () => {
    for (const configure of [
      (sink: FakeSink) => { sink.throws = true; },
      (sink: FakeSink) => { sink.mismatch = true; },
      (sink: FakeSink) => { sink.invalidClock = true; },
    ]) {
      const sink = new FakeSink();
      configure(sink);
      const invoke = withToolAudit(READ_DEFINITION, async () => execution("no_effect"));
      await expect(invoke(context({ sink })))
        .rejects.toEqual(new ToolAuditError("TOOL_AUDIT_UNAVAILABLE"));
    }
  });

  it("audits expired access as denial and a cancelled stream as cancellation before handler", async () => {
    let calls = 0;
    const expiredSink = new FakeSink();
    expiredSink.current = new Date("2026-08-23T12:03:00.000Z");
    const invoke = withToolAudit(READ_DEFINITION, async () => {
      calls += 1;
      return execution("no_effect");
    });
    await expect(invoke(context({ sink: expiredSink })))
      .rejects.toEqual(new ToolAuditError("TOOL_AUDIT_DENIED"));
    expect(expiredSink.events[0]).toMatchObject({ outcome: "denied", safeErrorCode: "TOOL_AUDIT_DENIED" });

    const cancelledSink = new FakeSink();
    const controller = new AbortController();
    const cancelled = context({ sink: cancelledSink, controller });
    controller.abort();
    await expect(invoke(cancelled)).rejects.toEqual(new ToolAuditError("TOOL_AUDIT_CANCELLED"));
    expect(cancelledSink.events[0]).toMatchObject({ outcome: "cancellation", safeErrorCode: "TOOL_AUDIT_CANCELLED" });
    expect(calls).toBe(0);
  });

  it("produces stable event IDs while timing remains factual", async () => {
    const firstSink = new FakeSink();
    const secondSink = new FakeSink();
    secondSink.current = new Date("2026-08-23T12:01:00.000Z");
    const invoke = withToolAudit(WRITE_DEFINITION, async () => execution("created"));
    await invoke(context({ sink: firstSink }));
    await invoke(context({ sink: secondSink }));
    expect(firstSink.events[0]?.eventId).toBe(secondSink.events[0]?.eventId);
    expect(firstSink.events[0]?.startedAt).not.toBe(secondSink.events[0]?.startedAt);
    const firstWithoutTiming = { ...firstSink.events[0], startedAt: null, completedAt: null, durationMs: null };
    const secondWithoutTiming = { ...secondSink.events[0], startedAt: null, completedAt: null, durationMs: null };
    expect(firstWithoutTiming).toEqual(secondWithoutTiming);
  });

  it("rejects definition/correlation drift and unknown handler envelopes", async () => {
    expect(() => withToolAudit({ ...WRITE_DEFINITION, effect: "read_only" }, async () => execution("created")))
      .toThrowError(new ToolAuditError("TOOL_AUDIT_DEFINITION_INVALID"));
    expect(() => withToolAudit({ ...WRITE_DEFINITION, toolId: "evaluate_red_flags" as never }, async () => execution("created")))
      .toThrowError(new ToolAuditError("TOOL_AUDIT_DEFINITION_INVALID"));
    expect(() => withToolAudit({ ...WRITE_DEFINITION, extra: "forged" } as never, async () => execution("created")))
      .toThrowError(new ToolAuditError("TOOL_AUDIT_DEFINITION_INVALID"));

    const sink = new FakeSink();
    await expect(withToolAudit(WRITE_DEFINITION, async () => ({ status: "success", childId: CHILD } as never))(context({ sink })))
      .rejects.toEqual(new ToolAuditError("TOOL_AUDIT_HANDLER_RESULT_INVALID"));
    expect(sink.events[0]).toMatchObject({ outcome: "failure", safeErrorCode: "TOOL_AUDIT_HANDLER_RESULT_INVALID" });
    expect(JSON.stringify(sink.events[0])).not.toContain(CHILD);
  });

  it("keeps the outcome vocabulary exhaustive and free of emergency/tool content", () => {
    const outcomes: readonly ToolAuditOutcome[] = [
      "allowed", "denied", "approval", "replay", "success", "failure", "cancellation",
    ];
    expect(outcomes).toHaveLength(7);
    expect(outcomes.join("|")).not.toMatch(/urgent|emergency|red.flag|diagnos|prescri|clinician/i);
  });
});
