import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../agent/lib/supabase/request-client.ts", () => ({
  createRequestSupabaseClient: vi.fn(),
}));
vi.mock("../../../src/persistence/supabase/anthropometry-repository.ts", () => ({
  createAnthropometryRepository: vi.fn(),
}));
vi.mock("../../../src/channels/creciendo/growth-package-provider.ts", () => ({
  createGrowthPackageProvider: vi.fn(),
}));
vi.mock("../../../src/channels/creciendo/governed-growth-summary.ts", () => ({
  buildGovernedGrowthSummary: vi.fn(),
}));

import { createRequestSupabaseClient } from "../../../agent/lib/supabase/request-client.ts";
import { createAnthropometryRepository } from "../../../src/persistence/supabase/anthropometry-repository.ts";
import { createSupabaseAnthropometryPersistence } from "../../../src/channels/creciendo/anthropometry-persistence.ts";
import { createGrowthPackageProvider } from "../../../src/channels/creciendo/growth-package-provider.ts";
import { buildGovernedGrowthSummary } from "../../../src/channels/creciendo/governed-growth-summary.ts";
import type { AnthropometryCreateRequest } from "../../../src/channels/creciendo/routes/anthropometry.ts";

const rpc = vi.fn();
const getConfirmed = vi.fn();
const from = vi.fn();
const historicalRow = {
  id: "44444444-4444-4444-8444-444444444444",
  care_space_id: "22222222-2222-4222-8222-222222222222",
  child_id: "33333333-3333-4333-8333-333333333333",
  measurement_type: "weight", normalized_value_lexeme: null,
  legacy_normalized_value: "5.400", input_fingerprint: null,
  normalized_unit: "kg", occurred_at: "2026-09-01T12:00:00.000Z",
  local_date: "2026-09-01", time_zone: "America/Bogota",
  measurement_method: null, provenance_type: "guardian", validation_status: "confirmed",
};

function queryResult(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  };
  return query;
}

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
} as const satisfies AnthropometryCreateRequest;

describe("Creciendo anthropometry persistence", () => {
  it("retains only a bounded database error code for safe failure diagnosis", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42702", message: "private row detail must not be exported" } });
    const persistence = createSupabaseAnthropometryPersistence({ config: { supabaseUrl: "http://127.0.0.1:54321", supabasePublishableKey: "local-publishable-key" } as never, auth });
    const result = await persistence.create(scope, auth, request, "growth-diagnostic-1", new Date("2026-09-01T11:30:00.000Z"), new AbortController().signal);
    expect(result).toEqual({ code: "PERSISTENCE_UNAVAILABLE", diagnosticCode: "42702" });
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-01T11:30:00.000Z"));
    vi.clearAllMocks();
    vi.mocked(createRequestSupabaseClient).mockReturnValue({ rpc, from } as never);
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

  afterEach(() => { vi.useRealTimers(); });

  it("uses the existing atomic RPC when no source note was supplied", async () => {
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    const noNoteRequest = { ...request, measurement: { ...request.measurement, sourceNote: undefined } };
    const result = await persistence.create(scope, auth, noNoteRequest, "growth-no-note", new Date("2026-09-01T11:30:00.000Z"), new AbortController().signal);
    expect(result).toMatchObject({ outcome: "created" });
    expect(rpc).toHaveBeenCalledWith("record_confirmed_anthropometry", expect.objectContaining({
      p_child_id: historicalRow.child_id, p_care_space_id: historicalRow.care_space_id,
      p_idempotency_key: "growth-no-note", p_assessments: [],
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_source_note");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not drop an explicit note when the note RPC is unavailable", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Function not found" } });
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    expect(await persistence.create(scope, auth, request, "growth-with-note", new Date("2026-09-01T11:30:00.000Z"), new AbortController().signal))
      .toEqual({ code: "PERSISTENCE_UNAVAILABLE", diagnosticCode: "PGRST202" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("record_confirmed_anthropometry_with_note");
  });

  it("returns confirmed historical facts without manufacturing command fingerprints", async () => {
    const query = queryResult([historicalRow]);
    from.mockReturnValueOnce(query);
    getConfirmed.mockResolvedValue(null);
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    const result = await persistence.list(scope, auth, { cursor: null }, new AbortController().signal);
    expect(result).toEqual([{
      id: historicalRow.id, measurementType: "weight", value: "5.400", unit: "kg",
      occurredAt: historicalRow.occurred_at, localDate: historicalRow.local_date, timeZone: historicalRow.time_zone,
      measurementMethod: "unknown", provenanceType: "guardian", sourceNote: null,
    }]);
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("normalized_value::text"));
    expect(query.eq.mock.calls).toEqual([
      ["care_space_id", historicalRow.care_space_id], ["child_id", historicalRow.child_id], ["validation_status", "confirmed"],
    ]);
    expect(getConfirmed).not.toHaveBeenCalled();
  });

  it("prefers the exact modern decimal lexeme over the rounded legacy column", async () => {
    from.mockReturnValueOnce(queryResult([{ ...historicalRow, normalized_value_lexeme: "5.400125", source_note: "Fixture note", measurement_method: "digital_scale" }]));
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    expect(await persistence.list(scope, auth, { cursor: null }, new AbortController().signal))
      .toMatchObject([{ value: "5.400125", sourceNote: "Fixture note", measurementMethod: "digital_scale" }]);
  });

  it.each([
    { child_id: "55555555-5555-4555-8555-555555555555" },
    { care_space_id: "55555555-5555-4555-8555-555555555555" },
    { validation_status: "pending" },
    { legacy_normalized_value: null },
  ])("fails the history request rather than reporting an empty history for an invalid row %o", async (invalid) => {
    from.mockReturnValueOnce(queryResult([{ ...historicalRow, ...invalid }]));
    getConfirmed.mockResolvedValue(null);
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    expect(await persistence.list(scope, auth, { cursor: null }, new AbortController().signal)).toBeNull();
  });

  it("feeds historical facts into the existing governed summary after package resolution", async () => {
    const approvedPackage = {};
    const resolve = vi.fn().mockResolvedValue(approvedPackage);
    vi.mocked(createGrowthPackageProvider).mockReturnValue({ resolve } as never);
    vi.mocked(buildGovernedGrowthSummary).mockReturnValue({ status: "ready", code: null, points: [] });
    from.mockReturnValueOnce(queryResult({ date_of_birth: "2026-01-01", sex_for_growth: "male", country_of_care: "CO", time_zone: "America/Bogota" }));
    from.mockReturnValueOnce(queryResult([historicalRow]));
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    await persistence.summary(scope, auth, new AbortController().signal);
    expect(buildGovernedGrowthSummary).toHaveBeenCalledWith(expect.objectContaining({
      package: approvedPackage,
      measurements: [{ id: historicalRow.id, measurementType: "weight", value: "5.400", unit: "kg", occurredAt: historicalRow.occurred_at, measurementMethod: "unknown" }],
    }));
  });

  it("does not evaluate historical measurements without a governed package", async () => {
    vi.mocked(createGrowthPackageProvider).mockReturnValue({ resolve: vi.fn().mockResolvedValue(null) } as never);
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    expect(await persistence.summary(scope, auth, new AbortController().signal)).toEqual({ status: "unavailable", code: "RULE_UNAVAILABLE", points: [] });
    expect(buildGovernedGrowthSummary).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("does not query or return historical facts when the scope lacks read permission", async () => {
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    const recordOnlyScope = { ...(scope as object), permissions: ["record"] } as never;
    expect(await persistence.list(recordOnlyScope, auth, { cursor: null }, new AbortController().signal)).toBeNull();
    expect(await persistence.summary(recordOnlyScope, auth, new AbortController().signal)).toEqual({ status: "unavailable", code: "RULE_UNAVAILABLE", points: [] });
    expect(from).not.toHaveBeenCalled();
    expect(createGrowthPackageProvider).not.toHaveBeenCalled();
  });

  it("rejects historical results if the authorized scope expires during the query", async () => {
    const query = queryResult([historicalRow]);
    query.then = (resolve) => {
      vi.setSystemTime(new Date("2026-09-01T12:01:00.000Z"));
      return Promise.resolve({ data: [historicalRow], error: null }).then(resolve);
    };
    from.mockReturnValueOnce(query);
    const persistence = createSupabaseAnthropometryPersistence({ config: {} as never, auth });
    expect(await persistence.list(scope, auth, { cursor: null }, new AbortController().signal)).toBeNull();
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
