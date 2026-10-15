import { describe, expect, it, vi } from "vitest";

import { handleDashboard, type DashboardResolver } from "../../../../src/channels/creciendo/routes/dashboard";

const childId = "00000000-0000-4000-8000-000000000011";
const careSpaceId = "00000000-0000-4000-8000-000000000010";
const guardianId = "00000000-0000-4000-8000-000000000001";
const auth = { requestId: "dashboard-test", guardian: { userId: guardianId } } as any;
const scope = { actorUserId: guardianId, careSpaceId, childId, permissions: ["read"], countryOfCare: "CO" as const, timezone: "America/Bogota", authorizationVersion: 1, expiresAt: new Date("2026-08-29T17:00:00.000Z") } as never;

function dependencies(resolver: DashboardResolver) {
  return {
    tokens: { verify: vi.fn(async () => scope) } as never,
    authorizeChild: { authorize: vi.fn(async () => scope) } as never,
    resolver,
    now: () => new Date("2026-08-29T16:00:00.000Z"),
  };
}

describe("GET /creciendo/v1/dashboard", () => {
  it("requires a signed child context and returns backend projection data", async () => {
    const resolver: DashboardResolver = { resolve: vi.fn(async () => ({
      childId,
      displayName: "A",
      birthDate: "2020-01-02",
      countryOfCare: "CO" as const,
      timeZone: "America/Bogota",
      lastWeightKg: null,
      lastHeightCm: null,
      measuredAt: null,
      pendingCount: 0,
      nextDueDate: null,
      activePlanCount: 0,
      recentObservationCount: 0,
      stageLabel: null,
    })) };
    const response = await handleDashboard(new Request("https://agent.test/creciendo/v1/dashboard", { headers: { "x-child-context": "signed-context" } }), auth, dependencies(resolver));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: "creciendo.dashboard.v1",
      scopeVersion: "authorized-child-scope.v1",
      child: { childId, displayName: "A" },
      growth: { lastWeightKg: null, lastHeightCm: null },
      nextActions: [],
    });
    expect(resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ childId, careSpaceId }));
  });

  it("denies requests without a child context", async () => {
    const resolver: DashboardResolver = { resolve: vi.fn() };
    const response = await handleDashboard(new Request("https://agent.test/creciendo/v1/dashboard"), auth, dependencies(resolver));
    expect(response.status).toBe(403);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});
