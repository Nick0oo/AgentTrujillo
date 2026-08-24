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
import {
  executePreparePrivateDocumentUpload,
  PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA,
  PREPARE_PRIVATE_DOCUMENT_UPLOAD_TRUSTED_RESULT_SCHEMA,
  projectPreparePrivateDocumentUploadForModel,
  type PreparePrivateDocumentUploadInput,
  type PreparePrivateDocumentUploadPort,
} from "../../../agent/tools/prepare_private_document_upload";
import type { PrivateUploadTicketResult } from "../../../src/application/documents/upload-ticket-service";
import preparePrivateDocumentUploadTool from "../../../agent/tools/prepare_private_document_upload";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const DOCUMENT = "00000000-0000-4000-8000-000000000004";
const TICKET = "00000000-0000-4000-8000-000000000005";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000006";
const DIGEST = "a".repeat(64);
const UPLOAD_URL = "https://storage.example.invalid/upload/private?token=synthetic-upload-token";
const ALL_PERMISSIONS: readonly ChildPermission[] = [
  "read", "record", "manage_documents", "manage_medication", "manage_guardians",
];

const INPUT: PreparePrivateDocumentUploadInput = Object.freeze({
  purpose: "vaccine_record",
  fileName: "carnet.pdf",
  declaredMimeType: "application/pdf",
  sizeBytes: 1_024,
  checksum: Object.freeze({ algorithm: "sha256", value: DIGEST }),
  consent: Object.freeze({ granted: true, purpose: "document_upload" }),
  retentionClass: "child_record",
  idempotencyKey: "guardian-upload-1",
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

  now(): Date {
    return new Date(NOW);
  }

  async emit(event: ToolAuditEvent): Promise<unknown> {
    this.events.push(event);
    return Object.freeze({ outcome: "recorded" as const, eventId: event.eventId, correlationId: event.correlationId });
  }
}

function context(
  ports: ToolServicePorts,
  overrides: Readonly<{
    permissions?: readonly ChildPermission[];
    countryOfCare?: "CO" | "US";
    controller?: AbortController;
    expiresAt?: Date;
    entitlementRevision?: string;
  }> = {},
) {
  const countryOfCare = overrides.countryOfCare ?? "CO";
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR,
    careSpaceId: SPACE,
    childId: CHILD,
    permissions: overrides.permissions ?? ALL_PERMISSIONS,
    countryOfCare,
    timezone: "America/Bogota",
    authorizationVersion: "m:2:a:7",
    issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: overrides.expiresAt ?? new Date("2026-08-23T12:04:00.000Z"),
  });
  const guardian: AuthenticatedGuardian = Object.freeze({
    userId: ACTOR,
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
    authorizationExpiresAt: scope.expiresAt,
    status: "active",
    lastSequence: 1,
  });
  const controller = overrides.controller ?? new AbortController();
  return createTrustedToolContext({
    guarded: Object.freeze({ guardian, scope, session }) as GuardedSession,
    runtimeSessionId: "eve-session-fixture",
    locale: countryOfCare === "CO" ? "es-CO" : "en-US",
    entitlements: {
      careSpaceId: SPACE,
      revision: overrides.entitlementRevision ?? "entitlements:v1",
      capabilities: ["advanced_ai"],
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: new Date("2026-08-23T12:03:00.000Z"),
    },
    trace: { requestId: "request-1", traceId: "trace-1", toolCallId: "tool-call-1" },
    abortSignal: controller.signal,
    services: ports,
    now: NOW,
  });
}

function ticket(overrides: Readonly<Record<string, unknown>> = {}) {
  return Object.freeze({
    kind: "upload" as const,
    id: TICKET,
    documentId: DOCUMENT,
    audience: "guardian" as const,
    uploadUrl: UPLOAD_URL,
    requiredHeaders: Object.freeze({
      "content-type": "application/pdf",
      "x-upsert": "false",
      "x-content-sha256": DIGEST,
    }),
    sizeBytes: INPUT.sizeBytes,
    mimeType: INPUT.declaredMimeType,
    sha256: DIGEST,
    issuedAt: NOW.toISOString(),
    expiresAt: "2026-08-23T12:05:00.000Z",
    nonceSha256: "b".repeat(64),
    ...overrides,
  });
}

function serviceFixture(overrides: Readonly<{
  issue?: (scope: unknown, input: unknown) => unknown;
  controller?: AbortController;
}> = {}) {
  const approval = new FakeApprovalPort();
  const audit = new FakeAuditSink();
  const cancel = vi.fn(async () => Object.freeze({ ok: true as const, status: "cancelled" as const }));
  const service: PreparePrivateDocumentUploadPort = Object.freeze({
    issue: vi.fn(async (scope, input): Promise<PrivateUploadTicketResult> => {
      const result = overrides.issue
        ? overrides.issue(scope, input)
        : Object.freeze({ ok: true as const, status: "issued" as const, ticket: ticket() });
      return result as PrivateUploadTicketResult;
    }),
    cancel,
  });
  const ports = Object.freeze({
    toolApproval: approval,
    toolIdempotency: Object.freeze({ now: () => approval.now() }),
    toolAudit: audit,
    privateDocumentUpload: service,
  });
  const trusted = context(ports, { controller: overrides.controller });
  return Object.freeze({ approval, audit, cancel, service, ports, trusted });
}

async function approved(
  trusted: ReturnType<typeof context>,
  approval: FakeApprovalPort,
  input: PreparePrivateDocumentUploadInput = INPUT,
  token = "guardian-upload-approval",
) {
  const decision = await verifyToolApproval(trusted, "prepare_private_document_upload", {
    schemaVersion: "prepare-private-document-upload.v1",
    inputSchema: PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA,
    rawInput: input,
    approval: null,
  });
  if (decision.status !== "approval_required") throw new Error("expected approval preview");
  approval.issue(token, decision.preview);
  return Object.freeze({ preview: decision.preview, token });
}

describe("prepare_private_document_upload Eve tool", () => {
  it("accepts declared metadata only and rejects authority, path, ticket, and URL fields", () => {
    expect(PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA.safeParse(INPUT).success).toBe(true);
    for (const forged of [
      { childId: CHILD },
      { careSpaceId: SPACE },
      { guardianId: ACTOR },
      { countryOfCare: "US" },
      { bucket: "vaccine-documents" },
      { objectPath: `${SPACE}/${CHILD}/chosen` },
      { uploadUrl: UPLOAD_URL },
      { ticketId: TICKET },
      { signedUrl: UPLOAD_URL },
      { approvalToken: "guardian-token" },
      { idempotencyKey: "../../private" },
    ]) {
      expect(PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA.safeParse({ ...INPUT, ...forged }).success).toBe(false);
    }
    expect(PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA.safeParse({
      ...INPUT,
      checksum: { ...INPUT.checksum, algorithm: "md5" },
    }).success).toBe(false);
  });

  it("requires explicit guardian approval before reservation and does not call the service", async () => {
    const fixture = serviceFixture();
    await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      retryable: false,
    });
    expect(fixture.service.issue).not.toHaveBeenCalled();
    expect(fixture.audit.events[0]).toMatchObject({
      toolId: "prepare_private_document_upload",
      effect: "draft",
      outcome: "approval",
    });
  });

  it("reserves through the scoped service after approval and keeps the upload event out of model output", async () => {
    const fixture = serviceFixture();
    const approval = await approved(fixture.trusted, fixture.approval);
    const result = await executePreparePrivateDocumentUpload(fixture.trusted, INPUT, approval);

    expect(result).toMatchObject({ status: "succeeded", outcome: "created" });
    expect(PREPARE_PRIVATE_DOCUMENT_UPLOAD_TRUSTED_RESULT_SCHEMA.safeParse(result.result).success).toBe(true);
    expect(fixture.service.issue).toHaveBeenCalledWith(
      expect.objectContaining({ careSpaceId: SPACE, childId: CHILD }),
      expect.objectContaining({
        purpose: INPUT.purpose,
        fileName: INPUT.fileName,
        idempotencyKey: expect.stringMatching(/^prepare_private_document_upload:[a-f0-9]{64}$/u),
      }),
    );
    const issuedInput = vi.mocked(fixture.service.issue).mock.calls[0]![1] as Record<string, unknown>;
    expect(issuedInput.idempotencyKey).not.toBe(INPUT.idempotencyKey);
    expect(result.result.data.mobileEvent.data.ticket.uploadUrl).toBe(UPLOAD_URL);
    expect(result.result.data.mobileEvent.data.ticket.requiredHeaders["x-upsert"]).toBe("false");

    const model = projectPreparePrivateDocumentUploadForModel(result.result);
    expect(model).toEqual({
      kind: "tool_result",
      toolId: "prepare_private_document_upload",
      schemaVersion: "prepare_private_document_upload.model.v1",
      data: { status: "upload_prepared", purpose: "vaccine_record", mobileActionRequired: true },
    });
    const serializedModel = JSON.stringify(model);
    expect(serializedModel).not.toContain(UPLOAD_URL);
    expect(serializedModel).not.toMatch(/token|header|ticket|objectPath|bucket|path/i);
    expect(JSON.stringify(fixture.audit.events)).not.toContain(UPLOAD_URL);
    expect(JSON.stringify(fixture.audit.events)).not.toContain("synthetic-upload-token");
  });

  it("rejects metadata spoofing through the domain policy without creating an effect", async () => {
    const cases: readonly [PrivateUploadTicketResult, "INPUT_INVALID" | "CLINICAL_POLICY_UNAVAILABLE"][] = [
      [{ ok: false, status: "unavailable", code: "INVALID_INPUT" }, "INPUT_INVALID"],
      [{ ok: false, status: "unavailable", code: "POLICY_UNAVAILABLE" }, "CLINICAL_POLICY_UNAVAILABLE"],
    ];
    let caseNumber = 0;
    for (const [domainResult, safeCode] of cases) {
      const fixture = serviceFixture({ issue: () => domainResult });
      const approval = await approved(fixture.trusted, fixture.approval, INPUT, `approval-policy-${caseNumber++}`);
      await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT, approval)).rejects.toMatchObject({
        code: safeCode,
      });
      expect(fixture.service.issue).toHaveBeenCalledTimes(1);
    }
  });

  it("maps authorization, replay conflict, and provider failures without exposing internal details", async () => {
    const cases = [
      ["NOT_AUTHORIZED", "RESOURCE_UNAVAILABLE"],
      ["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
      ["PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE"],
    ] as const;
    for (const [domainCode, safeCode] of cases) {
      const fixture = serviceFixture({ issue: () => ({ ok: false, status: "unavailable", code: domainCode }) });
      const token = `approval-${domainCode}`;
      const approval = await approved(fixture.trusted, fixture.approval, INPUT, token);
      await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT, approval)).rejects.toMatchObject({
        code: safeCode,
        retryable: false,
      });
    }
  });

  it("fails closed on forged ticket fields and never emits an unsafe mobile event", async () => {
    const forgedTickets = [
      ticket({ uploadUrl: "http://storage.example.invalid/upload" }),
      ticket({ uploadUrl: "https://user:secret@storage.example.invalid/upload" }),
      ticket({ requiredHeaders: { "x-upsert": "true" } }),
      ticket({ requiredHeaders: { "content-type": "application/pdf", "x-upsert": "false", authorization: "Bearer secret" } }),
      ticket({ sha256: "c".repeat(64) }),
      ticket({ mimeType: "image/png" }),
      ticket({ expiresAt: "2026-08-23T12:05:01.000Z" }),
    ];
    for (const forged of forgedTickets) {
      const fixture = serviceFixture({ issue: () => ({ ok: true, status: "issued", ticket: forged }) });
      const token = `approval-forged-${forged.uploadUrl}`.replace(/[^A-Za-z0-9-]/gu, "").slice(0, 120);
      const approval = await approved(fixture.trusted, fixture.approval, INPUT, token);
      await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT, approval)).rejects.toMatchObject({
        code: "PERSISTENCE_UNAVAILABLE",
      });
    }
  });

  it("rejects an already expired ticket even when its relative TTL is valid", async () => {
    const fixture = serviceFixture({
      issue: () => ({
        ok: true,
        status: "issued",
        ticket: ticket({
          issuedAt: "2026-08-23T11:56:00.000Z",
          expiresAt: "2026-08-23T12:01:00.000Z",
        }),
      }),
    });
    const approval = await approved(fixture.trusted, fixture.approval, INPUT, "approval-stale-ticket");
    fixture.approval.current = new Date("2026-08-23T12:02:00.000Z");

    await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT, approval)).rejects.toMatchObject({
      code: "PERSISTENCE_UNAVAILABLE",
      retryable: false,
    });
  });

  it("does not claim success when cancellation occurs during ticket issuance", async () => {
    const controller = new AbortController();
    const fixture = serviceFixture({
      controller,
      issue: () => {
        controller.abort();
        return { ok: true, status: "issued", ticket: ticket() };
      },
    });
    const approval = await approved(fixture.trusted, fixture.approval, INPUT, "approval-cancelled");
    await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT, approval)).rejects.toMatchObject({
      code: "CANCELLED",
      retryable: false,
    });
    expect(fixture.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ careSpaceId: SPACE, childId: CHILD }),
      DOCUMENT,
    );
  });

  it("does not expose a ticket when authorization expires before approval", async () => {
    const fixture = serviceFixture();
    fixture.approval.current = new Date("2026-08-23T12:05:00.000Z");

    await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
      retryable: false,
    });
    expect(fixture.service.issue).not.toHaveBeenCalled();
  });

  it("does not expose a ticket when authorization is revoked after issuance", async () => {
    let fixture!: ReturnType<typeof serviceFixture>;
    fixture = serviceFixture({
      issue: () => {
        fixture.approval.current = new Date("2026-08-23T12:05:00.000Z");
        return { ok: true, status: "issued", ticket: ticket() };
      },
    });
    const approval = await approved(fixture.trusted, fixture.approval, INPUT, "approval-revoked-after-issue");

    await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT, approval)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
      retryable: false,
    });
  });

  it("fails closed on reservation replay and never reissues a stale upload URL", async () => {
    let calls = 0;
    const fixture = serviceFixture({
      issue: (_scope, rawInput) => {
        calls += 1;
        if (calls === 1) return { ok: true, status: "issued", ticket: ticket() };
        const serviceInput = rawInput as Record<string, unknown>;
        expect(serviceInput.idempotencyKey).toMatch(/^prepare_private_document_upload:[a-f0-9]{64}$/u);
        return { ok: false, status: "unavailable", code: "IDEMPOTENCY_CONFLICT" };
      },
    });
    const firstApproval = await approved(fixture.trusted, fixture.approval, INPUT, "approval-replay-first");
    const first = await executePreparePrivateDocumentUpload(fixture.trusted, INPUT, firstApproval);
    const secondApproval = await approved(fixture.trusted, fixture.approval, INPUT, "approval-replay-second");

    await expect(executePreparePrivateDocumentUpload(fixture.trusted, INPUT, secondApproval)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      retryable: false,
    });
    expect(calls).toBe(2);
    expect(first.result.data.mobileEvent.data.ticket.uploadUrl).toBe(UPLOAD_URL);
    const issuedKeys = vi.mocked(fixture.service.issue).mock.calls.map((call) =>
      (call[1] as Record<string, unknown>).idempotencyKey,
    );
    expect(issuedKeys[0]).toBe(issuedKeys[1]);
  });

  it("rejects missing permission, foreign country, expired scope, and changed approval before effects", async () => {
    const denied = serviceFixture();
    const deniedContext = context(denied.ports, { permissions: ["read"] });
    await expect(executePreparePrivateDocumentUpload(deniedContext, INPUT)).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
    expect(denied.service.issue).not.toHaveBeenCalled();

    const foreign = serviceFixture();
    const foreignContext = context(foreign.ports, { countryOfCare: "US" });
    await expect(executePreparePrivateDocumentUpload(foreignContext, INPUT)).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
    expect(foreign.service.issue).not.toHaveBeenCalled();

    const expired = serviceFixture();
    expired.approval.current = new Date("2026-08-23T12:05:00.000Z");
    await expect(executePreparePrivateDocumentUpload(expired.trusted, INPUT)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    expect(expired.service.issue).not.toHaveBeenCalled();

    const drift = serviceFixture();
    const approval = await approved(drift.trusted, drift.approval, INPUT, "approval-drift");
    await expect(executePreparePrivateDocumentUpload(drift.trusted, {
      ...INPUT,
      fileName: "otro.pdf",
    }, approval)).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
    expect(drift.service.issue).not.toHaveBeenCalled();
  });

  it("exposes the exact Eve descriptor and safe model projection", async () => {
    expect(preparePrivateDocumentUploadTool.inputSchema).toBe(PREPARE_PRIVATE_DOCUMENT_UPLOAD_INPUT_SCHEMA);
    const fixture = serviceFixture();
    const approval = await approved(fixture.trusted, fixture.approval, INPUT, "approval-descriptor");
    const result = await executePreparePrivateDocumentUpload(fixture.trusted, INPUT, approval);
    const model = await preparePrivateDocumentUploadTool.toModelOutput?.(result);
    expect(model).toMatchObject({ type: "json", value: { toolId: "prepare_private_document_upload" } });
  });
});
