import { describe, expect, it, vi } from "vitest";

import {
  handleImmunizationStatus,
  type ImmunizationStatusResolver,
} from "../../../../src/channels/creciendo/routes/immunization-status.ts";

const childId = "00000000-0000-4000-8000-000000000011";
const careSpaceId = "00000000-0000-4000-8000-000000000010";
const guardianId = "00000000-0000-4000-8000-000000000001";
const auth = { requestId: "immunization-status-test", profile: { locale: "es-CO", timeZone: "America/Bogota" }, guardian: { userId: guardianId } } as any;
const scope = { actorUserId: guardianId, careSpaceId, childId, permissions: ["read"], countryOfCare: "CO" as const, timezone: "America/Bogota", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-09-02T16:00:00.000Z"), expiresAt: new Date("2026-09-02T17:00:00.000Z") } as never;

function dependencies(resolver: ImmunizationStatusResolver) {
  return {
    tokens: { verify: vi.fn(async () => scope) } as never,
    authorizeChild: { authorize: vi.fn(async () => scope) } as never,
    resolver,
    now: () => new Date("2026-09-02T16:00:00.000Z"),
  };
}

function evaluation() {
  return {
    evidenceState: "confirmed_only" as const,
    package: {
      country: "CO" as const,
      packageId: "pai-colombia-basic-2026",
      packageVersion: "2026.basic.1",
      releaseStatus: "active" as const,
      algorithmId: "immunization-status-v1",
      sourceReferences: [{ label: "Ministerio de Salud", referenceCode: "PAI-2026", sourceDigest: "a".repeat(64) }],
    },
    assessments: [{
      ruleCode: "PAI_BCG_1",
      seriesCode: "BCG",
      doseCode: "BCG-1",
      doseNumber: 1,
      status: "applied" as const,
      reasonCode: "ADMINISTRATION_CONFIRMED",
      dueFrom: null,
      dueUntil: "2026-09-02",
      matchedAdministrationIds: ["administration-1"],
      sourceReferences: [{ label: "Ministerio de Salud", referenceCode: "PAI-2026", sourceDigest: "a".repeat(64) }],
    }],
  };
}

describe("GET /creciendo/v1/immunization/status", () => {
  it("reauthorizes the child context and returns the public projection", async () => {
    const resolver: ImmunizationStatusResolver = { evaluate: vi.fn(async () => evaluation()) };
    const response = await handleImmunizationStatus(
      new Request("https://agent.test/creciendo/v1/immunization/status", { headers: { "x-child-context": "signed-context" } }),
      auth,
      dependencies(resolver),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      version: "creciendo.immunization.v1",
      status: "ready",
      childId,
      careSpaceId,
      country: "CO",
      asOfDate: "2026-09-02",
    });
    expect(JSON.stringify(body)).not.toContain("administration-1");
    expect(resolver.evaluate).toHaveBeenCalledWith(expect.objectContaining({ childId, careSpaceId, asOfDate: "2026-09-02" }));
  });

  it("denies requests without a signed child context before evaluating", async () => {
    const resolver: ImmunizationStatusResolver = { evaluate: vi.fn() };
    const response = await handleImmunizationStatus(new Request("https://agent.test/creciendo/v1/immunization/status"), auth, dependencies(resolver));

    expect(response.status).toBe(403);
    expect(resolver.evaluate).not.toHaveBeenCalled();
  });

  it("returns an explicit unavailable state when the approved package is unavailable", async () => {
    const resolver: ImmunizationStatusResolver = { evaluate: vi.fn(async () => null) };
    const response = await handleImmunizationStatus(
      new Request("https://agent.test/creciendo/v1/immunization/status", { headers: { "x-child-context": "signed-context" } }),
      auth,
      dependencies(resolver),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "unavailable", code: "RULE_UNAVAILABLE", package: null, assessments: [] });
  });

  it("fails closed when the evaluation country differs from the authorized child", async () => {
    const resolver: ImmunizationStatusResolver = { evaluate: vi.fn(async () => ({ ...evaluation(), package: { ...evaluation().package, country: "US" as const } })) };
    const response = await handleImmunizationStatus(
      new Request("https://agent.test/creciendo/v1/immunization/status", { headers: { "x-child-context": "signed-context" } }),
      auth,
      dependencies(resolver),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ version: "creciendo.error.v1", code: "PERSISTENCE_UNAVAILABLE", retryable: true });
  });
});
