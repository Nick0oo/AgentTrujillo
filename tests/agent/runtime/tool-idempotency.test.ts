import { z } from "zod";
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
import type {
  ApprovalConsumptionRequest,
  ApprovalPreview,
  ToolApprovalPort,
} from "../../../agent/lib/runtime/tool-approval-policy";
import {
  ToolIdempotencyError,
  withToolIdempotency,
  type IdempotentToolContext,
  type ToolHandlerOutcome,
} from "../../../agent/lib/runtime/tool-idempotency";
import { mapToolError } from "../../../agent/lib/runtime/safe-tool-errors";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const OTHER_SPACE = "00000000-0000-4000-8000-000000000012";
const CHILD = "00000000-0000-4000-8000-000000000003";
const SIBLING = "00000000-0000-4000-8000-000000000013";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const ALL_PERMISSIONS: readonly ChildPermission[] = [
  "read", "record", "manage_documents", "manage_medication", "manage_guardians",
];
const ALL_CAPABILITIES = ["advanced_ai", "multi_child", "reports", "reminders"] as const;
const INPUT_SCHEMA = z.object({
  observedOn: z.string().date(),
  value: z.number().finite().positive(),
}).strict();
const RESULT_SCHEMA = z.object({
  status: z.literal("recorded"),
  version: z.literal(1),
}).strict();
const PAYLOAD = Object.freeze({ observedOn: "2026-08-22", value: 10.25 });

type ApprovalRecord = Readonly<{
  digest: string;
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  productSessionId: string;
  expiresAt: string;
}>;

class FakeApprovalPort implements ToolApprovalPort {
  readonly approvals = new Map<string, ApprovalRecord>();
  readonly consumed = new Set<string>();
  readonly order: string[];
  current = new Date(NOW);

  constructor(order: string[] = []) {
    this.order = order;
  }

  now(): Date {
    return new Date(this.current);
  }

  issue(token: string, preview: ApprovalPreview, overrides: Partial<ApprovalRecord> = {}): void {
    this.approvals.set(token, Object.freeze({
      digest: preview.approvalDigest,
      actorUserId: ACTOR,
      careSpaceId: SPACE,
      childId: CHILD,
      productSessionId: PRODUCT_SESSION,
      expiresAt: preview.expiresAt,
      ...overrides,
    }));
  }

  async consume(request: ApprovalConsumptionRequest): Promise<unknown> {
    this.order.push("approval");
    const stored = this.approvals.get(request.token);
    if (!stored) return Object.freeze({ status: "not_found" as const });
    if (this.consumed.has(request.token)) return Object.freeze({ status: "replayed" as const });
    if (stored.digest !== request.approvalDigest
      || stored.actorUserId !== request.actorUserId
      || stored.careSpaceId !== request.careSpaceId
      || stored.childId !== request.childId
      || stored.productSessionId !== request.productSessionId
      || stored.expiresAt !== request.expiresAt) return Object.freeze({ status: "mismatch" as const });
    this.consumed.add(request.token);
    return Object.freeze({
      status: "consumed" as const,
      approvalId: `approval-${request.token}`,
      approvalDigest: request.approvalDigest,
      confirmedAt: this.current.toISOString(),
      expiresAt: request.expiresAt,
      channel: "guardian_ui" as const,
    });
  }
}

function context(overrides: Readonly<{
  port?: FakeApprovalPort;
  careSpaceId?: string;
  childId?: string;
  productSessionId?: string;
  toolCallId?: string;
  controller?: AbortController;
  scopeIssuedAt?: Date;
  scopeExpiresAt?: Date;
  entitlementExpiresAt?: Date;
}> = {}) {
  const careSpaceId = overrides.careSpaceId ?? SPACE;
  const childId = overrides.childId ?? CHILD;
  const productSessionId = overrides.productSessionId ?? PRODUCT_SESSION;
  const port = overrides.port ?? new FakeApprovalPort();
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR,
    careSpaceId,
    childId,
    permissions: ALL_PERMISSIONS,
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:2:a:7",
    issuedAt: overrides.scopeIssuedAt ?? new Date("2026-08-23T11:59:00.000Z"),
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
    productSessionId,
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
      careSpaceId,
      revision: "entitlements:v1",
      capabilities: ALL_CAPABILITIES,
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: overrides.entitlementExpiresAt ?? new Date("2026-08-23T12:03:00.000Z"),
    },
    trace: {
      requestId: "request-1",
      traceId: "trace-1",
      toolCallId: overrides.toolCallId ?? "tool-call-1",
    },
    abortSignal: controller.signal,
    services: {
      toolApproval: port,
      toolIdempotency: Object.freeze({ now: () => port.now() }),
    },
    now: NOW,
  });
}

type StoredResult = Readonly<{ digest: string; result: unknown }>;

class DomainLedger {
  readonly stored = new Map<string, StoredResult>();
  readonly pending = new Map<string, Promise<unknown>>();
  effectCalls = 0;

  private key(runtime: IdempotentToolContext): string {
    return [
      runtime.scope.careSpaceId,
      runtime.scope.childId,
      runtime.scope.actorUserId,
      runtime.operation,
      runtime.idempotencyKey,
    ].join("|");
  }

  async execute(
    runtime: IdempotentToolContext,
    effect: () => Promise<unknown>,
  ): Promise<ToolHandlerOutcome<unknown>> {
    const key = this.key(runtime);
    const existing = this.stored.get(key);
    if (existing) {
      return existing.digest === runtime.requestSha256
        ? Object.freeze({ status: "committed" as const, outcome: "replayed" as const, result: existing.result })
        : Object.freeze({ status: "conflict" as const });
    }
    const pending = this.pending.get(key);
    if (pending) {
      await pending;
      return this.execute(runtime, effect);
    }
    const execution = (async () => {
      this.effectCalls += 1;
      const result = await effect();
      this.stored.set(key, Object.freeze({ digest: runtime.requestSha256, result }));
      return result;
    })();
    this.pending.set(key, execution);
    try {
      const result = await execution;
      return Object.freeze({ status: "committed" as const, outcome: "created" as const, result });
    } finally {
      this.pending.delete(key);
    }
  }
}

const MUTATION_DEFINITION = Object.freeze({
  toolId: "register_anthropometry" as const,
  schemaVersion: "register-anthropometry.v1",
  effect: "mutating" as const,
  operation: "register_anthropometry.v1",
  inputSchema: INPUT_SCHEMA,
  resultSchema: RESULT_SCHEMA,
});

function mutation(
  ledger: DomainLedger,
  options: Readonly<{
    order?: string[];
    controller?: AbortController;
    result?: unknown;
    throws?: boolean;
    cancelled?: boolean;
  }> = {},
) {
  return withToolIdempotency(MUTATION_DEFINITION, async (runtime) => {
    options.order?.push("handler");
    if (options.throws) throw new Error("synthetic partial failure");
    if (options.cancelled) return Object.freeze({ status: "cancelled" as const });
    return ledger.execute(runtime, async () => {
      options.order?.push("effect");
      options.controller?.abort();
      return options.result ?? Object.freeze({ status: "recorded", version: 1 });
    });
  });
}

async function previewFrom(
  invoke: ReturnType<typeof mutation>,
  trusted = context(),
  rawInput: unknown = PAYLOAD,
): Promise<ApprovalPreview> {
  const pending = await invoke(trusted, rawInput, null);
  expect(pending).toMatchObject({ allowed: false, status: "approval_required" });
  if (!("preview" in pending)) throw new Error("approval preview expected");
  return pending.preview;
}

describe("tool idempotency wrapper", () => {
  it("rejects definition drift and requires read-only tools to declare no_effect", () => {
    const handler = async () => Object.freeze({ status: "no_effect" as const, result: { status: "recorded", version: 1 } });
    expect(() => withToolIdempotency({ ...MUTATION_DEFINITION, effect: "read_only" }, handler))
      .toThrowError(new ToolIdempotencyError("TOOL_IDEMPOTENCY_DEFINITION_INVALID"));
    expect(() => withToolIdempotency({ ...MUTATION_DEFINITION, toolId: "unknown_tool" as never }, handler))
      .toThrowError(new ToolIdempotencyError("TOOL_IDEMPOTENCY_DEFINITION_INVALID"));
    expect(() => withToolIdempotency({
      ...MUTATION_DEFINITION,
      toolId: "get_growth_summary",
      effect: "read_only",
      operation: "get_growth_summary.v1",
    }, handler)).toThrowError(new ToolIdempotencyError("TOOL_IDEMPOTENCY_DEFINITION_INVALID"));
  });

  it("executes a read-only tool only with an explicit no_effect outcome", async () => {
    let calls = 0;
    const invoke = withToolIdempotency({
      toolId: "get_growth_summary",
      schemaVersion: "get-growth-summary.v1",
      effect: "read_only",
      operation: "no_effect",
      inputSchema: INPUT_SCHEMA,
      resultSchema: RESULT_SCHEMA,
    }, async (runtime) => {
      calls += 1;
      expect(runtime.idempotencyKey).toBeNull();
      expect(runtime.approvalSha256).toBeNull();
      return Object.freeze({ status: "no_effect" as const, result: { status: "recorded", version: 1 } });
    });
    const result = await invoke(context(), PAYLOAD, null);
    expect(result).toMatchObject({
      status: "succeeded",
      outcome: "no_effect",
      idempotencyKey: null,
      approvalSha256: null,
      result: { status: "recorded", version: 1 },
    });
    expect(result).toHaveProperty("requestSha256", expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(calls).toBe(1);
  });

  it("never reaches the domain ledger before strict validation and approval", async () => {
    const order: string[] = [];
    const port = new FakeApprovalPort(order);
    const ledger = new DomainLedger();
    const invoke = mutation(ledger, { order });
    expect(await invoke(context({ port }), PAYLOAD, null)).toMatchObject({ status: "approval_required" });
    expect(await invoke(context({ port }), { ...PAYLOAD, childId: CHILD }, null))
      .toMatchObject({ status: "denied" });
    expect(order).toEqual([]);
    expect(ledger.effectCalls).toBe(0);

    const preview = await previewFrom(invoke, context({ port }));
    port.issue("ui-token-order", preview);
    const result = await invoke(context({ port }), PAYLOAD, { preview, token: "ui-token-order" });
    expect(result).toMatchObject({ status: "succeeded", outcome: "created" });
    expect(order).toEqual(["approval", "handler", "effect"]);
  });

  it("returns created then durable replay with the same derived key and no second effect", async () => {
    const port = new FakeApprovalPort();
    const trusted = context({ port });
    const ledger = new DomainLedger();
    const invoke = mutation(ledger);
    const preview = await previewFrom(invoke, trusted);
    port.issue("ui-token-first", preview);
    const first = await invoke(trusted, PAYLOAD, { preview, token: "ui-token-first" });
    port.current = new Date("2026-08-23T12:01:00.000Z");
    const refreshed = context({
      port,
      scopeIssuedAt: new Date("2026-08-23T12:00:00.000Z"),
      scopeExpiresAt: new Date("2026-08-23T12:05:00.000Z"),
      entitlementExpiresAt: new Date("2026-08-23T12:05:00.000Z"),
    });
    const refreshedPreview = await previewFrom(invoke, refreshed);
    expect(refreshedPreview.expiresAt).not.toBe(preview.expiresAt);
    expect(refreshedPreview.approvalDigest).toBe(preview.approvalDigest);
    port.issue("ui-token-second", refreshedPreview);
    const replay = await invoke(refreshed, PAYLOAD, { preview: refreshedPreview, token: "ui-token-second" });
    expect(first).toMatchObject({ status: "succeeded", outcome: "created" });
    expect(replay).toMatchObject({ status: "succeeded", outcome: "replayed" });
    if (!("idempotencyKey" in first) || !("idempotencyKey" in replay)) throw new Error("execution expected");
    expect(replay.idempotencyKey).toBe(first.idempotencyKey);
    expect(replay.requestSha256).toBe(first.requestSha256);
    expect(ledger.effectCalls).toBe(1);
  });

  it("converges concurrent duplicates through the domain ledger", async () => {
    const port = new FakeApprovalPort();
    const ledger = new DomainLedger();
    const invoke = mutation(ledger);
    const preview = await previewFrom(invoke, context({ port }));
    port.issue("ui-token-concurrent-a", preview);
    port.issue("ui-token-concurrent-b", preview);
    const outcomes = await Promise.all([
      invoke(context({ port }), PAYLOAD, { preview, token: "ui-token-concurrent-a" }),
      invoke(context({ port }), PAYLOAD, { preview, token: "ui-token-concurrent-b" }),
    ]);
    expect(outcomes.map((value) => "outcome" in value ? value.outcome : "denied").sort()).toEqual(["created", "replayed"]);
    expect(ledger.effectCalls).toBe(1);
  });

  it("turns same-key changed input into conflict without a changed effect", async () => {
    const port = new FakeApprovalPort();
    const ledger = new DomainLedger();
    const invoke = mutation(ledger);
    const firstPreview = await previewFrom(invoke, context({ port }));
    port.issue("ui-token-conflict-a", firstPreview);
    await invoke(context({ port }), PAYLOAD, { preview: firstPreview, token: "ui-token-conflict-a" });
    const changed = Object.freeze({ ...PAYLOAD, value: 11.5 });
    const secondPreview = await previewFrom(invoke, context({ port }), changed);
    port.issue("ui-token-conflict-b", secondPreview);
    await expect(invoke(context({ port }), changed, { preview: secondPreview, token: "ui-token-conflict-b" }))
      .rejects.toEqual(new ToolIdempotencyError("TOOL_IDEMPOTENCY_CONFLICT"));
    expect(ledger.effectCalls).toBe(1);
  });

  it("binds replay identity to trusted scope while keeping the key opaque", async () => {
    const port = new FakeApprovalPort();
    const ledger = new DomainLedger();
    const invoke = mutation(ledger);
    const firstPreview = await previewFrom(invoke, context({ port }));
    port.issue("ui-token-scope-a", firstPreview);
    const first = await invoke(context({ port }), PAYLOAD, { preview: firstPreview, token: "ui-token-scope-a" });

    const siblingContext = context({ port, careSpaceId: OTHER_SPACE, childId: SIBLING });
    const siblingPreview = await previewFrom(invoke, siblingContext);
    port.issue("ui-token-scope-b", siblingPreview, { careSpaceId: OTHER_SPACE, childId: SIBLING });
    const sibling = await invoke(siblingContext, PAYLOAD, { preview: siblingPreview, token: "ui-token-scope-b" });
    expect(first).toMatchObject({ outcome: "created" });
    expect(sibling).toMatchObject({ outcome: "created" });
    expect(ledger.effectCalls).toBe(2);
    if (!("idempotencyKey" in first)) throw new Error("execution expected");
    expect(first.idempotencyKey).toMatch(/^register_anthropometry:[a-f0-9]{64}$/);
    expect(first.idempotencyKey).not.toMatch(new RegExp(`${ACTOR}|${SPACE}|${CHILD}|${PRODUCT_SESSION}`));
  });

  it("denies revoked replay and pre-handler cancellation without consulting the ledger", async () => {
    const port = new FakeApprovalPort();
    const ledger = new DomainLedger();
    const invoke = mutation(ledger);
    const preview = await previewFrom(invoke, context({ port }));
    port.issue("ui-token-revoked", preview);
    port.current = new Date("2026-08-23T12:03:00.000Z");
    expect(await invoke(context({ port }), PAYLOAD, { preview, token: "ui-token-revoked" }))
      .toMatchObject({ allowed: false, status: "denied" });

    port.current = new Date(NOW);
    const controller = new AbortController();
    const cancelled = context({ port, controller });
    controller.abort();
    expect(await invoke(cancelled, PAYLOAD, null)).toMatchObject({ allowed: false, status: "denied" });
    expect(ledger.effectCalls).toBe(0);
  });

  it("distinguishes cancellation before commit from cancellation after a committed effect", async () => {
    const port = new FakeApprovalPort();
    const preLedger = new DomainLedger();
    const preInvoke = mutation(preLedger, { cancelled: true });
    const prePreview = await previewFrom(preInvoke, context({ port }));
    port.issue("ui-token-cancel-pre", prePreview);
    await expect(preInvoke(context({ port }), PAYLOAD, { preview: prePreview, token: "ui-token-cancel-pre" }))
      .rejects.toEqual(new ToolIdempotencyError("TOOL_IDEMPOTENCY_CANCELLED"));
    expect(preLedger.effectCalls).toBe(0);

    const postController = new AbortController();
    const postLedger = new DomainLedger();
    const postInvoke = mutation(postLedger, { controller: postController });
    const postContext = context({ port, controller: postController, toolCallId: "tool-call-post-commit" });
    const postPreview = await previewFrom(postInvoke, postContext);
    port.issue("ui-token-cancel-post", postPreview);
    const committed = await postInvoke(postContext, PAYLOAD, { preview: postPreview, token: "ui-token-cancel-post" });
    expect(committed).toMatchObject({ status: "succeeded", outcome: "created" });
    expect(postController.signal.aborted).toBe(true);
    expect(postLedger.effectCalls).toBe(1);
  });

  it("fails closed on partial handler failure and result schema drift", async () => {
    const port = new FakeApprovalPort();
    const throwing = mutation(new DomainLedger(), { throws: true });
    const throwingPreview = await previewFrom(throwing, context({ port }));
    port.issue("ui-token-throw", throwingPreview);
    await expect(throwing(context({ port }), PAYLOAD, { preview: throwingPreview, token: "ui-token-throw" }))
      .rejects.toEqual(new ToolIdempotencyError("TOOL_IDEMPOTENCY_UNAVAILABLE"));

    const drift = mutation(new DomainLedger(), { result: { status: "recorded", version: 1, rawPayload: "forbidden" } });
    const driftPreview = await previewFrom(drift, context({ port, toolCallId: "tool-call-drift" }));
    port.issue("ui-token-drift", driftPreview);
    await expect(drift(
      context({ port, toolCallId: "tool-call-drift" }),
      PAYLOAD,
      { preview: driftPreview, token: "ui-token-drift" },
    )).rejects.toEqual(new ToolIdempotencyError("TOOL_IDEMPOTENCY_RESULT_INVALID"));
  });

  it("canonicalizes input deterministically and rejects missing runtime key infrastructure", async () => {
    const captures: IdempotentToolContext[] = [];
    const invoke = withToolIdempotency({
      toolId: "get_growth_summary",
      schemaVersion: "get-growth-summary.v1",
      effect: "read_only",
      operation: "no_effect",
      inputSchema: INPUT_SCHEMA,
      resultSchema: RESULT_SCHEMA,
    }, async (runtime) => {
      captures.push(runtime);
      return Object.freeze({ status: "no_effect" as const, result: { status: "recorded", version: 1 } });
    });
    await invoke(context(), { value: PAYLOAD.value, observedOn: PAYLOAD.observedOn }, null);
    await invoke(context(), PAYLOAD, null);
    expect(captures[0]?.requestSha256).toBe(captures[1]?.requestSha256);

    const valid = context() as unknown as Record<string, unknown>;
    await expect(invoke(Object.freeze({ ...valid }) as never, PAYLOAD, null))
      .rejects.toEqual(new ToolIdempotencyError("TOOL_IDEMPOTENCY_DENIED"));
  });

  it("preserves a branded safe error thrown by the domain handler", async () => {
    const invoke = withToolIdempotency({
      toolId: "get_growth_summary",
      schemaVersion: "get-growth-summary.v1",
      effect: "read_only",
      operation: "no_effect",
      inputSchema: INPUT_SCHEMA,
      resultSchema: RESULT_SCHEMA,
    }, async () => {
      throw mapToolError(Object.freeze({ code: "RULE_UNAVAILABLE" }), { effectState: "none" });
    });

    await expect(invoke(context(), PAYLOAD, null)).rejects.toMatchObject({
      name: "SafeToolError",
      code: "CLINICAL_POLICY_UNAVAILABLE",
      retryable: false,
      retryAfterSeconds: null,
    });
  });
});
