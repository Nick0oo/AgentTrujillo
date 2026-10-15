import { describe, expect, it } from "vitest";

import { buildDevOnlyGrowthSummary } from "../../../src/channels/creciendo/dev-only-growth-summary";

describe("DEV_ONLY growth summary", () => {
  it("evaluates an authorized synthetic measurement with the pinned WHO dataset", () => {
    const result = buildDevOnlyGrowthSummary({
      child: {
        dateOfBirth: "2025-01-15",
        sexForGrowth: "male",
        countryOfCare: "CO",
        timeZone: "America/Bogota",
      },
      measurements: [{
        id: "00000000-0000-4000-8000-000000000001",
        measurementType: "weight",
        value: "12.4",
        unit: "kg",
        occurredAt: "2026-09-01T15:00:00.000Z",
        measurementMethod: "digital_scale",
      }],
      now: new Date("2026-09-01T16:00:00.000Z"),
    });

    expect(result.status).toBe("ready");
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({
      measurementType: "weight",
      value: "12.4",
      unit: "kg",
      indicator: "weight_for_age",
      status: "calculated",
      ageBasis: "chronological",
      provenance: {
        standardKey: "growth.who_2006",
        standardVersion: "1.0.0",
      },
    });
  });

  it("returns no points when there are no confirmed local measurements", () => {
    const result = buildDevOnlyGrowthSummary({
      child: {
        dateOfBirth: "2025-01-15",
        sexForGrowth: "male",
        countryOfCare: "CO",
        timeZone: "America/Bogota",
      },
      measurements: [],
      now: new Date("2026-09-01T16:00:00.000Z"),
    });

    expect(result).toEqual({ status: "ready", code: null, points: [] });
  });

  it("evaluates a measurement five minutes before the current clock", () => {
    const now = new Date();
    const result = buildDevOnlyGrowthSummary({
      child: {
        dateOfBirth: "2025-01-15",
        sexForGrowth: "male",
        countryOfCare: "CO",
        timeZone: "America/Bogota",
      },
      measurements: [{
        id: "00000000-0000-4000-8000-000000000002",
        measurementType: "weight",
        value: "12.5",
        unit: "kg",
        occurredAt: new Date(now.getTime() - 5 * 60 * 1_000).toISOString(),
        measurementMethod: "digital_scale",
      }],
      now,
    });

    expect(result.points).toHaveLength(1);
    expect(result.points[0]?.status).toBe("calculated");
  });
});
