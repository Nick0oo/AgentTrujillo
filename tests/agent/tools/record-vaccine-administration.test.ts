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
import { getPrivateToolErrorDiagnostics } from "../../../agent/lib/runtime/safe-tool-errors";
import {
  createTrustedToolContext,
  type ToolServicePorts,
} from "../../../agent/lib/runtime/trusted-tool-context";
import type { VaccineCatalog, VaccineEvidence } from "../../../src/clinical/immunization/types";
import { createAdministrationDraft } from "../../../src/clinical/immunization/evidence";

import {
  RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA,
  executeRecordVaccineAdministration,
  type VaccineAdministrationPort,
  type RecordVaccineAdministrationInput,
} from "../../../agent/tools/record_vaccine_administration";
import recordVaccineAdministrationTool from "../../../agent/tools/record_vaccine_administration";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const PRODUCT_SESSION = "00000000-0000-4000-8000-000000000004";
const ADMINISTRATION_ID = "00000000-0000-4000-8000-000000000005";
const ALL_PERMISSIONS: readonly ChildPermission[] = [
  "read", "record", "manage_documents", "manage_medication", "manage_guardians",
];

const VALID_INPUT: RecordVaccineAdministrationInput = Object.freeze({
  productLabel: "Hepatitis B",
  productIdentifier: "CO-HEP-B",
  administeredOn: "2026-08-10",
  location: "Centro de salud",
  evidenceDraftId: "draft-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  idempotencyKey: "guardian-vaccine-1",
});

const EVIDENCE: VaccineEvidence = Object.freeze({
  sourceType: "guardian",
  sourceId: "guardian-declaration-1",
  sourceDigest: "b".repeat(64) as VaccineEvidence["sourceDigest"],
  extractedAt: "2026-08-23T11:00:00.000Z",
  observedScope: { childId: CHILD, countryCode: "CO" as const },
  expiresAt: "2026-08-23T12:03:00.000Z",
});

const CATALOG: VaccineCatalog = Object.freeze({
  version: "catalog-2026.1",
  sourceDigest: "c".repeat(64) as never,
  antigens: Object.freeze([{
    id: "00000000-0000-4000-8000-000000000010" as never,
    antigenCode: "HEP_B",
    displayName: "Hepatitis B",
    diseaseGroup: "hep-b",
    active: true,
  }]),
  products: Object.freeze([{
    id: "00000000-0000-4000-8000-000000000011" as never,
    productCode: "CO-HEP-B",
    countryCode: "CO" as const,
    manufacturer: "Synthetic",
    brandName: "Hepatitis B",
    presentation: "dose",
    regulatoryIdentifier: null,
    aliases: ["Hepatitis B"],
    effectiveFrom: "2020-01-01" as never,
    effectiveUntil: null,
    active: true,
  }]),
  productAntigens: Object.freeze([{
    productId: "00000000-0000-4000-8000-000000000011" as never,
    antigenId: "00000000-0000-4000-8000-000000000010" as never,
  }]),
});

const PACKAGE = Object.freeze({
  country: "CO" as const,
  packageId: "co-pai-basic-2026-v1",
  packageVersion: "2026.basic.1",
  releaseStatus: "active" as const,
  algorithmId: "immunization-status-v1",
  sourceReferences: Object.freeze([Object.freeze({
    label: "Esquema PAI Colombia",
    referenceCode: "co-pai-schedule-current-2026-08-21",
    sourceDigest: "d".repeat(64),
  })]),
});

const EVALUATION = Object.freeze({
  evidenceState: "confirmed_only" as const,
  package: PACKAGE,
  assessments: Object.freeze([Object.freeze({
    ruleCode: "CO-PAI-HEPB-RN",
    seriesCode: "PAI.HEPB",
    doseCode: "birth",
    doseNumber: 1,
    status: "applied" as const,
    reasonCode: "DOSE_APPLIED",
    dueFrom: null,
    dueUntil: null,
    matchedAdministrationIds: Object.freeze([ADMINISTRATION_ID]),
    sourceReferences: PACKAGE.sourceReferences,
  })]),
});

function draft(overrides: Readonly<{
  administeredOn?: string;
  location?: string;
  childId?: string;
  doseLabel?: string;
  lotNumber?: string;
  providerName?: string;
  product?: Readonly<{ productCode?: string; alias?: string; regulatoryIdentifier?: string }>;
}> = {}) {
  const created = createAdministrationDraft(
    Object.freeze({
      careSpaceId: SPACE,
      childId: overrides.childId ?? CHILD,
      countryCode: "CO" as const,
      asOfDate: "2026-08-23" as never,
    }),
    EVIDENCE,
    Object.freeze({
      administeredOn: (overrides.administeredOn ?? VALID_INPUT.administeredOn) as never,
      product: overrides.product ?? { productCode: "CO-HEP-B", alias: "Hepatitis B" },
      ...(overrides.doseLabel === undefined ? {} : { doseLabel: overrides.doseLabel }),
      ...(overrides.lotNumber === undefined ? {} : { lotNumber: overrides.lotNumber }),
      ...(overrides.providerName === undefined ? {} : { providerName: overrides.providerName }),
      administrationSite: overrides.location ?? VALID_INPUT.location,
      provenanceType: "guardian" as const,
    }),
  );
  return Object.freeze({ ...created, draftId: VALID_INPUT.evidenceDraftId });
}

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
    if (!preview || this.consumed.has(request.token)) return { status: "not_found" as const };
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
  now(): Date { return new Date(NOW); }
  async emit(event: ToolAuditEvent): Promise<unknown> {
    this.events.push(event);
    return { outcome: "recorded", eventId: event.eventId, correlationId: event.correlationId };
  }
}

type MockedVaccineAdministrationService = {
  [K in keyof VaccineAdministrationPort]: ReturnType<typeof vi.fn>;
};

function context(overrides: Readonly<{
  service?: Partial<MockedVaccineAdministrationService>;
  controller?: AbortController;
  permissions?: readonly ChildPermission[];
  country?: "CO" | "US";
  now?: Date;
}> = {}) {
  const now = overrides.now ?? NOW;
  const country = overrides.country ?? "CO";
  const scope = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR,
    careSpaceId: SPACE as never,
    childId: CHILD as never,
    permissions: overrides.permissions ?? ALL_PERMISSIONS,
    countryOfCare: country,
    timezone: country === "CO" ? "America/Bogota" : "America/New_York",
    authorizationVersion: "m:2:a:7",
    issuedAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 4 * 60_000),
  });
  const guardian: AuthenticatedGuardian = Object.freeze({
    userId: ACTOR,
    issuedAt: new Date(now.getTime() - 5 * 60_000),
    expiresAt: new Date(now.getTime() + 60 * 60_000),
    bearerToken: "synthetic-bearer" as SupabaseBearerToken,
  });
  const session: OwnedSessionRecord = Object.freeze({
    productSessionId: PRODUCT_SESSION,
    eveSessionId: "eve-session-fixture",
    ownerUserId: ACTOR as never,
    careSpaceId: SPACE as never,
    childId: CHILD as never,
    authorizationVersion: scope.authorizationVersion,
    authorizationExpiresAt: scope.expiresAt,
    status: "active",
    lastSequence: 1,
  });
  const approval = new FakeApprovalPort();
  const audit = new FakeAuditSink();
  const service = {
    preflight: vi.fn(async () => ({ decision: "not_urgent" as const })),
    resolveDraft: vi.fn(async () => ({ status: "draft" as const, draft: draft() })),
    loadChildDateOfBirth: vi.fn(async () => "2026-01-01"),
    loadCatalog: vi.fn(async () => CATALOG),
    resolvePackage: vi.fn(async () => PACKAGE),
    recordConfirmed: vi.fn(async () => ({ outcome: "created" as const, administrationId: ADMINISTRATION_ID })),
    reevaluate: vi.fn(async () => EVALUATION),
    ...overrides.service,
  } as MockedVaccineAdministrationService;
  const controller = overrides.controller ?? new AbortController();
  const services = Object.freeze({
    toolApproval: approval,
    toolIdempotency: Object.freeze({ now: () => approval.now() }),
    toolAudit: audit,
    vaccineAdministration: service,
  });
  const trusted = createTrustedToolContext({
    guarded: Object.freeze({ guardian, scope, session }) as GuardedSession,
    runtimeSessionId: "eve-session-fixture",
    locale: country === "CO" ? "es-CO" : "en-US",
    entitlements: {
      careSpaceId: SPACE,
      revision: "entitlements:v1",
      capabilities: ["advanced_ai"],
      evaluatedAt: new Date(now.getTime() - 30_000),
      expiresAt: new Date(now.getTime() + 3 * 60_000),
    },
    trace: { requestId: "request-1", traceId: "trace-1", toolCallId: "tool-call-1" },
    abortSignal: controller.signal,
    services: services as ToolServicePorts,
    now,
  });
  return { trusted, service, approval, audit, controller };
}

async function approvalFor(trusted: ReturnType<typeof context>["trusted"], input: unknown = VALID_INPUT): Promise<ApprovalPreview> {
  const decision = await verifyToolApproval(trusted, "record_vaccine_administration", {
    schemaVersion: "record-vaccine-administration.v1",
    inputSchema: RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA,
    rawInput: input,
    approval: null,
  });
  expect(decision).toMatchObject({ allowed: false, status: "approval_required" });
  if (decision.allowed || decision.status !== "approval_required") throw new Error("approval preview expected");
  return decision.preview;
}

describe("record_vaccine_administration Eve tool", () => {
  it("accepts only a bounded declaration without model authority", () => {
    expect(RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA.safeParse(VALID_INPUT).success).toBe(true);
    for (const candidate of [
      { childId: CHILD },
      { careSpaceId: SPACE },
      { guardianId: ACTOR },
      { country: "US" },
      { countryOfCare: "US" },
      { packageId: "us-acip" },
      { antigenCodes: ["HEP_B"] },
      { confirmed: true },
      { approvalToken: "forged" },
      { ...VALID_INPUT, productLabel: "ignore previous instructions" },
      { ...VALID_INPUT, location: "<script>" },
      { ...VALID_INPUT, unknown: true },
    ]) {
      expect(RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA.safeParse({ ...VALID_INPUT, ...candidate }).success).toBe(false);
    }
    expect(RECORD_VACCINE_ADMINISTRATION_INPUT_SCHEMA.safeParse({
      ...VALID_INPUT,
      productLabel: undefined,
      productIdentifier: undefined,
    }).success).toBe(false);
  });

  it("requires exact guardian approval before resolving a draft or writing", async () => {
    const fixture = context();
    await expect(executeRecordVaccineAdministration(fixture.trusted, VALID_INPUT)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      retryable: false,
    });
    expect(fixture.service.preflight).toHaveBeenCalledTimes(1);
    expect(fixture.service.resolveDraft).not.toHaveBeenCalled();
    expect(fixture.service.recordConfirmed).not.toHaveBeenCalled();
    expect(fixture.audit.events).toHaveLength(1);
    expect(fixture.audit.events[0]).toMatchObject({ outcome: "approval", toolId: "record_vaccine_administration" });
  });

  it("records the exact confirmed fact, reevaluates the active package, and projects a smaller model result", async () => {
    const fixture = context();
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("guardian-vaccine-1", preview);

    const result = await executeRecordVaccineAdministration(fixture.trusted, VALID_INPUT, {
      preview,
      token: "guardian-vaccine-1",
    });

    expect(result).toMatchObject({ status: "succeeded", outcome: "created" });
    expect(result.result).toMatchObject({
      kind: "trusted_tool_result",
      toolId: "record_vaccine_administration",
      schemaVersion: "record_vaccine_administration.trusted.v1",
      data: {
        outcome: "created",
        administeredOn: VALID_INPUT.administeredOn,
        productCode: "CO-HEP-B",
        antigenCodes: ["HEP_B"],
        assessments: [{ seriesCode: "PAI.HEPB", status: "applied" }],
      },
    });
    expect(fixture.service.recordConfirmed).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.objectContaining({ childId: CHILD, careSpaceId: SPACE, countryOfCare: "CO" }),
      idempotencyKey: expect.stringMatching(/^record_vaccine_administration:[a-f0-9]{64}$/u),
      inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      confirmation: { approvalSha256: preview.approvalDigest },
      candidate: expect.objectContaining({ doseLabel: null, lotNumber: null, providerName: null }),
    }));
    expect(fixture.service.recordConfirmed.mock.calls[0]?.[0]).not.toHaveProperty("idempotencyKey", VALID_INPUT.idempotencyKey);
    expect(fixture.service.reevaluate).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.objectContaining({ childId: CHILD, countryOfCare: "CO" }),
      package: PACKAGE,
      administrationId: ADMINISTRATION_ID,
    }));

    const model = await recordVaccineAdministrationTool.toModelOutput?.(result);
    expect(model).toMatchObject({
      type: "json",
      value: {
        kind: "tool_result",
        toolId: "record_vaccine_administration",
        schemaVersion: "record_vaccine_administration.model.v1",
        data: {
          outcome: "created",
          administeredOn: VALID_INPUT.administeredOn,
          productCode: "CO-HEP-B",
          antigenCodes: ["HEP_B"],
          assessments: [{ seriesCode: "PAI.HEPB", status: "applied" }],
        },
      },
    });
    expect(JSON.stringify(model)).not.toContain(ADMINISTRATION_ID);
    expect(JSON.stringify(model)).not.toContain(SPACE);
    expect(fixture.audit.events.at(-1)).toMatchObject({ outcome: "success", safeErrorCode: null });
  });

  it("rejects an auto-confirmed or already-confirmed draft without an effect", async () => {
    const fixture = context({
      service: {
        resolveDraft: vi.fn(async () => ({ status: "confirmed" as const, draft: draft() })),
      },
    });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("auto-confirm", preview);

    await expect(executeRecordVaccineAdministration(fixture.trusted, VALID_INPUT, {
      preview,
      token: "auto-confirm",
    })).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
    expect(fixture.service.recordConfirmed).not.toHaveBeenCalled();
  });

  it("rejects draft facts that were not represented in the exact approval preview", async () => {
    for (const hidden of [
      { doseLabel: "dose-1" },
      { lotNumber: "lot-123" },
      { providerName: "Profesional no confirmado" },
      { product: { productCode: "CO-HEP-B", alias: "Hepatitis B", regulatoryIdentifier: "hidden-routing-id" } },
    ]) {
      const fixture = context({
        service: {
          resolveDraft: vi.fn(async () => ({ status: "draft" as const, draft: draft(hidden) })),
        },
      });
      const preview = await approvalFor(fixture.trusted);
      fixture.approval.issue(`hidden-${Object.keys(hidden)[0]}`, preview);

      await expect(executeRecordVaccineAdministration(fixture.trusted, VALID_INPUT, {
        preview,
        token: `hidden-${Object.keys(hidden)[0]}`,
      })).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
      expect(fixture.service.recordConfirmed).not.toHaveBeenCalled();
    }
  });

  it("denies ambiguous catalog resolution and never guesses a product", async () => {
    const ambiguousCatalog = Object.freeze({
      ...CATALOG,
      products: Object.freeze([
        { ...CATALOG.products[0], id: "00000000-0000-4000-8000-000000000012" as never, productCode: "CO-HEP-B-1" },
        { ...CATALOG.products[0], id: "00000000-0000-4000-8000-000000000013" as never, productCode: "CO-HEP-B-2" },
      ]),
      productAntigens: Object.freeze([
        { productId: "00000000-0000-4000-8000-000000000012" as never, antigenId: CATALOG.antigens[0]!.id },
        { productId: "00000000-0000-4000-8000-000000000013" as never, antigenId: CATALOG.antigens[0]!.id },
      ]),
    });
    const { productIdentifier: _productIdentifier, ...withoutIdentifier } = VALID_INPUT;
    const ambiguousInput = Object.freeze(withoutIdentifier) as RecordVaccineAdministrationInput;
    const fixture = context({
      service: {
        resolveDraft: vi.fn(async () => ({
          status: "draft" as const,
          draft: draft({ product: { alias: "Hepatitis B" } }),
        })),
        loadCatalog: vi.fn(async () => ambiguousCatalog),
      },
    });
    const preview = await approvalFor(fixture.trusted, ambiguousInput);
    fixture.approval.issue("ambiguous", preview);

    await expect(executeRecordVaccineAdministration(fixture.trusted, ambiguousInput, {
      preview,
      token: "ambiguous",
    })).rejects.toMatchObject({ code: expect.stringMatching(/CONFIRMATION_INVALID|CLINICAL_POLICY_UNAVAILABLE/u) });
    expect(fixture.service.recordConfirmed).not.toHaveBeenCalled();
  });

  it.each([
    ["future", "2026-08-24"],
    ["before birth", "2025-12-01"],
  ])("rejects an administration date %s", async (_label, administeredOn) => {
    const input = Object.freeze({ ...VALID_INPUT, administeredOn }) as RecordVaccineAdministrationInput;
    const fixture = context({
      service: {
        resolveDraft: vi.fn(async () => ({ status: "draft" as const, draft: draft({ administeredOn }) })),
      },
    });
    const preview = await approvalFor(fixture.trusted, input);
    fixture.approval.issue(`date-${administeredOn}`, preview);

    await expect(executeRecordVaccineAdministration(fixture.trusted, input, {
      preview,
      token: `date-${administeredOn}`,
    })).rejects.toMatchObject({ code: "CLINICAL_POLICY_UNAVAILABLE" });
    expect(fixture.service.recordConfirmed).not.toHaveBeenCalled();
  });

  it("rejects confirmation drift before resolving the draft", async () => {
    const fixture = context();
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("drift", preview);
    const changed = Object.freeze({ ...VALID_INPUT, location: "Otro centro" });

    await expect(executeRecordVaccineAdministration(fixture.trusted, changed, {
      preview,
      token: "drift",
    })).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
    expect(fixture.service.resolveDraft).not.toHaveBeenCalled();
    expect(fixture.service.recordConfirmed).not.toHaveBeenCalled();
  });

  it("derives replay identity from the wrapper and maps a domain replay", async () => {
    const fixture = context();
    fixture.service.recordConfirmed
      .mockResolvedValueOnce({ outcome: "created", administrationId: ADMINISTRATION_ID })
      .mockResolvedValueOnce({ outcome: "idempotent_replay", administrationId: ADMINISTRATION_ID });

    for (const [token, expected] of [["first-token", "created"], ["second-token", "replayed"]] as const) {
      const preview = await approvalFor(fixture.trusted);
      fixture.approval.issue(token, preview);
      const result = await executeRecordVaccineAdministration(fixture.trusted, VALID_INPUT, { preview, token });
      expect(result.outcome).toBe(expected);
    }
    const calls = fixture.service.recordConfirmed.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0].idempotencyKey).toBe(calls[1]?.[0].idempotencyKey);
    expect(calls[0]?.[0].idempotencyKey).not.toBe(VALID_INPUT.idempotencyKey);
  });

  it("returns a safe conflict without reevaluating or leaking service details", async () => {
    const fixture = context({
      service: {
        recordConfirmed: vi.fn(async () => {
          throw Object.assign(new Error("duplicate child record https://private.invalid/child"), {
            code: "IDEMPOTENCY_CONFLICT",
          });
        }),
      },
    });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("conflict", preview);

    const error = await executeRecordVaccineAdministration(fixture.trusted, VALID_INPUT, {
      preview,
      token: "conflict",
    }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(String(error)).not.toContain("private.invalid");
    expect(fixture.service.reevaluate).not.toHaveBeenCalled();
  });

  it("fails closed when the country package changes between preflight and write", async () => {
    const fixture = context({
      service: {
        resolvePackage: vi.fn()
          .mockResolvedValueOnce(PACKAGE)
          .mockResolvedValueOnce({ ...PACKAGE, country: "US" as const }),
      },
    });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("country-race", preview);

    await expect(executeRecordVaccineAdministration(fixture.trusted, VALID_INPUT, {
      preview,
      token: "country-race",
    })).rejects.toMatchObject({ code: "CLINICAL_POLICY_UNAVAILABLE" });
    expect(fixture.service.recordConfirmed).not.toHaveBeenCalled();
  });

  it("rejects sibling evidence and revoked or expired trusted contexts", async () => {
    const sibling = context({
      service: {
        resolveDraft: vi.fn(async () => ({ status: "draft" as const, draft: draft({ childId: "00000000-0000-4000-8000-000000000099" }) })),
      },
    });
    const siblingPreview = await approvalFor(sibling.trusted);
    sibling.approval.issue("sibling-token", siblingPreview);
    await expect(executeRecordVaccineAdministration(sibling.trusted, VALID_INPUT, {
      preview: siblingPreview,
      token: "sibling-token",
    })).rejects.toMatchObject({ code: expect.stringMatching(/CONFIRMATION_INVALID|CLINICAL_POLICY_UNAVAILABLE/u) });
    expect(sibling.service.recordConfirmed).not.toHaveBeenCalled();

    const expired = context({ now: new Date("2026-08-23T10:00:00.000Z") });
    await expect(executeRecordVaccineAdministration(expired.trusted, VALID_INPUT)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    expect(expired.service.recordConfirmed).not.toHaveBeenCalled();

    const revoked = context({
      service: { resolvePackage: vi.fn(async () => null) },
    });
    const revokedPreview = await approvalFor(revoked.trusted);
    revoked.approval.issue("revoked-package", revokedPreview);
    await expect(executeRecordVaccineAdministration(revoked.trusted, VALID_INPUT, {
      preview: revokedPreview,
      token: "revoked-package",
    })).rejects.toMatchObject({ code: "CLINICAL_POLICY_UNAVAILABLE" });
    expect(revoked.service.recordConfirmed).not.toHaveBeenCalled();
  });

  it("denies urgent preflight and cancellation before approval or effect", async () => {
    const urgent = context({
      service: { preflight: vi.fn(async () => ({ decision: "urgent" as const })) },
    });
    await expect(executeRecordVaccineAdministration(urgent.trusted, VALID_INPUT)).rejects.toMatchObject({
      code: "CLINICAL_POLICY_UNAVAILABLE",
    });
    expect(urgent.service.resolveDraft).not.toHaveBeenCalled();
    expect(urgent.service.recordConfirmed).not.toHaveBeenCalled();

    const cancelled = context();
    cancelled.controller.abort();
    await expect(executeRecordVaccineAdministration(cancelled.trusted, VALID_INPUT)).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(cancelled.service.recordConfirmed).not.toHaveBeenCalled();
  });

  it("reports cancellation after a returned write as a committed effect", async () => {
    const controller = new AbortController();
    const fixture = context({
      controller,
      service: {
        recordConfirmed: vi.fn(async () => {
          controller.abort();
          return { outcome: "created" as const, administrationId: ADMINISTRATION_ID };
        }),
      },
    });
    const preview = await approvalFor(fixture.trusted);
    fixture.approval.issue("cancel-after-write", preview);

    const error = await executeRecordVaccineAdministration(fixture.trusted, VALID_INPUT, {
      preview,
      token: "cancel-after-write",
    }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "CANCELLED", retryable: false });
    expect(getPrivateToolErrorDiagnostics(error)).toMatchObject({ effectState: "committed" });
    expect(fixture.service.recordConfirmed).toHaveBeenCalledTimes(1);
    expect(fixture.service.reevaluate).not.toHaveBeenCalled();
  });

  it("does not merge foreign package or forged antigen facts", async () => {
    const foreign = context({
      service: {
        resolvePackage: vi.fn(async () => ({ ...PACKAGE, country: "US" as const })),
      },
    });
    const preview = await approvalFor(foreign.trusted);
    foreign.approval.issue("foreign-package", preview);
    await expect(executeRecordVaccineAdministration(foreign.trusted, VALID_INPUT, {
      preview,
      token: "foreign-package",
    })).rejects.toMatchObject({ code: "CLINICAL_POLICY_UNAVAILABLE" });
    expect(foreign.service.recordConfirmed).not.toHaveBeenCalled();

    const forgedCatalog = Object.freeze({
      ...CATALOG,
      productAntigens: Object.freeze([{
        productId: CATALOG.products[0]!.id,
        antigenId: "00000000-0000-4000-8000-000000000099" as never,
      }]),
    });
    const forged = context({ service: { loadCatalog: vi.fn(async () => forgedCatalog) } });
    const forgedPreview = await approvalFor(forged.trusted);
    forged.approval.issue("forged-antigen", forgedPreview);
    await expect(executeRecordVaccineAdministration(forged.trusted, VALID_INPUT, {
      preview: forgedPreview,
      token: "forged-antigen",
    })).rejects.toMatchObject({ code: "CLINICAL_POLICY_UNAVAILABLE" });
    expect(forged.service.recordConfirmed).not.toHaveBeenCalled();
  });

  it("produces deterministic output and contains no certification, diagnosis, order, or scheduling claim", async () => {
    const first = context();
    const firstPreview = await approvalFor(first.trusted);
    first.approval.issue("deterministic", firstPreview);
    const firstResult = await executeRecordVaccineAdministration(first.trusted, VALID_INPUT, {
      preview: firstPreview,
      token: "deterministic",
    });
    const second = context();
    const secondPreview = await approvalFor(second.trusted);
    second.approval.issue("deterministic", secondPreview);
    const secondResult = await executeRecordVaccineAdministration(second.trusted, VALID_INPUT, {
      preview: secondPreview,
      token: "deterministic",
    });
    expect(JSON.stringify(firstResult)).toBe(JSON.stringify(secondResult));
    expect(JSON.stringify(firstResult)).not.toMatch(/certifica(?:ci[oó]n)?\s+inmunidad|contraindic|diagnos|appointment|reminder|booking|\bcita\b|recordatorio/iu);
    expect(recordVaccineAdministrationTool.description).toContain("no certifica inmunidad");
  });
});
