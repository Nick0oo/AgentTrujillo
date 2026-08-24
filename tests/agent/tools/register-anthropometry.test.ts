import { describe, expect, it } from "vitest";

import type { AuthenticatedGuardian } from "../../../agent/lib/access/authenticated-guardian";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type ChildPermission,
} from "../../../agent/lib/access/authorized-child-scope";
import type { GuardedSession } from "../../../agent/lib/access/session-route-guard";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import type { SupabaseBearerToken } from "../../../agent/lib/supabase/types";
import {
  verifyToolApproval,
  type ApprovalConsumptionRequest,
  type ApprovalPreview,
  type ToolApprovalPort,
} from "../../../agent/lib/runtime/tool-approval-policy";
import type { RedactedToolAuditSink, ToolAuditEvent } from "../../../agent/lib/runtime/tool-audit";
import { createTrustedToolContext, type ToolServicePorts } from "../../../agent/lib/runtime/trusted-tool-context";
import registerAnthropometryTool, {
  executeRegisterAnthropometry,
  REGISTER_ANTHROPOMETRY_INPUT_SCHEMA,
  type AnthropometryRegistrationRequest,
  type AnthropometryRegistrationResult,
  type RegisterAnthropometryInput,
} from "../../../agent/tools/register_anthropometry";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const ALL_PERMISSIONS: readonly ChildPermission[] = [
  "read", "record", "manage_documents", "manage_medication", "manage_guardians",
];

const VALID_INPUT: RegisterAnthropometryInput = Object.freeze({
  kind: "weight",
  value: "10.25",
  unit: "kg",
  occurredAt: "2026-08-22T15:00:00.000Z",
  sourceNote: "Medición declarada por el cuidador",
  idempotencyKey: "guardian-measurement-1",
});

class FakeApprovalPort implements ToolApprovalPort {
  readonly issued = new Map<string, ApprovalPreview>();
  readonly consumed = new Set<string>();
  current = new Date(NOW);

  now(): Date {
    return new Date(this.current);
  }

  issue(token: string, preview: ApprovalPreview): void {
    this.issued.set(token, preview);
  }

  async consume(request: ApprovalConsumptionRequest): Promise<unknown> {
    const preview = this.issued.get(request.token);
    if (!preview) return { status: "not_found" as const };
    if (this.consumed.has(request.token)) return { status: "replayed" as const };
    if (preview.approvalDigest !== request.approvalDigest || preview.expiresAt !== request.expiresAt) {
      return { status: "mismatch" as const };
    }
    this.consumed.add(request.token);
    return {
      status: "consumed" as const,
      approvalId: `approval-${request.token}`,
      approvalDigest: request.approvalDigest,
      confirmedAt: this.current.toISOString(),
      expiresAt: request.expiresAt,
      channel: "guardian_ui" as const,
    };
  }
}

class FakeAuditSink implements RedactedToolAuditSink {
  readonly events: ToolAuditEvent[] = [];
  ticks = 0;

  now(): Date {
    return new Date(NOW.getTime() + this.ticks++);
  }

  async emit(event: ToolAuditEvent): Promise<unknown> {
    this.events.push(event);
    return { outcome: "recorded" as const, eventId: event.eventId, correlationId: event.correlationId };
  }
}

const CALCULATED_RESULT = {
  outcome: "created",
  measurement: {
    measurementType: "weight",
    value: "10.25",
    unit: "kg",
    occurredAt: VALID_INPUT.occurredAt,
  },
  assessment: {
    status: "calculated",
    indicator: "weight_for_age",
    ageBasis: "chronological",
    ageDays: 400,
    zScore: "-0.125",
    percentile: "54.973",
    interpretation: "within_expected",
    warnings: [],
    standardKey: "growth.who_2006",
    standardVersion: "2026.1",
    sourceDigest: "a".repeat(64),
    referenceCode: "WHO-GROWTH-0-5",
  },
} as const satisfies AnthropometryRegistrationResult;

const CORRECTED_AGE_UNAVAILABLE_RESULT = {
  ...CALCULATED_RESULT,
  assessment: {
    status: "rule_unavailable",
    indicator: "weight_for_age",
    ageBasis: "corrected",
    ageDays: 400,
    zScore: null,
    percentile: null,
    interpretation: "unavailable",
    warnings: ["corrected_age_unavailable"],
    standardKey: "unavailable",
    standardVersion: "unavailable",
    sourceDigest: "b".repeat(64),
    referenceCode: "GROWTH-RULE-UNAVAILABLE",
  },
} as const satisfies AnthropometryRegistrationResult;

type ServiceOptions = Readonly<{
  result?: AnthropometryRegistrationResult | Readonly<{ code: string; requestId?: string }>;
  error?: Error;
  onCall?: (request: AnthropometryRegistrationRequest) => void;
}>;

function services(options: ServiceOptions = {}) {
  const approval = new FakeApprovalPort();
  const audit = new FakeAuditSink();
  const calls: AnthropometryRegistrationRequest[] = [];
  const ports = Object.freeze({
    toolApproval: approval,
    toolIdempotency: Object.freeze({ now: () => approval.now() }),
    toolAudit: audit,
    anthropometry: Object.freeze({
      registerConfirmed: async (request: AnthropometryRegistrationRequest) => {
        calls.push(request);
        options.onCall?.(request);
        if (options.error) throw options.error;
        return options.result ?? CALCULATED_RESULT;
      },
    }),
  });
  return { approval, audit, calls, ports };
}

type ContextOptions = Readonly<{
  permissions?: readonly ChildPermission[];
  countryOfCare?: "CO" | "US";
  capabilities?: readonly string[];
  entitlementRevision?: string;
  controller?: AbortController;
  scopeExpiresAt?: Date;
  sessionExpiresAt?: Date;
  now?: Date;
  toolCallId?: string;
}>;

function context(ports: ToolServicePorts, options: ContextOptions = {}) {
  const countryOfCare = options.countryOfCare ?? "CO";
  const scopeExpiresAt = options.scopeExpiresAt ?? new Date("2026-08-23T12:04:00.000Z");
  const sessionExpiresAt = options.sessionExpiresAt ?? scopeExpiresAt;
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR,
    careSpaceId: SPACE,
    childId: CHILD,
    permissions: options.permissions ?? ALL_PERMISSIONS,
    countryOfCare,
    timezone: "America/Bogota",
    authorizationVersion: "m:2:a:7",
    issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: scopeExpiresAt,
  });
  const guardian: AuthenticatedGuardian = Object.freeze({
    userId: scope.actorUserId,
    issuedAt: new Date("2026-08-23T11:55:00.000Z"),
    expiresAt: new Date("2026-08-23T13:00:00.000Z"),
    bearerToken: "synthetic-bearer" as SupabaseBearerToken,
  });
  const session: OwnedSessionRecord = Object.freeze({
    productSessionId: PRODUCT_SESSION,
    eveSessionId: "eve-session-fixture",
    ownerUserId: scope.actorUserId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    authorizationVersion: scope.authorizationVersion,
    authorizationExpiresAt: sessionExpiresAt,
    status: "active",
    lastSequence: 1,
  });
  return createTrustedToolContext({
    guarded: Object.freeze({ guardian, scope, session }) as GuardedSession,
    runtimeSessionId: "eve-session-fixture",
    locale: countryOfCare === "CO" ? "es-CO" : "en-US",
    entitlements: {
      careSpaceId: SPACE,
      revision: options.entitlementRevision ?? "entitlements:v1",
      capabilities: options.capabilities ?? ["advanced_ai"],
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: new Date("2026-08-23T12:03:00.000Z"),
    },
    trace: { requestId: "request-1", traceId: "trace-1", toolCallId: options.toolCallId ?? "tool-call-1" },
    abortSignal: (options.controller ?? new AbortController()).signal,
    services: ports,
    now: options.now ?? NOW,
  });
}

async function approvalFor(
  trusted: ReturnType<typeof context>,
  input: RegisterAnthropometryInput = VALID_INPUT,
): Promise<ApprovalPreview> {
  const decision = await verifyToolApproval(trusted, "register_anthropometry", {
    schemaVersion: "register-anthropometry.v1",
    inputSchema: REGISTER_ANTHROPOMETRY_INPUT_SCHEMA,
    rawInput: input,
    approval: null,
  });
  expect(decision).toMatchObject({ allowed: false, status: "approval_required" });
  if (decision.allowed || decision.status !== "approval_required") throw new Error("approval preview expected");
  return decision.preview;
}

describe("register_anthropometry Eve tool", () => {
  it("keeps the model schema strictly factual and rejects forged authority or clinical fields", () => {
    expect(REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse(VALID_INPUT).success).toBe(true);
    for (const forged of [
      { childId: CHILD },
      { careSpaceId: SPACE },
      { guardianId: ACTOR },
      { countryOfCare: "US" },
      { sex: "female" },
      { ageDays: 400 },
      { standard: "growth.who_2006" },
      { result: "within_expected" },
      { approval: { token: "model-token" } },
      { entitlement: "advanced_ai" },
      { permissions: ["record"] },
    ]) {
      expect(REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse({ ...VALID_INPUT, ...forged }).success).toBe(false);
    }
    expect(REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse({ ...VALID_INPUT, unknown: true }).success).toBe(false);
    expect(REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse({
      ...VALID_INPUT,
      unit: "cm",
    }).success).toBe(false);
    expect(REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse({
      ...VALID_INPUT,
      unit: "lb_oz",
      value: { pounds: "22", ounces: "4" },
    }).success).toBe(true);
    expect(REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse({
      ...VALID_INPUT,
      unit: "lb_oz",
      value: "22.25",
    }).success).toBe(false);
  });

  it("records a confirmed measurement through the derived idempotency key and projects safe output", async () => {
    expect(REGISTER_ANTHROPOMETRY_INPUT_SCHEMA.safeParse(VALID_INPUT).success).toBe(true);
    const fixture = services();
    const trusted = context(fixture.ports);
    const preview = await approvalFor(trusted);
    fixture.approval.issue("guardian-token-1", preview);

    const result = await executeRegisterAnthropometry(trusted, VALID_INPUT, {
      preview,
      token: "guardian-token-1",
    });

    expect(result.status).toBe("succeeded");
    expect(result.outcome).toBe("created");
    expect(fixture.calls[0]).toMatchObject({
      idempotencyKey: expect.stringMatching(/^register_anthropometry:[a-f0-9]{64}$/u),
      input: {
        kind: VALID_INPUT.kind,
        value: VALID_INPUT.value,
        unit: VALID_INPUT.unit,
        occurredAt: VALID_INPUT.occurredAt,
        sourceNote: VALID_INPUT.sourceNote,
      },
      confirmation: { approvalSha256: preview.approvalDigest },
    });
    expect(fixture.calls[0]?.input).not.toHaveProperty("idempotencyKey");
    expect(fixture.calls[0]?.idempotencyKey).not.toBe(VALID_INPUT.idempotencyKey);
    const model = await registerAnthropometryTool.toModelOutput?.(result);
    expect(JSON.stringify(model)).not.toContain(ACTOR);
    expect(JSON.stringify(model)).not.toContain(SPACE);
    expect(JSON.stringify(model)).not.toContain(CHILD);
    expect(model).toMatchObject({
      type: "json",
      value: {
        kind: "tool_result",
        toolId: "register_anthropometry",
        schemaVersion: "register_anthropometry.model.v1",
      },
    });
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain("sourceNote");
    expect(serialized).not.toContain("guardian-measurement-1");
    expect(serialized).not.toContain("growth.who_2006");
    expect(serialized).not.toContain("2026.1");
    expect(serialized).not.toContain("a".repeat(64));
    expect(JSON.stringify(await registerAnthropometryTool.toModelOutput?.(result))).toBe(serialized);
  });

  it("requires exact UI approval and rejects preview drift before any domain effect", async () => {
    const fixture = services();
    const trusted = context(fixture.ports);
    await expect(executeRegisterAnthropometry(trusted, VALID_INPUT)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    });
    expect(fixture.calls).toHaveLength(0);

    const preview = await approvalFor(trusted);
    fixture.approval.issue("guardian-token-drift", preview);
    await expect(executeRegisterAnthropometry(trusted, {
      ...VALID_INPUT,
      value: "10.50",
    }, { preview, token: "guardian-token-drift" })).rejects.toMatchObject({
      code: "CONFIRMATION_INVALID",
    });
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.approval.consumed.size).toBe(0);
  });

  it("rejects invalid units, dates, and approved capture ranges before the effect port", async () => {
    const invalidInputs: unknown[] = [
      { ...VALID_INPUT, unit: "cm" },
      { ...VALID_INPUT, occurredAt: "not-an-instant" },
      { ...VALID_INPUT, occurredAt: "2026-08-24T00:00:00.000Z" },
      { ...VALID_INPUT, value: "300" },
      { ...VALID_INPUT, value: "0.1" },
      { ...VALID_INPUT, kind: "standing_height", unit: "kg" },
    ];
    const fixture = services();
    const trusted = context(fixture.ports);
    for (const input of invalidInputs) {
      await expect(executeRegisterAnthropometry(trusted, input)).rejects.toMatchObject({ code: "INPUT_INVALID" });
    }
    expect(fixture.calls).toHaveLength(0);
  });

  it("fails closed on urgent source notes before context/approval/effect work", async () => {
    const fixture = services();
    const urgent = {
      ...VALID_INPUT,
      sourceNote: "El niño no respira",
    };
    await expect(executeRegisterAnthropometry(context(fixture.ports), urgent)).rejects.toMatchObject({
      code: "INPUT_INVALID",
    });
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.approval.consumed.size).toBe(0);
    expect(fixture.audit.events).toHaveLength(0);
  });

  it("preserves the measurement fact when corrected-age assessment is unavailable", async () => {
    const fixture = services({ result: CORRECTED_AGE_UNAVAILABLE_RESULT });
    const trusted = context(fixture.ports);
    const preview = await approvalFor(trusted);
    fixture.approval.issue("guardian-token-corrected-age", preview);
    const result = await executeRegisterAnthropometry(trusted, VALID_INPUT, {
      preview,
      token: "guardian-token-corrected-age",
    });
    expect(result).toMatchObject({ status: "succeeded", outcome: "created" });
    expect(result.result.data).toMatchObject({
      outcome: "created",
      measurement: { measurementType: "weight", value: "10.25", unit: "kg" },
      assessment: {
        status: "rule_unavailable",
        ageBasis: "corrected",
        zScore: null,
        percentile: null,
      },
    });
    const model = await registerAnthropometryTool.toModelOutput?.(result);
    expect(model).toMatchObject({
      value: { data: { outcome: "created", assessment: { status: "rule_unavailable", zScore: null, percentile: null } } },
    });
  });

  it("converges duplicate replay and maps conflicting replay without a second lookup/effect", async () => {
    const replayFixture = services({
      result: { ...CALCULATED_RESULT, outcome: "idempotent_replay" },
    });
    const replayContext = context(replayFixture.ports);
    const replayPreview = await approvalFor(replayContext);
    replayFixture.approval.issue("guardian-token-replay", replayPreview);
    const replay = await executeRegisterAnthropometry(replayContext, VALID_INPUT, {
      preview: replayPreview,
      token: "guardian-token-replay",
    });
    expect(replay.outcome).toBe("replayed");
    expect(replayFixture.calls).toHaveLength(1);

    const conflictFixture = services({ result: { code: "IDEMPOTENCY_CONFLICT" } });
    const conflictContext = context(conflictFixture.ports);
    const conflictPreview = await approvalFor(conflictContext);
    conflictFixture.approval.issue("guardian-token-conflict", conflictPreview);
    await expect(executeRegisterAnthropometry(conflictContext, VALID_INPUT, {
      preview: conflictPreview,
      token: "guardian-token-conflict",
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(conflictFixture.calls).toHaveLength(1);
  });

  it("denies missing permission, entitlement, foreign country, and expired scope without effect", async () => {
    const cases: Array<{ options: ContextOptions; expected: string }> = [
      { options: { permissions: ["read"] }, expected: "RESOURCE_UNAVAILABLE" },
      { options: { capabilities: [] }, expected: "RESOURCE_UNAVAILABLE" },
      { options: { countryOfCare: "US" }, expected: "RESOURCE_UNAVAILABLE" },
    ];
    for (const testCase of cases) {
      const fixture = services();
      await expect(executeRegisterAnthropometry(context(fixture.ports, testCase.options), VALID_INPUT))
        .rejects.toMatchObject({ code: testCase.expected });
      expect(fixture.calls).toHaveLength(0);
    }

    const expiredFixture = services();
    const expiredContext = context(expiredFixture.ports);
    expiredFixture.approval.current = new Date("2026-08-23T12:04:01.000Z");
    await expect(executeRegisterAnthropometry(expiredContext, VALID_INPUT)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    expect(expiredFixture.calls).toHaveLength(0);
  });

  it("rechecks cancellation at the boundary and never reports a committed effect after abort", async () => {
    const beforeFixture = services();
    const beforeController = new AbortController();
    const beforeContext = context(beforeFixture.ports, { controller: beforeController });
    beforeController.abort();
    await expect(executeRegisterAnthropometry(beforeContext, VALID_INPUT)).rejects.toMatchObject({ code: "CANCELLED" });
    expect(beforeFixture.calls).toHaveLength(0);

    const duringController = new AbortController();
    let committed = false;
    const duringFixture = services({
      onCall: () => duringController.abort(),
    });
    const duringContext = context(duringFixture.ports, { controller: duringController });
    const duringPreview = await approvalFor(duringContext);
    duringFixture.approval.issue("guardian-token-cancelled", duringPreview);
    await expect(executeRegisterAnthropometry(duringContext, VALID_INPUT, {
      preview: duringPreview,
      token: "guardian-token-cancelled",
    })).rejects.toMatchObject({ code: "CANCELLED" });
    if (!duringController.signal.aborted) committed = true;
    expect(committed).toBe(false);
  });

  it("keeps authorization/scope server-derived even when the model attempts sibling or foreign injection", async () => {
    const fixture = services();
    const trusted = context(fixture.ports);
    const forged = {
      ...VALID_INPUT,
      childId: "00000000-0000-4000-8000-000000000099",
      careSpaceId: "00000000-0000-4000-8000-000000000099",
      countryOfCare: "US",
    };
    await expect(executeRegisterAnthropometry(trusted, forged)).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(fixture.calls).toHaveLength(0);
  });
});
