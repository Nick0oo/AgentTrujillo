import { describe, expect, it, vi } from "vitest";

import { createAnthropometryRepository } from "../../src/persistence/supabase/anthropometry-repository.ts";
import type { AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope.ts";
import { createExactClinicalDecimal } from "../../src/clinical/anthropometry/value-objects.ts";
import type { MeasurementCommand, NormalizedMeasurementValue } from "../../src/clinical/anthropometry/types.ts";

const scope = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["record", "read"],
  countryOfCare: "CO",
  timezone: "UTC",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date("2027-01-01T00:00:00Z"),
} as unknown as AuthorizedChildScope;

const command: MeasurementCommand = {
  measurementType: "weight",
  value: "3.3464",
  unit: "kg",
  occurredAt: "2026-08-16T12:00:00.000Z",
  localDate: "2026-08-16",
  timeZone: "UTC",
  measurementMethod: "digital_scale",
  provenanceType: "guardian",
};

const normalized: NormalizedMeasurementValue = {
  original: createExactClinicalDecimal("3.3464"),
  originalUnit: "kg",
  normalized: createExactClinicalDecimal("3.3464"),
  normalizedUnit: "kg",
  conversionVersion: "anthropometry-units.v1",
  roundingMode: "none",
};

const input = {
  command,
  normalized,
  idempotencyKey: "measurement-request-1",
  inputFingerprint: "a".repeat(64),
  confirmation: { confirmationSha256: "b".repeat(64), expiresAt: "2026-08-16T13:00:00.000Z" },
  assessments: [],
};

describe("Cloud anthropometry repository", () => {
  it("persists the confirmed command through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ measurement_id: "measurement-1", assessment_ids: [], outcome: "created" }], error: null });
    const repository = createAnthropometryRepository({ rpc } as never);

    const result = await repository.recordConfirmed(scope, input, "request-1");

    expect(result).toMatchObject({ outcome: "created", measurementId: "measurement-1" });
    expect(rpc).toHaveBeenCalledWith("record_confirmed_anthropometry", expect.objectContaining({
      p_care_space_id: scope.careSpaceId,
      p_child_id: scope.childId,
      p_input_fingerprint: "a".repeat(64),
    }));
  });

  it("denies guardian writes without record permission before touching Cloud", async () => {
    const rpc = vi.fn();
    const repository = createAnthropometryRepository({ rpc } as never);
    const readOnlyScope = { ...scope, permissions: ["read"] } as unknown as AuthorizedChildScope;

    const result = await repository.recordConfirmed(readOnlyScope, input, "request-2");

    expect(result).toMatchObject({ ok: false, code: "ACCESS_DENIED", requestId: "request-2" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a stable conflict on changed replay", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "anthropometry_idempotency_conflict" } });
    const repository = createAnthropometryRepository({ rpc } as never);

    const result = await repository.recordConfirmed(scope, input, "request-3");

    expect(result).toEqual({ code: "IDEMPOTENCY_CONFLICT", requestId: "request-3" });
  });
});
