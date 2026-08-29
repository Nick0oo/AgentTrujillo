import { describe, expect, test, vi } from "vitest";

import { handleOnboarding, mapPersistenceError, type OnboardingPersistence } from "../../../src/channels/creciendo/routes/onboarding";
import type { SupabaseBearerToken } from "../../../agent/lib/supabase/types";

const auth = {
  requestId: "request-test-1",
  actorKey: "a".repeat(64),
  rateClass: "command" as const,
  profile: { locale: "es-CO" as const, timeZone: "America/Bogota", versionSha256: "b".repeat(64) },
  guardian: {
    userId: "00000000-0000-4000-8000-000000000010",
    issuedAt: new Date("2026-08-29T00:00:00Z"),
    expiresAt: new Date("2026-08-30T00:00:00Z"),
    bearerToken: "test-token" as SupabaseBearerToken,
  },
};

const body = {
  contractVersion: "onboarding.v1",
  idempotencyKey: "onboarding-test-1",
  careSpace: { name: "Familia de prueba" },
  child: {
    givenNames: "Infante de prueba",
    birthDate: "2024-04-12",
    referenceSex: "female",
    countryOfCare: "CO",
    timezone: "America/Bogota",
    isPremature: false,
    gestationalAgeWeeks: null,
    allergies: [],
  },
  guardianRelationship: "mother",
  privacyConsentAccepted: true,
};

function persistence(result: Awaited<ReturnType<OnboardingPersistence["createOrReplay"]>>): OnboardingPersistence {
  return { createOrReplay: vi.fn().mockResolvedValue(result) };
}

describe("Creciendo onboarding route", () => {
  test("rejects malformed or forged request fields before persistence", async () => {
    const store = persistence({ error: "SERVICE_UNAVAILABLE" });
    const response = await handleOnboarding(
      new Request("https://agent.test/creciendo/v1/onboarding", { method: "POST", body: JSON.stringify({ ...body, guardianId: "forged" }) }),
      auth,
      { persistence: store },
    );
    expect(response.status).toBe(400);
    expect(store.createOrReplay).not.toHaveBeenCalled();
  });

  test("returns only the validated backend projection", async () => {
    const store = persistence({
      outcome: "created",
      response: {
        contractVersion: "onboarding.v1",
        status: "created",
        careSpaceId: "00000000-0000-4000-8000-000000000001",
        childId: "00000000-0000-4000-8000-000000000002",
        resourceVersion: 1,
      },
    });
    const response = await handleOnboarding(
      new Request("https://agent.test/creciendo/v1/onboarding", { method: "POST", headers: { "Idempotency-Key": body.idempotencyKey }, body: JSON.stringify(body) }),
      auth,
      { persistence: store },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      contractVersion: "onboarding.v1",
      status: "created",
      careSpaceId: "00000000-0000-4000-8000-000000000001",
      childId: "00000000-0000-4000-8000-000000000002",
      resourceVersion: 1,
    });
  });

  test("maps missing consent or RPC availability to a safe retryable error", async () => {
    const response = await handleOnboarding(
      new Request("https://agent.test/creciendo/v1/onboarding", { method: "POST", body: JSON.stringify(body) }),
      auth,
      { persistence: persistence({ error: "SERVICE_UNAVAILABLE" }) },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ contractVersion: "onboarding.v1", status: "error", code: "SERVICE_UNAVAILABLE" });
  });

  test("maps RPC validation failures to a client-correctable request error", async () => {
    for (const message of ["onboarding_request_invalid", "new row violates check constraint children_birth_weight_grams_check"]) {
      expect(mapPersistenceError(message)).toBe("INVALID_REQUEST");
    }
  });
});
