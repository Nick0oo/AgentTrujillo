import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/channels/creciendo/growth-package-provider.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/channels/creciendo/growth-package-provider.ts")>(),
  isResolvedGrowthPackage: vi.fn(),
}));

import { isResolvedGrowthPackage } from "../../../src/channels/creciendo/growth-package-provider.ts";
import { buildGovernedGrowthSummary, type GovernedGrowthSummaryInput } from "../../../src/channels/creciendo/governed-growth-summary.ts";
import { getGrowthPackageArtifact } from "../../../src/clinical/anthropometry/packages/growth-package-artifacts.ts";
import { GROWTH_SUMMARY_RESPONSE_SCHEMA } from "../../../src/channels/creciendo/routes/anthropometry.ts";

function fixture(value: string): GovernedGrowthSummaryInput {
  return {
    package: { identity: getGrowthPackageArtifact("CO"), packId: "11111111-1111-4111-8111-111111111111" },
    child: { dateOfBirth: "2025-01-15", sexForGrowth: "male", countryOfCare: "CO", timeZone: "America/Bogota", gestationalAgeWeeks: 40, gestationalAgeDays: 0 },
    measurements: [{ id: "22222222-2222-4222-8222-222222222222", measurementType: "weight", value, unit: "kg", occurredAt: "2026-09-01T15:00:00.000Z", measurementMethod: "digital_scale" }],
    now: new Date("2026-09-01T16:00:00.000Z"),
  };
}

describe("governed growth summary citation integration", () => {
  beforeEach(() => { vi.mocked(isResolvedGrowthPackage).mockReturnValue(true); });

  it.each(["12.500", "9.000"])("retains a real engine point and valid citation for fixture %s", (value) => {
    const result = buildGovernedGrowthSummary(fixture(value));
    expect(result.status).toBe("ready");
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({ value, status: "calculated", provenance: { referenceCode: "growth-co-who-v1.WHO_2006" } });
    expect(result.points[0].provenance.citationHandle).toMatch(/^citation:v1:[a-f0-9]{64}$/u);
    expect(GROWTH_SUMMARY_RESPONSE_SCHEMA.safeParse({ ...result, version: "creciendo.growth-summary.v1", requestId: "fixture-summary" }).success).toBe(true);
    if (value === "9.000") expect(result.points[0].zScore).toMatch(/^-/u);
  });

  it("does not evaluate an untrusted package", () => {
    vi.mocked(isResolvedGrowthPackage).mockReturnValue(false);
    expect(buildGovernedGrowthSummary(fixture("12.500"))).toEqual({ status: "unavailable", code: "RULE_UNAVAILABLE", points: [] });
  });

  it("provides age coordinates and approved display copy without exposing authority or inventing reference bands", () => {
    const input = fixture("12.500");
    const result = buildGovernedGrowthSummary(input);
    if (result.status !== "ready") throw new Error("Fixture package unavailable");
    expect(result.chart?.currentAgeCompletedMonths).toBe(19);
    expect(result.chart?.observations).toEqual([{ measurementId: input.measurements[0].id, ageMonths: 594 / 30.4375, ageBasis: "chronological" }]);
    expect(result.chart?.copy).toEqual(input.package.identity.artifact.payload.copy);
    expect(result.chart).not.toHaveProperty("referenceSeries");
    expect(result.chart).not.toHaveProperty("childId");
  });

  it("does not use the CO package for a US child", () => {
    const input = fixture("12.500");
    expect(buildGovernedGrowthSummary({ ...input, child: { ...input.child, countryOfCare: "US" } })).toEqual({ status: "unavailable", code: "RULE_UNAVAILABLE", points: [] });
  });
});
