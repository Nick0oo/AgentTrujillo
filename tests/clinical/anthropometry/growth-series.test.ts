import { describe, expect, it } from "vitest";

import { buildGrowthSeries, decodeGrowthSeriesCursor, type RawGrowthSeriesRow } from "../../../src/clinical/anthropometry/growth-series.ts";

const scope = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["read"],
  countryOfCare: "CO",
  timezone: "UTC",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date("2026-12-31T00:00:00Z"),
} as never;

function row(overrides: Partial<RawGrowthSeriesRow> = {}): RawGrowthSeriesRow {
  return {
    measurementId: "00000000-0000-4000-8000-000000000010",
    assessmentId: "00000000-0000-4000-8000-000000000011",
    occurredAt: "2026-01-01T00:00:00.000Z",
    assessedAt: "2026-01-01T00:00:01.000Z",
    measurementType: "weight",
    measurementMethod: "digital_scale",
    validationStatus: "confirmed",
    supersededByMeasurementId: null,
    indicator: "weight_for_age",
    standardKey: "growth.who_2006",
    standardVersion: "1.0.0",
    datasetDigest: "a".repeat(64),
    ageBasis: "chronological",
    chronologicalAgeDays: 1,
    correctedAgeDays: null,
    resultStatus: "calculated",
    interpretation: "within_expected",
    zScore: "0",
    percentile: "50",
    warnings: [],
    transitionReason: null,
    ...overrides,
  };
}

describe("growth series", () => {
  it("segments standard and method transitions without smoothing", () => {
    const result = buildGrowthSeries([
      row(),
      row({ measurementId: "00000000-0000-4000-8000-000000000012", assessmentId: "00000000-0000-4000-8000-000000000013", occurredAt: "2026-02-01T00:00:00.000Z", assessedAt: "2026-02-01T00:00:01.000Z", standardKey: "growth.cdc_2000", measurementMethod: "mechanical_scale", transitionReason: "who_to_cdc" }),
    ], { scope, pageSize: 10 }, "series-test-secret-which-is-long-enough-123456");

    expect(result.points).toHaveLength(2);
    expect(result.segments).toHaveLength(2);
    expect(result.points[1].transition).toBe(true);
    expect(result.points[0].zScore).toBe("0");
  });

  it("hides excluded and superseded points and binds cursors to the filter", () => {
    const secret = "series-test-secret-which-is-long-enough-123456";
    const result = buildGrowthSeries([
      row(),
      row({ measurementId: "00000000-0000-4000-8000-000000000012", assessmentId: "00000000-0000-4000-8000-000000000013", resultStatus: "excluded" }),
      row({ measurementId: "00000000-0000-4000-8000-000000000014", assessmentId: "00000000-0000-4000-8000-000000000015", supersededByMeasurementId: "00000000-0000-4000-8000-000000000016" }),
    ], { scope, pageSize: 1 }, secret);

    expect(result.hasMore).toBe(false);
    expect(result.points).toHaveLength(1);
    expect(() => decodeGrowthSeriesCursor({ scope, indicator: "bmi_for_age", cursor: result.nextCursor ?? undefined }, result.nextCursor ?? "", secret)).toThrow("SERIES_CURSOR_INVALID");
  });
});
