import { describe, expect, it, vi } from "vitest";

import { createImmunizationRepository } from "../../src/persistence/supabase/immunization-repository.ts";
import type { AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope.ts";

const scope: AuthorizedChildScope = {
  actorUserId: "00000000-0000-4000-8000-000000000001" as never,
  careSpaceId: "00000000-0000-4000-8000-000000000002" as never,
  childId: "00000000-0000-4000-8000-000000000003" as never,
  permissions: ["record", "read"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-16T12:00:00.000Z"),
  expiresAt: new Date("2099-08-16T12:04:00.000Z"),
};

const candidate = {
  scope: { careSpaceId: scope.careSpaceId, childId: scope.childId, countryCode: "CO" as const, asOfDate: "2026-08-16" as never },
  administeredOn: "2026-08-10" as never,
  product: null,
  antigenIds: ["00000000-0000-4000-8000-000000000010" as never],
  doseLabel: "dose-1",
  provenanceType: "document" as const,
  sourceDigest: "a".repeat(64) as never,
  confirmationDigest: "b".repeat(64) as never,
};

describe("Supabase immunization repository", () => {
  it("writes only through the atomic Cloud RPC and maps its outcome", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ administration_id: "00000000-0000-4000-8000-000000000011", outcome: "created" }], error: null });
    const repository = createImmunizationRepository({ rpc } as never);
    const result = await repository.recordConfirmed(scope, { candidate, idempotencyKey: "idem-1", inputFingerprint: "c".repeat(64), requestId: "immunization-test" });
    expect(rpc).toHaveBeenCalledWith("record_confirmed_vaccine_administration", expect.objectContaining({ p_care_space_id: scope.careSpaceId, p_idempotency_key: "idem-1" }));
    expect(result).toEqual({ outcome: "created", administrationId: "00000000-0000-4000-8000-000000000011" });
  });

  it("denies without record permission and does not fall back to a table insert", async () => {
    const rpc = vi.fn();
    const repository = createImmunizationRepository({ rpc } as never);
    const readOnly = { ...scope, permissions: ["read"] as const } as unknown as AuthorizedChildScope;
    const result = await repository.recordConfirmed(readOnly, { candidate, idempotencyKey: "idem-1", inputFingerprint: "c".repeat(64), requestId: "immunization-test" });
    expect(result).toMatchObject({ ok: false, code: "ACCESS_DENIED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("persists assessment provenance through the Cloud assessment RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ assessment_id: "00000000-0000-4000-8000-000000000012", outcome: "created" }], error: null });
    const repository = createImmunizationRepository({ rpc } as never);
    const result = await repository.saveAssessment(scope, {
      scheduleId: "00000000-0000-4000-8000-000000000013",
      assessment: {
        scope: { careSpaceId: scope.careSpaceId, childId: scope.childId, countryCode: "CO", asOfDate: "2026-08-16" },
        ruleId: "00000000-0000-4000-8000-000000000014",
        status: "due",
        reasonCode: "DOSE_DUE",
        dueFrom: null,
        dueUntil: null,
        evidenceAdministrationIds: [],
        rulePackId: "00000000-0000-4000-8000-000000000015",
        rulePackVersion: "synthetic",
        algorithmId: "00000000-0000-4000-8000-000000000016",
        sourceDigest: "a".repeat(64),
        inputDigest: "b".repeat(64),
        decisionDigest: "c".repeat(64),
        assessedAt: "2026-08-16T12:00:00.000Z",
      } as never,
      inputFingerprint: "d".repeat(64),
      requestId: "immunization-test",
    });
    expect(rpc).toHaveBeenCalledWith("persist_vaccination_assessment", expect.objectContaining({ p_status: "due", p_input_fingerprint: "d".repeat(64) }));
    expect(result).toEqual({ outcome: "created", assessmentId: "00000000-0000-4000-8000-000000000012" });
  });
});
