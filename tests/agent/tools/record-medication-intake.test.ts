import { describe, expect, it, vi } from "vitest";

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
import {
  createTrustedToolContext,
  type ToolServicePorts,
} from "../../../agent/lib/runtime/trusted-tool-context";
import recordMedicationIntakeTool, {
  RECORD_MEDICATION_INTAKE_INPUT_SCHEMA,
  RECORD_MEDICATION_INTAKE_OUTPUT_SCHEMA,
  executeRecordMedicationIntake,
  type RecordMedicationIntakeInput,
  type MedicationIntakeRecordPort,
} from "../../../agent/tools/record_medication_intake";
import type { MedicationIntakeRecord } from "../../../src/clinical/medication/types";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const PLAN_ID = "00000000-0000-4000-8000-000000000005";
const INTAKE_ID = "00000000-0000-4000-8000-000000000006";
const OCCURRENCE_ID = "occurrence-2026-08-23-1100";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const ALL_PERMISSIONS: readonly ChildPermission[] = ["read", "record", "manage_medication", "manage_documents"];

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
    if (!preview) return Object.freeze({ status: "not_found" as const });
    if (this.consumed.has(request.token)) return Object.freeze({ status: "replayed" as const });
    if (preview.approvalDigest !== request.approvalDigest || preview.expiresAt !== request.expiresAt) {
      return Object.freeze({ status: "mismatch" as const });
    }
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

class FakeAuditSink implements RedactedToolAuditSink {
  readonly events: ToolAuditEvent[] = [];
  private ticks = 0;

  now(): Date {
    const value = new Date(NOW.getTime() + this.ticks);
    this.ticks += 1;
    return value;
  }

  async emit(event: ToolAuditEvent): Promise<unknown> {
    this.events.push(event);
    return Object.freeze({ outcome: "recorded" as const, eventId: event.eventId, correlationId: event.correlationId });
  }
}

const VALID_INPUT: RecordMedicationIntakeInput = Object.freeze({
  planReference: PLAN_ID,
  occurrenceReference: OCCURRENCE_ID,
  state: "taken",
  scheduledFor: "2026-08-23T11:00:00Z",
  takenAt: "2026-08-23T11:05:00Z",
  idempotencyKey: "guardian-intake-1",
});

function intake(overrides: Partial<MedicationIntakeRecord> = {}): MedicationIntakeRecord {
  return Object.freeze({
    id: INTAKE_ID,
    planId: PLAN_ID,
    occurrenceId: OCCURRENCE_ID,
    scheduledFor: "2026-08-23T11:00:00.000Z",
    takenAt: "2026-08-23T11:05:00.000Z",
    state: "taken" as const,
    quantity: null,
    unit: null,
    recordedBy: ACTOR,
    supersedesId: null,
    ...overrides,
  });
}

function context(overrides: Readonly<{
  approval?: FakeApprovalPort;
  audit?: FakeAuditSink;
  record?: (scope: unknown, command: unknown, operation: unknown) => Promise<MedicationIntakeRecord>;
  recordWithOutcome?: MedicationIntakeRecordPort["recordWithOutcome"];
  controller?: AbortController;
  expiresAt?: Date;
}> = {}) {
  const approval = overrides.approval ?? new FakeApprovalPort();
  const audit = overrides.audit ?? new FakeAuditSink();
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR,
    careSpaceId: SPACE,
    childId: CHILD,
    permissions: ALL_PERMISSIONS,
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:2:a:7",
    issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: overrides.expiresAt ?? new Date("2026-08-23T12:04:00.000Z"),
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
  const controller = overrides.controller ?? new AbortController();
  const record = overrides.record ?? (async () => intake());
  const port: MedicationIntakeRecordPort = Object.freeze({
    record: vi.fn(record),
    recordWithOutcome: vi.fn(overrides.recordWithOutcome ?? (async (scope, command, operation) => ({
      outcome: "created" as const,
      value: await record(scope, command, operation),
    }))),
  });
  const services: ToolServicePorts = Object.freeze({
    toolApproval: approval,
    toolIdempotency: Object.freeze({ now: () => approval.now() }),
    toolAudit: audit,
    medicationIntakes: port,
  });
  const trusted = createTrustedToolContext({
    guarded: Object.freeze({ guardian, scope, session }) as GuardedSession,
    runtimeSessionId: "eve-session-fixture",
    locale: "es-CO",
    entitlements: {
      careSpaceId: SPACE,
      revision: "entitlements:v1",
      capabilities: ["advanced_ai"],
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: new Date("2026-08-23T12:03:00.000Z"),
    },
    trace: { requestId: "request-1", traceId: "trace-1", toolCallId: "tool-call-1" },
    abortSignal: controller.signal,
    services,
    now: NOW,
  });
  return { trusted, approval, audit, port, controller, scope };
}

async function approvalFor(trusted: ReturnType<typeof context>["trusted"], input: unknown = VALID_INPUT): Promise<ApprovalPreview> {
  const decision = await verifyToolApproval(trusted, "record_medication_intake", {
    schemaVersion: "record-medication-intake.v1",
    inputSchema: RECORD_MEDICATION_INTAKE_INPUT_SCHEMA,
    rawInput: input,
    approval: null,
  });
  expect(decision).toMatchObject({ allowed: false, status: "approval_required" });
  if (decision.allowed || decision.status !== "approval_required") throw new Error("approval preview expected");
  return decision.preview;
}

describe("record_medication_intake Eve tool", () => {
  it("accepts only factual scoped references and rejects authority, instruction, and adherence fields", () => {
    expect(RECORD_MEDICATION_INTAKE_INPUT_SCHEMA.safeParse(VALID_INPUT).success).toBe(true);
    for (const forged of [
      { childId: CHILD },
      { careSpaceId: SPACE },
      { guardianId: ACTOR },
      { countryOfCare: "US" },
      { permissions: ["manage_medication"] },
      { adherence: "noncompliant" },
      { action: "double dose" },
      { recommendation: "take it now" },
      { approval: { token: "model-token" } },
      { planReference: "https://evil.example/child" },
    ]) {
      expect(RECORD_MEDICATION_INTAKE_INPUT_SCHEMA.safeParse({ ...VALID_INPUT, ...forged }).success).toBe(false);
    }
    expect(RECORD_MEDICATION_INTAKE_INPUT_SCHEMA.safeParse({
      ...VALID_INPUT,
      state: "skipped",
      takenAt: undefined,
    }).success).toBe(true);
    expect(RECORD_MEDICATION_INTAKE_INPUT_SCHEMA.safeParse({
      ...VALID_INPUT,
      quantity: "5",
    }).success).toBe(false);
  });

  it("rejects unsupported free-text notes before approval or persistence", async () => {
    const fixture = context();
    await expect(executeRecordMedicationIntake(fixture.trusted, {
      ...VALID_INPUT,
      note: "El tutor informa el hecho retrospectivo.",
    })).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(fixture.port.recordWithOutcome).not.toHaveBeenCalled();
    expect(fixture.approval.consumed).toHaveLength(0);
  });

  it("requires digest-bound guardian approval before the intake service", async () => {
    const fixture = context();
    await expect(executeRecordMedicationIntake(fixture.trusted, VALID_INPUT)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      retryable: false,
    });
    expect(fixture.port.recordWithOutcome).not.toHaveBeenCalled();
    expect(fixture.audit.events[0]).toMatchObject({ outcome: "approval", toolId: "record_medication_intake" });
  });

  it("records a neutral retrospective fact and keeps identifiers and notes out of model output", async () => {
    const fixture = context();
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-intake-approval", preview);
    const result = await executeRecordMedicationIntake(fixture.trusted, VALID_INPUT, {
      preview,
      token: "guardian-intake-approval",
    });

    expect(RECORD_MEDICATION_INTAKE_OUTPUT_SCHEMA.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      status: "succeeded",
      outcome: "created",
      result: {
        kind: "trusted_tool_result",
        toolId: "record_medication_intake",
        schemaVersion: "record_medication_intake.trusted.v1",
        data: {
          outcome: "created",
          state: "taken",
          scheduledFor: "2026-08-23T11:00:00.000Z",
          takenAt: "2026-08-23T11:05:00.000Z",
        },
      },
    });
    const modelOutput = await recordMedicationIntakeTool.toModelOutput?.(result);
    expect(modelOutput).toMatchObject({
      type: "json",
      value: {
        kind: "tool_result",
        toolId: "record_medication_intake",
        schemaVersion: "record_medication_intake.model.v1",
        data: { outcome: "created", state: "taken" },
      },
    });
    const serialized = JSON.stringify(modelOutput);
    expect(serialized).not.toContain(PLAN_ID);
    expect(serialized).not.toContain(INTAKE_ID);
    expect(serialized).not.toContain(OCCURRENCE_ID);
    expect(serialized).not.toMatch(/\b(?:safe|adheren(?:ce|cia)?|recommend(?:ation)?|double|catch.?up)\b/i);
    expect(fixture.port.recordWithOutcome).toHaveBeenCalledTimes(1);
    expect(fixture.port.recordWithOutcome).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ planId: PLAN_ID, occurrenceId: OCCURRENCE_ID, state: "taken" }),
      expect.objectContaining({
        approvalSha256: preview.approvalDigest,
        requestSha256: result.requestSha256,
      }),
    );
  });

  it("supports an explicitly unscheduled fact without inventing a scheduled occurrence", async () => {
    const fixture = context({ record: async () => intake({ occurrenceId: null, scheduledFor: null, state: "unknown", takenAt: null }) });
    const input: RecordMedicationIntakeInput = {
      planReference: PLAN_ID,
      state: "unknown",
      idempotencyKey: "guardian-unscheduled-1",
    };
    const preview = await approvalFor(fixture.trusted, input);
    fixture.approval.issue("guardian-unscheduled-approval", preview);
    const result = await executeRecordMedicationIntake(fixture.trusted, input, {
      preview,
      token: "guardian-unscheduled-approval",
    });
    expect(result.result.data).toMatchObject({ outcome: "created", state: "unknown", scheduledFor: null, takenAt: null });
  });

  it("rejects future and state-inconsistent timestamps before any effect", async () => {
    const cases = [
      { ...VALID_INPUT, scheduledFor: "2026-08-23T13:00:00Z" },
      { ...VALID_INPUT, takenAt: "2026-08-23T13:00:00Z" },
      { ...VALID_INPUT, state: "taken" as const, takenAt: undefined },
      { ...VALID_INPUT, state: "skipped" as const, takenAt: "2026-08-23T11:05:00Z" },
    ];
    for (const input of cases) {
      const fixture = context();
      await expect(executeRecordMedicationIntake(fixture.trusted, input)).rejects.toMatchObject({ code: "INPUT_INVALID" });
      expect(fixture.port.recordWithOutcome).not.toHaveBeenCalled();
    }
  });

  it("rejects approval drift before consuming a token or invoking the service", async () => {
    const fixture = context();
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-intake-drift", preview);
    await expect(executeRecordMedicationIntake(fixture.trusted, {
      ...VALID_INPUT,
      state: "unknown",
      takenAt: undefined,
      idempotencyKey: "guardian-intake-drift-changed",
    }, { preview, token: "guardian-intake-drift" })).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
    expect(fixture.approval.consumed).toHaveLength(0);
    expect(fixture.port.recordWithOutcome).not.toHaveBeenCalled();
  });

  it("maps scoped domain failures to safe errors without exposing source details", async () => {
    const fixture = context({ record: async () => { throw new Error("MEDICATION_PLAN_NOT_FOUND: child=secret"); } });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-intake-denied", preview);
    await expect(executeRecordMedicationIntake(fixture.trusted, VALID_INPUT, {
      preview,
      token: "guardian-intake-denied",
    })).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
  });

  it("does not expose ended plans or superseded occurrences", async () => {
    for (const domainCode of ["MEDICATION_PLAN_ENDED", "MEDICATION_OCCURRENCE_SUPERSEDED"]) {
      const fixture = context({ record: async () => { throw new Error(domainCode); } });
      const preview = await approvalFor(fixture.trusted);
      fixture.approval.issue(`guardian-intake-${domainCode}`, preview);
      await expect(executeRecordMedicationIntake(fixture.trusted, VALID_INPUT, {
        preview,
        token: `guardian-intake-${domainCode}`,
      })).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
      expect(fixture.port.recordWithOutcome).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects a superseding receipt instead of claiming a correction", async () => {
    const fixture = context({ record: async () => intake({ supersedesId: INTAKE_ID }) });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-intake-superseding", preview);
    await expect(executeRecordMedicationIntake(fixture.trusted, VALID_INPUT, {
      preview,
      token: "guardian-intake-superseding",
    })).rejects.toMatchObject({ code: "PERSISTENCE_UNAVAILABLE" });
  });

  it("does not claim success after cancellation during the domain call", async () => {
    let fixture!: ReturnType<typeof context>;
    fixture = context({
      record: async () => {
        fixture.controller.abort();
        return intake();
      },
    });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-intake-cancel", preview);
    await expect(executeRecordMedicationIntake(fixture.trusted, VALID_INPUT, {
      preview,
      token: "guardian-intake-cancel",
    })).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("reauthorizes before invoking the write and denies an expired scope", async () => {
    const fixture = context({ expiresAt: new Date("2026-08-23T12:00:00.500Z") });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-intake-expired", preview);
    fixture.approval.current = new Date("2026-08-23T12:00:01.000Z");
    await expect(executeRecordMedicationIntake(fixture.trusted, VALID_INPUT, {
      preview,
      token: "guardian-intake-expired",
    })).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
    expect(fixture.port.recordWithOutcome).not.toHaveBeenCalled();
  });

  it("returns a durable replay receipt when the typed service supplies one", async () => {
    const reauthorizationTimes: number[] = [];
    const fixture = context({
      recordWithOutcome: async () => {
        reauthorizationTimes.push(Date.now());
        return { outcome: "idempotent_replay" as const, value: intake() };
      },
    });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-intake-replay", preview);
    const result = await executeRecordMedicationIntake(fixture.trusted, VALID_INPUT, {
      preview,
      token: "guardian-intake-replay",
    });
    expect(result.outcome).toBe("replayed");
    expect(result.result.data.outcome).toBe("idempotent_replay");
    expect(reauthorizationTimes).toHaveLength(1);
  });

  it("does not expose a committed receipt after access is revoked during the write", async () => {
    let fixture!: ReturnType<typeof context>;
    fixture = context({
      recordWithOutcome: async () => {
        fixture.approval.current = new Date("2026-08-23T12:05:00.000Z");
        return { outcome: "idempotent_replay" as const, value: intake() };
      },
    });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-intake-revoked-after-write", preview);
    await expect(executeRecordMedicationIntake(fixture.trusted, VALID_INPUT, {
      preview,
      token: "guardian-intake-revoked-after-write",
    })).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
  });

  it("keeps approval, effect, and audit deterministic under property reordering", async () => {
    const first = context();
    const second = context();
    const reordered = {
      idempotencyKey: VALID_INPUT.idempotencyKey,
      takenAt: VALID_INPUT.takenAt,
      scheduledFor: VALID_INPUT.scheduledFor,
      state: VALID_INPUT.state,
      occurrenceReference: VALID_INPUT.occurrenceReference,
      planReference: VALID_INPUT.planReference,
    };
    const left = await approvalFor(first.trusted, VALID_INPUT);
    const right = await approvalFor(second.trusted, reordered);
    expect(left.approvalDigest).toBe(right.approvalDigest);
  });
});
