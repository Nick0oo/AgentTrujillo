import { describe, expect, it } from "vitest";

import {
  ANTHROPOMETRY_VERSION,
  GROWTH_SUMMARY_VERSION,
  handleAnthropometryCreate,
  handleAnthropometryList,
  handleGrowthSummary,
  type AnthropometryRouteDependencies,
} from "../../../../src/channels/creciendo/routes/anthropometry";
import type { AuthenticatedChannelRequest } from "../../../../src/channels/creciendo/auth-middleware";

const SCOPE = Object.freeze({
  actorUserId: "11111111-1111-4111-8111-111111111111" as never,
  careSpaceId: "22222222-2222-4222-8222-222222222222" as never,
  childId: "33333333-3333-4333-8333-333333333333" as never,
  permissions: ["read", "record"] as const,
  countryOfCare: "CO" as const,
  timezone: "America/Bogota",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-30T10:00:00.000Z"),
  expiresAt: new Date("2026-08-30T10:04:00.000Z"),
});

const AUTH = Object.freeze({
  requestId: "req-growth-1",
  actorKey: "actor",
  rateClass: "command" as const,
  profile: Object.freeze({ locale: "es-CO" as const, timeZone: "America/Bogota", versionSha256: "a".repeat(64) }),
  guardian: Object.freeze({
    userId: SCOPE.actorUserId,
    bearerToken: "token",
    issuedAt: new Date("2026-08-30T09:00:00.000Z"),
    expiresAt: new Date("2026-08-30T11:00:00.000Z"),
  }),
}) as unknown as AuthenticatedChannelRequest;

const MEASUREMENT = Object.freeze({
  id: "44444444-4444-4444-8444-444444444444",
  measurementType: "weight" as const,
  value: "5.400",
  unit: "kg" as const,
  occurredAt: "2026-08-30T09:30:00.000Z",
  localDate: "2026-08-30",
  timeZone: "America/Bogota",
  measurementMethod: "digital_scale" as const,
  provenanceType: "guardian" as const,
  sourceNote: "Control en casa" as const,
});

function deps(overrides: Partial<AnthropometryRouteDependencies> = {}): AnthropometryRouteDependencies {
  return {
    scope: { resolve: async () => SCOPE },
    persistence: {
      async create() { return { outcome: "created", measurement: MEASUREMENT }; },
      async list() { return [MEASUREMENT]; },
      async summary() { return { status: "unavailable", code: "RULE_UNAVAILABLE", points: [] }; },
    },
    now: () => new Date("2026-08-30T10:00:00.000Z"),
    ...overrides,
  };
}

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://agent.test${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const validBody = {
  version: ANTHROPOMETRY_VERSION,
  measurement: {
    measurementType: "weight",
    value: "5.400",
    unit: "kg",
    occurredAt: "2026-08-30T09:30:00.000Z",
    measurementMethod: "digital_scale",
    provenanceType: "guardian",
    sourceNote: "Control en casa",
  },
  confirmed: true,
};

describe("creciendo anthropometry routes", () => {
  it("exposes a bounded persistence diagnostic without changing the public error body", async () => {
    const dependencies = deps();
    const response = await handleAnthropometryCreate(
      request("POST", "/creciendo/v1/anthropometry", validBody, { "idempotency-key": "growth-diagnostic-1" }),
      AUTH,
      deps({ persistence: { ...dependencies.persistence, create: async () => ({ code: "PERSISTENCE_UNAVAILABLE", diagnosticCode: "42702" }) } }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("x-creciendo-persistence-code")).toBe("42702");
    const body = await response.json();
    expect(body.code).toBe("PERSISTENCE_UNAVAILABLE");
    expect(body).not.toHaveProperty("diagnosticCode");
  });

  it("persists a confirmed measurement and returns backend-owned data", async () => {
    const response = await handleAnthropometryCreate(
      request("POST", "/creciendo/v1/anthropometry", validBody, { "idempotency-key": "growth-1" }),
      AUTH,
      deps(),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      version: ANTHROPOMETRY_VERSION,
      outcome: "created",
      measurement: { id: MEASUREMENT.id, value: MEASUREMENT.value, unit: "kg", sourceNote: MEASUREMENT.sourceNote },
      assessment: { status: "rule_unavailable" },
    });
  });

  it("omits arbitrary persistence diagnostic text", async () => {
    const dependencies = deps();
    const response = await handleAnthropometryCreate(
      request("POST", "/creciendo/v1/anthropometry", validBody, { "idempotency-key": "growth-diagnostic-2" }),
      AUTH,
      deps({ persistence: { ...dependencies.persistence, create: async () => ({ code: "PERSISTENCE_UNAVAILABLE", diagnosticCode: "private row detail" }) } }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.has("x-creciendo-persistence-code")).toBe(false);
    expect(await response.text()).not.toContain("private row detail");
  });

  it("requires explicit confirmation and idempotency", async () => {
    const response = await handleAnthropometryCreate(
      request("POST", "/creciendo/v1/anthropometry", { ...validBody, confirmed: false }),
      AUTH,
      deps(),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("REQUEST_INVALID");
  });

  it("does not expose data without a child scope", async () => {
    const response = await handleAnthropometryList(
      request("GET", "/creciendo/v1/anthropometry"),
      AUTH,
      deps({ scope: { resolve: async () => null } }),
    );
    expect(response.status).toBe(403);
  });

  it("lists only the resolved child scope", async () => {
    let called = false;
    const response = await handleAnthropometryList(
      request("GET", "/creciendo/v1/anthropometry"),
      AUTH,
      deps({ persistence: { ...deps().persistence, async list(scope) { called = scope.childId === SCOPE.childId; return [MEASUREMENT]; } } }),
    );
    expect(response.status).toBe(200);
    expect(called).toBe(true);
    expect((await response.json()).measurements).toHaveLength(1);
  });

  it("returns an explicit unavailable result when no approved package exists", async () => {
    const response = await handleGrowthSummary(
      request("GET", "/creciendo/v1/anthropometry/growth"),
      AUTH,
      deps(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: GROWTH_SUMMARY_VERSION,
      requestId: AUTH.requestId,
      status: "unavailable",
      code: "RULE_UNAVAILABLE",
      points: [],
    });
  });

  it.each(["0.12", "-0.12"])("accepts a backend-owned ready summary with bounded provenance and Z-score %s", async (zScore) => {
    const response = await handleGrowthSummary(
      request("GET", "/creciendo/v1/anthropometry/growth"),
      AUTH,
      deps({
        persistence: {
          ...deps().persistence,
          async summary() {
            return {
              status: "ready" as const,
              code: null,
              points: [{
                occurredAt: "2026-08-30T09:30:00.000Z",
                measurementType: "weight" as const,
                value: "5.400",
                unit: "kg" as const,
                indicator: "weight_for_age" as const,
                ageBasis: "chronological" as const,
                ageDays: 180,
                status: "calculated" as const,
                zScore,
                percentile: "54.78",
                interpretation: "within_expected" as const,
                warnings: [],
                provenance: {
                  standardKey: "growth.who_2006",
                  standardVersion: "2006.1",
                  referenceCode: "WHO_CHILD_GROWTH",
                  citationHandle: "citation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                },
              }],
            };
          },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: GROWTH_SUMMARY_VERSION,
      status: "ready",
      code: null,
      points: [{ value: "5.400", zScore, percentile: "54.78" }],
    });
  });

  it("maps persistence failure without leaking its cause", async () => {
    const response = await handleAnthropometryCreate(
      request("POST", "/creciendo/v1/anthropometry", validBody, { "idempotency-key": "growth-1" }),
      AUTH,
      deps({ persistence: { ...deps().persistence, async create() { throw new Error("secret child payload"); } } }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret child payload");
  });
});
