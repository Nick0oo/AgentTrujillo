import { describe, expect, test, vi } from "vitest";

import { handleAddChild, type AddChildPersistence } from "../../../src/channels/creciendo/routes/add-child";
import type { SupabaseBearerToken } from "../../../agent/lib/supabase/types";

const auth = {
  requestId: "add-child-test", actorKey: "a".repeat(64), rateClass: "command" as const,
  profile: { locale: "es-CO" as const, timeZone: "America/Bogota", versionSha256: "b".repeat(64) },
  guardian: {
    userId: "00000000-0000-4000-8000-000000000010", issuedAt: new Date("2026-08-29T00:00:00Z"),
    expiresAt: new Date("2026-08-30T00:00:00Z"), bearerToken: "test-token" as SupabaseBearerToken,
  },
};

const body = {
  contractVersion: "add-child.v1", idempotencyKey: "sibling-1",
  careSpaceId: "00000000-0000-4000-8000-000000000001",
  child: {
    givenNames: "Ana", familyNames: null, preferredName: null, birthDate: "2024-04-12",
    timeOfBirth: null, birthTimeZone: null, referenceSex: "female", countryOfCare: "CO",
    timezone: "America/Bogota", isPremature: false, gestationalAgeWeeks: null,
    gestationalAgeDays: null, birthWeightGrams: null, allergies: [],
  },
  privacyConsentAccepted: true,
};

function persistence(result: Awaited<ReturnType<AddChildPersistence["createOrReplay"]>>): AddChildPersistence {
  return { createOrReplay: vi.fn().mockResolvedValue(result) };
}

describe("POST /creciendo/v1/children", () => {
  test("returns the validated created projection", async () => {
    const store = persistence({ outcome: "created", response: {
      contractVersion: "add-child.v1", status: "created", careSpaceId: body.careSpaceId,
      childId: "00000000-0000-4000-8000-000000000002", resourceVersion: 1,
    } });
    const response = await handleAddChild(
      new Request("https://agent.test/creciendo/v1/children", { method: "POST", body: JSON.stringify(body) }),
      auth,
      { persistence: store },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ contractVersion: "add-child.v1", status: "created" });
  });

  test("rejects malformed payloads before persistence", async () => {
    const store = persistence({ error: "SERVICE_UNAVAILABLE" });
    const response = await handleAddChild(
      new Request("https://agent.test/creciendo/v1/children", { method: "POST", body: JSON.stringify({ ...body, child: { ...body.child, timezone: "" } }) }),
      auth,
      { persistence: store },
    );
    expect(response.status).toBe(400);
    expect(store.createOrReplay).not.toHaveBeenCalled();
  });
});
