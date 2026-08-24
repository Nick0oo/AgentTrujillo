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
  executeGenerateVaccinationCard,
  GENERATE_VACCINATION_CARD_INPUT_SCHEMA,
  GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA,
  projectGenerateVaccinationCardForModel,
  type VaccinationCardPort,
  type VaccinationCardRequestResult,
  type VaccinationCardReservationRequest,
  type VaccinationCardResolveRequest,
  type VaccinationCardSnapshot,
} from "../../../agent/tools/generate_vaccination_card";
import generateVaccinationCardTool from "../../../agent/tools/generate_vaccination_card";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const ALL_PERMISSIONS: readonly ChildPermission[] = [
  "read", "record", "manage_documents", "manage_medication", "manage_guardians",
];
const SOURCE_DIGEST = "a".repeat(64);
const TEMPLATE_DIGEST = "b".repeat(64);

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
    locale?: "es-CO" | "en-US";
    controller?: AbortController;
    expiresAt?: Date;
    sessionExpiresAt?: Date;
    entitlementRevision?: string;
  }> = {},
) {
  const countryOfCare = overrides.countryOfCare ?? "CO";
  const locale = overrides.locale ?? (countryOfCare === "CO" ? "es-CO" : "en-US");
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
    authorizationExpiresAt: overrides.sessionExpiresAt ?? scope.expiresAt,
    status: "active",
    lastSequence: 1,
  });
  return createTrustedToolContext({
    guarded: Object.freeze({ guardian, scope, session }) as GuardedSession,
    runtimeSessionId: "eve-session-fixture",
    locale,
    entitlements: {
      careSpaceId: SPACE,
      revision: overrides.entitlementRevision ?? "entitlements:v1",
      capabilities: ["reports"],
      evaluatedAt: new Date("2026-08-23T11:59:30.000Z"),
      expiresAt: new Date("2026-08-23T12:03:00.000Z"),
    },
    trace: { requestId: "request-1", traceId: "trace-1", toolCallId: "tool-call-1" },
    abortSignal: (overrides.controller ?? new AbortController()).signal,
    services: ports,
    now: NOW,
  });
}

const INPUT = Object.freeze({
  locale: "es-CO" as const,
  displayOptions: Object.freeze({ paperSize: "a4" as const, includeProvenance: true }),
  idempotencyKey: "guardian-card-1",
});

async function approved(
  trusted: ReturnType<typeof context>,
  approval: FakeApprovalPort,
  input = INPUT,
  token = "guardian-card-approval",
) {
  const decision = await verifyToolApproval(
    trusted,
    "generate_vaccination_card",
    {
      schemaVersion: "generate-vaccination-card.v1",
      inputSchema: GENERATE_VACCINATION_CARD_INPUT_SCHEMA,
      rawInput: input,
      approval: null,
    },
  );
  if (decision.status !== "approval_required") throw new Error("expected approval preview");
  approval.issue(token, decision.preview);
  return Object.freeze({ preview: decision.preview, token });
}

function serviceFixture(overrides: Readonly<{
  snapshot?: unknown;
  receipt?: unknown;
  resolve?: (request: VaccinationCardResolveRequest) => unknown;
  reserve?: (request: VaccinationCardReservationRequest) => unknown;
}> = {}) {
  const approval = new FakeApprovalPort();
  const audit = new FakeAuditSink();
  const resolved = overrides.snapshot ?? snapshot();
  const receipt = overrides.receipt ?? Object.freeze({
    outcome: "created" as const,
    status: "queued" as const,
    documentStatus: "reserved" as const,
    snapshot: resolved,
  });
  const service: VaccinationCardPort = Object.freeze({
    resolve: vi.fn(async (request): Promise<VaccinationCardSnapshot> => (
      (overrides.resolve ? overrides.resolve(request) : resolved) as VaccinationCardSnapshot
    )),
    reserveAndEnqueue: vi.fn(async (request): Promise<VaccinationCardRequestResult> => (
      (overrides.reserve ? overrides.reserve(request) : receipt) as VaccinationCardRequestResult
    )),
  });
  const ports = Object.freeze({
    toolApproval: approval,
    toolIdempotency: Object.freeze({ now: () => approval.now() }),
    toolAudit: audit,
    vaccinationCard: service,
  });
  const trusted = context(ports);
  return Object.freeze({ approval, audit, service, ports, trusted, resolved, receipt });
}

function snapshot(overrides: Readonly<{
  evidenceState?: unknown;
  asOfDate?: string;
  country?: "CO" | "US";
  confirmedFactCount?: number;
  package?: Readonly<Record<string, unknown>>;
  template?: Readonly<Record<string, unknown>>;
}> = {}) {
  return Object.freeze({
    evidenceState: overrides.evidenceState ?? "confirmed_only" as const,
    asOfDate: overrides.asOfDate ?? "2026-08-23",
    country: overrides.country ?? "CO" as const,
    confirmedFactCount: overrides.confirmedFactCount ?? 1,
    package: Object.freeze(overrides.package ?? {
      country: "CO" as const,
      releaseStatus: "active" as const,
      version: "2026.basic.1",
      algorithmId: "immunization-status-v1",
      artifactSha256: SOURCE_DIGEST,
      sourceReferences: Object.freeze([Object.freeze({
        label: "Esquema PAI Colombia",
        referenceCode: "co-pai-schedule-current-2026",
        sourceDigest: SOURCE_DIGEST,
      })]),
    }),
    template: Object.freeze(overrides.template ?? {
      country: "CO" as const,
      locale: "es-CO" as const,
      releaseStatus: "released" as const,
      version: "vaccination-card-co.v1",
      artifactSha256: TEMPLATE_DIGEST,
    }),
  });
}

describe("generate_vaccination_card Eve tool", () => {
  it("queues a confirmed-only private card after approval and never leaks identifiers", async () => {
    expect(GENERATE_VACCINATION_CARD_INPUT_SCHEMA.safeParse({
      locale: "es-CO",
      displayOptions: { paperSize: "a4", includeProvenance: true },
      idempotencyKey: "guardian-card-1",
    }).success).toBe(true);
    expect(GENERATE_VACCINATION_CARD_INPUT_SCHEMA.safeParse({ childId: CHILD }).success).toBe(false);

    const fixture = serviceFixture();
    const trusted = fixture.trusted;
    const approval = await approved(trusted, fixture.approval);
    const result = await executeGenerateVaccinationCard(trusted, INPUT, {
      preview: approval.preview,
      token: "guardian-card-approval",
    });

    expect(result).toMatchObject({ status: "succeeded", outcome: "created" });
    expect(fixture.service.resolve).toHaveBeenCalledTimes(1);
    expect(fixture.service.reserveAndEnqueue).toHaveBeenCalledTimes(1);
    expect(fixture.service.reserveAndEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^generate_vaccination_card:[a-f0-9]{64}$/u),
      displayOptions: { paperSize: "a4", orientation: "portrait", includeProvenance: true },
    }));
    const reservation = vi.mocked(fixture.service.reserveAndEnqueue).mock.calls[0]![0];
    expect(reservation.idempotencyKey).not.toBe(INPUT.idempotencyKey);
    expect(reservation).not.toHaveProperty("input");
    expect(GENERATE_VACCINATION_CARD_TRUSTED_RESULT_SCHEMA.safeParse(result.result).success).toBe(true);
    expect(result.result.data).toMatchObject({
      status: "queued",
      jobStatus: "queued",
      documentStatus: "reserved",
      artifactKind: "private_factual_copy",
      officialRecord: false,
      evidenceState: "confirmed_only",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SOURCE_DIGEST);
    expect(serialized).not.toContain(TEMPLATE_DIGEST);
    expect(serialized).not.toContain(CHILD);
    expect(serialized).not.toContain("/generated/");
    expect(serialized.toLowerCase()).not.toContain("certificate");
    expect(serialized.toLowerCase()).not.toContain("immunity");

    const model = await generateVaccinationCardTool.toModelOutput?.(result);
    expect(model).toMatchObject({
      type: "json",
      value: {
        kind: "tool_result",
        toolId: "generate_vaccination_card",
        schemaVersion: "generate_vaccination_card.model.v1",
        data: { status: "queued", asOfDate: "2026-08-23" },
      },
    });
    const serializedModel = JSON.stringify(model);
    expect(serializedModel).not.toContain(SOURCE_DIGEST);
    expect(serializedModel).not.toContain(TEMPLATE_DIGEST);
    expect(serializedModel).not.toContain("2026.basic.1");
    expect(serializedModel).not.toContain("vaccination-card-co.v1");
    expect(serializedModel).not.toContain(CHILD);
  });

  it("accepts only display intent and idempotency, rejecting forged authority or artifact fields", () => {
    expect(GENERATE_VACCINATION_CARD_INPUT_SCHEMA.safeParse(INPUT).success).toBe(true);
    for (const forged of [
      { childId: CHILD },
      { careSpaceId: SPACE },
      { guardianId: ACTOR },
      { countryOfCare: "US" },
      { country: "US" },
      { packageId: "package-1" },
      { packageVersion: "package.v1" },
      { factId: "fact-1" },
      { vaccineAdministrationId: "administration-1" },
      { storagePath: "/private/child/card.pdf" },
      { downloadTicket: "ticket-1" },
      { signedUrl: "https://example.invalid/card.pdf" },
      { approval: { token: "guardian-token" } },
      { approvalToken: "guardian-token" },
      { entitlement: "reports" },
      { officialRecord: true },
      { certificate: true },
    ]) {
      expect(GENERATE_VACCINATION_CARD_INPUT_SCHEMA.safeParse({ ...INPUT, ...forged }).success).toBe(false);
    }
    expect(GENERATE_VACCINATION_CARD_INPUT_SCHEMA.safeParse({
      ...INPUT,
      displayOptions: { ...INPUT.displayOptions, storagePath: "/private/child/card.pdf" },
    }).success).toBe(false);
    expect(GENERATE_VACCINATION_CARD_INPUT_SCHEMA.safeParse({ ...INPUT, locale: "fr-FR" }).success).toBe(false);
    expect(GENERATE_VACCINATION_CARD_INPUT_SCHEMA.safeParse({ ...INPUT, idempotencyKey: "" }).success).toBe(false);
  });

  it("requires digest-bound approval and rejects preview drift before resolving facts", async () => {
    const fixture = serviceFixture();
    await expect(executeGenerateVaccinationCard(fixture.trusted, INPUT)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      retryable: false,
    });
    expect(fixture.service.resolve).not.toHaveBeenCalled();
    expect(fixture.service.reserveAndEnqueue).not.toHaveBeenCalled();

    const preview = await approved(fixture.trusted, fixture.approval, INPUT, "guardian-card-drift");
    await expect(executeGenerateVaccinationCard(fixture.trusted, {
      ...INPUT,
      displayOptions: { ...INPUT.displayOptions, orientation: "landscape" },
    }, { preview: preview.preview, token: "guardian-card-drift" })).rejects.toMatchObject({
      code: "CONFIRMATION_INVALID",
    });
    expect(fixture.service.resolve).not.toHaveBeenCalled();
    expect(fixture.service.reserveAndEnqueue).not.toHaveBeenCalled();
  });

  it("denies missing permission, unsupported country, and revoked scope without a service effect", async () => {
    const deniedFixture = serviceFixture();
    const deniedContext = context(deniedFixture.ports, { permissions: ["read"] });
    await expect(executeGenerateVaccinationCard(deniedContext, INPUT)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    expect(deniedFixture.service.resolve).not.toHaveBeenCalled();
    expect(deniedFixture.service.reserveAndEnqueue).not.toHaveBeenCalled();

    const countryFixture = serviceFixture();
    const foreignContext = context(countryFixture.ports, { countryOfCare: "US" });
    await expect(executeGenerateVaccinationCard(foreignContext, INPUT)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    expect(countryFixture.service.resolve).not.toHaveBeenCalled();
    expect(countryFixture.service.reserveAndEnqueue).not.toHaveBeenCalled();

    const revokedFixture = serviceFixture();
    revokedFixture.approval.current = new Date("2026-08-23T12:05:00.000Z");
    await expect(executeGenerateVaccinationCard(revokedFixture.trusted, INPUT)).rejects.toMatchObject({
      code: "CONFIRMATION_INVALID",
    });
    expect(revokedFixture.service.resolve).not.toHaveBeenCalled();
    expect(revokedFixture.service.reserveAndEnqueue).not.toHaveBeenCalled();
  });

  it("rejects draft facts, package/template drift, country change, and conflicting sources before reservation", async () => {
    const cases: readonly unknown[] = [
      snapshot({ evidenceState: "draft" }),
      snapshot({ country: "US" }),
      snapshot({ asOfDate: "2026-08-22" }),
      snapshot({ package: { ...snapshot().package, releaseStatus: "retired" } }),
      snapshot({ template: { ...snapshot().template, releaseStatus: "draft" } }),
      snapshot({ template: { ...snapshot().template, country: "US" } }),
      snapshot({ template: { ...snapshot().template, locale: "en-US" } }),
      snapshot({
        package: {
          ...snapshot().package,
          sourceReferences: [
            {
              label: "Esquema PAI Colombia",
              referenceCode: "co-pai-schedule-current-2026",
              sourceDigest: SOURCE_DIGEST,
            },
            {
              label: "Conflicting source",
              referenceCode: "co-pai-schedule-current-2026",
              sourceDigest: "c".repeat(64),
            },
          ],
        },
      }),
    ];

    let caseIndex = 0;
    for (const candidate of cases) {
      const fixture = serviceFixture({ snapshot: candidate });
      const token = `guardian-card-clinical-${caseIndex++}`;
      await approved(fixture.trusted, fixture.approval, INPUT, token);
      await expect(executeGenerateVaccinationCard(fixture.trusted, INPUT, {
        preview: fixture.approval.issued.get(token)!,
        token,
      })).rejects.toMatchObject({ code: "CLINICAL_POLICY_UNAVAILABLE" });
      expect(fixture.service.resolve).toHaveBeenCalledTimes(1);
      expect(fixture.service.reserveAndEnqueue).not.toHaveBeenCalled();
    }
  });

  it("reauthorizes immediately before reservation and never reads replay state first", async () => {
    let fixture!: ReturnType<typeof serviceFixture>;
    fixture = serviceFixture({
      resolve: () => {
        fixture.approval.current = new Date("2026-08-23T12:05:00.000Z");
        return fixture.resolved;
      },
    });
    const preview = await approved(fixture.trusted, fixture.approval, INPUT, "guardian-card-revoked-after-resolve");
    await expect(executeGenerateVaccinationCard(fixture.trusted, INPUT, {
      preview: preview.preview,
      token: "guardian-card-revoked-after-resolve",
    })).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
    expect(fixture.service.resolve).toHaveBeenCalledTimes(1);
    expect(fixture.service.reserveAndEnqueue).not.toHaveBeenCalled();
  });

  it("returns a durable idempotent replay without exposing job or document identifiers", async () => {
    let reservations = 0;
    const fixture = serviceFixture({
      reserve: (request) => {
        reservations += 1;
        return Object.freeze({
          outcome: reservations === 1 ? "created" as const : "idempotent_replay" as const,
          status: "processing" as const,
          documentStatus: "processing" as const,
          snapshot: request.snapshot,
        });
      },
    });
    const firstPreview = await approved(fixture.trusted, fixture.approval, INPUT, "guardian-card-replay-1");
    const first = await executeGenerateVaccinationCard(fixture.trusted, INPUT, {
      preview: firstPreview.preview,
      token: "guardian-card-replay-1",
    });
    const secondPreview = await approved(fixture.trusted, fixture.approval, INPUT, "guardian-card-replay-2");
    const second = await executeGenerateVaccinationCard(fixture.trusted, INPUT, {
      preview: secondPreview.preview,
      token: "guardian-card-replay-2",
    });

    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("replayed");
    expect(second.result.data.status).toBe("processing");
    expect(second.result.data.documentStatus).toBe("processing");
    expect(reservations).toBe(2);
    expect(JSON.stringify(second)).not.toContain("job-");
    expect(JSON.stringify(second)).not.toContain("document-");
    expect(JSON.stringify(second)).not.toContain("/private/");
  });

  it("returns persisted failed status and maps render/queue failures safely", async () => {
    const failedFixture = serviceFixture({
      receipt: Object.freeze({
        outcome: "created" as const,
        status: "failed" as const,
        documentStatus: "failed" as const,
        snapshot: snapshot(),
      }),
    });
    const failedPreview = await approved(failedFixture.trusted, failedFixture.approval, INPUT, "guardian-card-failed-receipt");
    const failed = await executeGenerateVaccinationCard(failedFixture.trusted, INPUT, {
      preview: failedPreview.preview,
      token: "guardian-card-failed-receipt",
    });
    expect(failed.result.data.status).toBe("failed");
    expect(failed.result.data.documentStatus).toBe("failed");
    expect((await generateVaccinationCardTool.toModelOutput?.(failed))).toMatchObject({
      value: { data: { status: "failed" } },
    });

    const errorFixture = serviceFixture({
      reserve: () => { throw new Error("PDF_RENDER_FAILED /private/child/card.pdf"); },
    });
    const errorPreview = await approved(errorFixture.trusted, errorFixture.approval, INPUT, "guardian-card-pdf-error");
    await expect(executeGenerateVaccinationCard(errorFixture.trusted, INPUT, {
      preview: errorPreview.preview,
      token: "guardian-card-pdf-error",
    })).rejects.toMatchObject({ code: "PERSISTENCE_UNAVAILABLE" });
    expect(errorFixture.service.reserveAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("cancels before resolution and after each in-flight port without claiming success", async () => {
    const beforeController = new AbortController();
    const beforeFixture = serviceFixture();
    const beforeContext = context(beforeFixture.ports, { controller: beforeController });
    const beforePreview = await approved(beforeContext, beforeFixture.approval, INPUT, "guardian-card-cancel-before");
    beforeController.abort();
    await expect(executeGenerateVaccinationCard(beforeContext, INPUT, {
      preview: beforePreview.preview,
      token: "guardian-card-cancel-before",
    })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(beforeFixture.service.resolve).not.toHaveBeenCalled();
    expect(beforeFixture.service.reserveAndEnqueue).not.toHaveBeenCalled();

    const duringResolveController = new AbortController();
    const duringResolveFixture = serviceFixture({
      resolve: () => {
        duringResolveController.abort();
        return duringResolveFixture.resolved;
      },
    });
    const duringResolveContext = context(duringResolveFixture.ports, { controller: duringResolveController });
    const duringResolvePreview = await approved(duringResolveContext, duringResolveFixture.approval, INPUT, "guardian-card-cancel-resolve");
    await expect(executeGenerateVaccinationCard(duringResolveContext, INPUT, {
      preview: duringResolvePreview.preview,
      token: "guardian-card-cancel-resolve",
    })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(duringResolveFixture.service.resolve).toHaveBeenCalledTimes(1);
    expect(duringResolveFixture.service.reserveAndEnqueue).not.toHaveBeenCalled();

    const duringReserveController = new AbortController();
    const duringReserveFixture = serviceFixture({
      reserve: () => {
        duringReserveController.abort();
        return Object.freeze({
          outcome: "created" as const,
          status: "queued" as const,
          documentStatus: "reserved" as const,
          snapshot: duringReserveFixture.resolved,
        });
      },
    });
    const duringReserveContext = context(duringReserveFixture.ports, { controller: duringReserveController });
    const duringReservePreview = await approved(duringReserveContext, duringReserveFixture.approval, INPUT, "guardian-card-cancel-reserve");
    await expect(executeGenerateVaccinationCard(duringReserveContext, INPUT, {
      preview: duringReservePreview.preview,
      token: "guardian-card-cancel-reserve",
    })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(duringReserveFixture.service.reserveAndEnqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched receipts and keeps citation projection deterministic", async () => {
    const mismatchFixture = serviceFixture({
      receipt: Object.freeze({
        outcome: "created" as const,
        status: "queued" as const,
        documentStatus: "reserved" as const,
        snapshot: snapshot({ asOfDate: "2026-08-22" }),
      }),
    });
    const mismatchPreview = await approved(mismatchFixture.trusted, mismatchFixture.approval, INPUT, "guardian-card-mismatch");
    await expect(executeGenerateVaccinationCard(mismatchFixture.trusted, INPUT, {
      preview: mismatchPreview.preview,
      token: "guardian-card-mismatch",
    })).rejects.toMatchObject({ code: "PERSISTENCE_UNAVAILABLE" });

    const firstSource = Object.freeze({
      label: "Fuente Z",
      referenceCode: "z-source",
      sourceDigest: "c".repeat(64),
    });
    const secondSource = Object.freeze({
      label: "Fuente A",
      referenceCode: "a-source",
      sourceDigest: "d".repeat(64),
    });
    const orderedFixture = serviceFixture({
      snapshot: snapshot({
        package: {
          ...snapshot().package,
          sourceReferences: [firstSource, secondSource],
        },
      }),
    });
    const orderedPreview = await approved(orderedFixture.trusted, orderedFixture.approval, INPUT, "guardian-card-deterministic");
    const orderedResult = await executeGenerateVaccinationCard(orderedFixture.trusted, INPUT, {
      preview: orderedPreview.preview,
      token: "guardian-card-deterministic",
    });
    const modelOne = projectGenerateVaccinationCardForModel(orderedResult.result);
    const modelTwo = projectGenerateVaccinationCardForModel(structuredClone(orderedResult.result));
    expect(JSON.stringify(modelOne)).toBe(JSON.stringify(modelTwo));
    expect(modelOne.data.citationHandles).toEqual([...modelOne.data.citationHandles].sort());
    expect(JSON.stringify(modelOne)).not.toContain("c".repeat(64));
    expect(JSON.stringify(modelOne)).not.toContain("d".repeat(64));
    expect(() => projectGenerateVaccinationCardForModel({
      ...orderedResult.result,
      data: { ...orderedResult.result.data, storagePath: "/private/child/card.pdf" },
    })).toThrow();
  });
});
