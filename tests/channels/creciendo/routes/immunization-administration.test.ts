import { describe, expect, it, vi } from "vitest";

import {
  handleImmunizationAdministration,
  type ImmunizationAdministrationCommand,
} from "../../../../src/channels/creciendo/routes/immunization-administration.ts";
import type { ImmunizationAdministrationResponse } from "../../../../src/channels/creciendo/immunization-contract.ts";

const childId = "00000000-0000-4000-8000-000000000011";
const careSpaceId = "00000000-0000-4000-8000-000000000010";
const guardianId = "00000000-0000-4000-8000-000000000001";
const idempotencyKey = `record_vaccine_administration:${"a".repeat(64)}`;
const auth = { requestId: "immunization-administration-test", profile: { locale: "es-CO", timeZone: "America/Bogota" }, guardian: { userId: guardianId } } as any;
const scope = { actorUserId: guardianId, careSpaceId, childId, permissions: ["record"], countryOfCare: "CO" as const, timezone: "America/Bogota", authorizationVersion: "m:1:a:1", issuedAt: new Date("2026-09-02T16:00:00.000Z"), expiresAt: new Date("2026-09-02T17:00:00.000Z") } as never;

function dependencies(command: ImmunizationAdministrationCommand) {
  return {
    tokens: { verify: vi.fn(async () => ({ careSpaceId, childId, authorizationVersion: "m:1:a:1" })) } as never,
    authorizeChild: { authorize: vi.fn(async () => scope) } as never,
    command,
    now: () => new Date("2026-09-02T16:00:00.000Z"),
  };
}

function request(overrides: Readonly<{ body?: unknown; key?: string | null }> = {}) {
  return new Request("https://agent.test/creciendo/v1/immunization/administrations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-child-context": "signed-context",
      ...(overrides.key === null ? {} : { "idempotency-key": overrides.key ?? idempotencyKey }),
    },
    body: JSON.stringify(overrides.body ?? {
      version: "creciendo.immunization.v1",
      administeredOn: "2026-09-02",
      productIdentifier: "CO-HEP-B",
      evidenceDraftId: "draft-1",
      confirmed: true,
    }),
  });
}

function result(outcome: "created" | "idempotent_replay" = "created"): ImmunizationAdministrationResponse {
  return {
    version: "creciendo.immunization.v1",
    requestId: auth.requestId,
    outcome,
    administeredOn: "2026-09-02",
    country: "CO",
    productCode: "CO-HEP-B",
    packageVersion: "2026.basic.1",
    algorithmId: "immunization-status-v1",
    assessments: [],
    sources: [{ label: "Ministerio de Salud", referenceCode: "PAI-2026", sourceDigest: "a".repeat(64) }],
  };
}

describe("POST /creciendo/v1/immunization/administrations", () => {
  it("requires child-scoped authorization and returns created or replayed results", async () => {
    const command: ImmunizationAdministrationCommand = { execute: vi.fn(async () => ({ response: result() })) };
    const response = await handleImmunizationAdministration(request(), auth, dependencies(command));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ outcome: "created", productCode: "CO-HEP-B" });
    expect(command.execute).toHaveBeenCalledWith(expect.objectContaining({ scope, idempotencyKey }));
  });

  it("returns a successful replay without creating a second administration", async () => {
    const command: ImmunizationAdministrationCommand = { execute: vi.fn(async () => ({ response: result("idempotent_replay") })) };
    const response = await handleImmunizationAdministration(request(), auth, dependencies(command));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "idempotent_replay" });
    expect(command.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects missing or malformed idempotency keys before the command", async () => {
    const command: ImmunizationAdministrationCommand = { execute: vi.fn() };
    const response = await handleImmunizationAdministration(request({ key: "bad-key" }), auth, dependencies(command));

    expect(response.status).toBe(400);
    expect(command.execute).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation", async () => {
    const command: ImmunizationAdministrationCommand = { execute: vi.fn() };
    const response = await handleImmunizationAdministration(request({ body: { confirmed: false } }), auth, dependencies(command));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ version: "creciendo.error.v1", code: "CONFIRMATION_INVALID" });
    expect(command.execute).not.toHaveBeenCalled();
  });

  it("rejects malformed declarations and revoked child scope before the command", async () => {
    const command: ImmunizationAdministrationCommand = { execute: vi.fn() };
    const malformed = await handleImmunizationAdministration(request({ body: { ...await request().json(), unexpected: true } }), auth, dependencies(command));
    expect(malformed.status).toBe(400);
    expect(command.execute).not.toHaveBeenCalled();

    const revoked = await handleImmunizationAdministration(
      request(),
      auth,
      {
        ...dependencies(command),
        authorizeChild: { authorize: vi.fn(async () => ({ ok: false, code: "ACCESS_DENIED", requestId: auth.requestId })) } as never,
      },
    );
    expect(revoked.status).toBe(403);
    expect(command.execute).not.toHaveBeenCalled();
  });

  it("maps idempotency conflicts and persistence failures without false success", async () => {
    const command: ImmunizationAdministrationCommand = { execute: vi.fn(async () => ({ code: "IDEMPOTENCY_CONFLICT" as const })) };
    const conflict = await handleImmunizationAdministration(request(), auth, dependencies(command));
    expect(conflict.status).toBe(409);

    const unavailable: ImmunizationAdministrationCommand = { execute: vi.fn(async () => ({ code: "PERSISTENCE_UNAVAILABLE" as const })) };
    const failed = await handleImmunizationAdministration(request(), auth, dependencies(unavailable));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ version: "creciendo.error.v1", code: "PERSISTENCE_UNAVAILABLE", retryable: true });
  });
});
