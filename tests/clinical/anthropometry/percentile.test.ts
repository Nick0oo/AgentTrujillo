import { describe, expect, it } from "vitest";

import { calculatePercentile } from "../../../src/clinical/anthropometry/percentile.ts";

describe("normal percentile", () => {
  it("maps the median and one standard deviation to stable percentiles", () => {
    expect(calculatePercentile("0").percentile?.canonical).toBe("50");
    expect(Number(calculatePercentile("1").percentile?.canonical)).toBeCloseTo(84.1344746, 5);
  });

  it("clamps extreme tails and reports the precision limit", () => {
    const result = calculatePercentile("20");

    expect(result.status).toBe("calculated");
    expect(result.percentile?.canonical).toBe("100");
    expect(result.warnings).toContain("precision_limited");
  });
});
