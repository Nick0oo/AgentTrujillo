import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../agent/lib/supabase/request-client.ts", () => ({
  createRequestSupabaseClient: vi.fn(),
}));
vi.mock("../../../src/persistence/supabase/anthropometry-repository.ts", () => ({
  createAnthropometryRepository: vi.fn(),
}));

import { createRequestSupabaseClient } from "../../../agent/lib/supabase/request-client.ts";
import { createAnthropometryRepository } from "../../../src/persistence/supabase/anthropometry-repository.ts";
import { createSupabaseAnthropometryPersistence } from "../../../src/channels/creciendo/anthropometry-persistence.ts";

const rpc = vi.fn();
const getConfirmed = vi.fn();

const actorUserId = "11111111-1111-4111-8111-111111111111";
const scope = {
  actorUserId,
  careSpaceId: "22222222-2222-4222-8222-222222222222",
  childId: "33333333-3333-4333-8333-333333333333",
  permissions: ["read", "record"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-09-01T11:00:00.000Z"),
  expiresAt: new Date("2026-09-01T12:00:00.000Z"),
} as never;

const auth = {
  requestId: "request-1",
  guardian: {
    userId: actorUserId,
    bearerToken: "local-token",
    issuedAt: new Date("2026-09-01T11:00:00.000Z"),
    expiresAt: new Date("2026-09-01T12:00:00.000Z"),
  },
} as never;

const request = {
  version: "creciendo.anthropometry.v1",
  measurement: {
    measurementType: "weight",
    value: "5.400",
    unit: "kg",
    occurredAt: "2026-09-01T12:00:00.000Z",
    measurementMethod: "digital_scale",
    provenanceType: "guardian",
    sourceNote: "DEV_ONLY local verification",
  },
  confirmed: true,
} as never;

describe("Creciendo anthropometry persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createRequestSupabaseClient).mockReturnValue({ rpc } as never);
    vi.mocked(createAnthropometryRepository).mockReturnValue({ getConfirmed } as never);
    rpc.mockResolvedValue({ data: [{ measurement_id: "44444444-4444-4444-8444-444444444444", outcome: "created" }], error: null });
    getConfirmed.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      measurementType: "weight",
      value: { normalized: { canonical: "5.400" }, normalizedUnit: "kg" },
      occurredAt: "2026-09-01T12:00:00.000Z",
      localDate: "2026-09-01",
      timeZone: "America/Bogota",
      measurementMethod: "digital_scale",
      provenanceType: "guardian",
      sourceNote: "DEV_ONLY local verification",
    });
  });

  it("builds the fingerprint and persists the confirmed measurement", async () => {
    const persistence = createSupabaseAnthropometryPersistence({
      config: { supabaseUrl: "http://127.0.0.1:54321", supabasePublishableKey: "local-publishable-key" } as never,
      auth,
    });

    const result = await persistence.create(
      scope,
      auth,
      request,
      "dev-only-growth-measurement-1",
      new Date("2026-09-01T11:30:00.000Z"),
      new AbortController().signal,
    );

    expect(result).toMatchObject({ outcome: "created", measurement: { value: "5.400", unit: "kg" } });
    expect(rpc).toHaveBeenCalledWith("record_confirmed_anthropometry_with_note", expect.objectContaining({
      p_input_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      p_source_note: "DEV_ONLY local verification",
    }));
    expect(getConfirmed).toHaveBeenCalledWith(scope, "44444444-4444-4444-8444-444444444444", "request-1", expect.any(AbortSignal));
  });
});
