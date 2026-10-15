import { describe, expect, it } from "vitest";

import {
  CRECIENDO_IMMUNIZATION_VERSION,
  IMMUNIZATION_STATUS_RESPONSE_SCHEMA,
  isValidImmunizationIdempotencyKey,
  parseAdministrationRequest,
  projectImmunizationStatus,
  publicImmunizationError,
  type ImmunizationStatusProjectionInput,
} from "../../../src/channels/creciendo/immunization-contract.ts";

const SCOPE = {
  actorUserId: "11111111-1111-4111-8111-111111111111",
  careSpaceId: "22222222-2222-4222-8222-222222222222",
  childId: "33333333-3333-4333-8333-333333333333",
  permissions: ["read", "record"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-09-02T00:00:00.000Z"),
  expiresAt: new Date("2026-09-02T00:04:00.000Z"),
} as const;

function input(overrides: Partial<ImmunizationStatusProjectionInput> = {}): ImmunizationStatusProjectionInput {
  return {
    requestId: "request-09-00",
    scope: SCOPE as unknown as ImmunizationStatusProjectionInput["scope"],
    asOfDate: "2026-09-02",
    evaluation: {
      evidenceState: "confirmed_only",
      package: {
        country: "CO",
        packageId: "pai-colombia-basic-2026",
        packageVersion: "2026.basic.1",
        releaseStatus: "active",
        algorithmId: "immunization-status-v1",
        sourceReferences: [{ label: "Ministerio de Salud", referenceCode: "PAI-2026", sourceDigest: "a".repeat(64) }],
      },
      assessments: [{
        ruleCode: "PAI_BCG_1",
        seriesCode: "BCG",
        doseCode: "BCG-1",
        doseNumber: 1,
        status: "applied",
        reasonCode: "ADMINISTRATION_CONFIRMED",
        dueFrom: null,
        dueUntil: "2026-09-02",
        matchedAdministrationIds: ["administration-1"],
        sourceReferences: [{ label: "Ministerio de Salud", referenceCode: "PAI-2026", sourceDigest: "a".repeat(64) }],
      }],
    },
    ...overrides,
  } as ImmunizationStatusProjectionInput;
}

describe("Creciendo immunization transport contract", () => {
  it("projects a child-scoped Colombia status without exposing administration IDs", () => {
    const result = projectImmunizationStatus(input());

    expect(result).toMatchObject({
      version: CRECIENDO_IMMUNIZATION_VERSION,
      requestId: "request-09-00",
      status: "ready",
      childId: SCOPE.childId,
      careSpaceId: SCOPE.careSpaceId,
      country: "CO",
      package: { id: "pai-colombia-basic-2026", version: "2026.basic.1" },
    });
    expect(JSON.stringify(result)).not.toContain("administration-1");
    expect(IMMUNIZATION_STATUS_RESPONSE_SCHEMA.parse(result)).toEqual(result);
  });

  it("projects an explicit unavailable state when no approved evaluation exists", () => {
    const result = projectImmunizationStatus(input({ evaluation: null }));

    expect(result).toMatchObject({
      version: CRECIENDO_IMMUNIZATION_VERSION,
      status: "unavailable",
      code: "RULE_UNAVAILABLE",
      country: "CO",
      package: null,
      assessments: [],
    });
  });

  it("rejects a package from a different country", () => {
    expect(() => projectImmunizationStatus(input({
      evaluation: {
        ...input().evaluation!,
        package: { ...input().evaluation!.package, country: "US" },
      },
    }))).toThrow("IMMUNIZATION_COUNTRY_MISMATCH");
  });

  it("rejects duplicate assessment identities and unknown statuses", () => {
    const evaluation = input().evaluation!;
    expect(() => projectImmunizationStatus(input({
      evaluation: { ...evaluation, assessments: [evaluation.assessments[0], evaluation.assessments[0]] },
    }))).toThrow("IMMUNIZATION_DUPLICATE_ASSESSMENT");

    expect(() => projectImmunizationStatus(input({
      evaluation: { ...evaluation, assessments: [{ ...evaluation.assessments[0], status: "pending" as never }] },
    }))).toThrow("IMMUNIZATION_STATUS_INVALID");
  });

  it("accepts only confirmed declarations and does not accept client scope authority", () => {
    expect(parseAdministrationRequest({
      version: CRECIENDO_IMMUNIZATION_VERSION,
      administeredOn: "2026-09-02",
      productLabel: "BCG",
      evidenceDraftId: "draft-1",
      confirmed: true,
    })).toMatchObject({ productLabel: "BCG", confirmed: true });

    expect(parseAdministrationRequest({
      version: CRECIENDO_IMMUNIZATION_VERSION,
      administeredOn: "2026-09-02",
      productLabel: "BCG",
      evidenceDraftId: "draft-1",
      confirmed: false,
    })).toBeNull();

    expect(parseAdministrationRequest({
      version: CRECIENDO_IMMUNIZATION_VERSION,
      administeredOn: "2026-09-02",
      productLabel: "BCG",
      evidenceDraftId: "draft-1",
      confirmed: true,
      childId: SCOPE.childId,
    })).toBeNull();
  });

  it("validates idempotency keys and maps only stable public errors", () => {
    expect(isValidImmunizationIdempotencyKey(`immunization:${"0".repeat(64)}`)).toBe(true);
    expect(isValidImmunizationIdempotencyKey("short")).toBe(false);

    const response = publicImmunizationError(503, "PERSISTENCE_UNAVAILABLE", "request-09-00");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
