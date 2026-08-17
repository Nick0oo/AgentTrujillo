import { describe, expect, it } from "vitest";

import { calculateLmsZScore } from "../../../src/clinical/anthropometry/z-score.ts";

describe("LMS z-score", () => {
  it("calculates the median as zero and preserves a versioned exact decimal", () => {
    const result = calculateLmsZScore({ measurement: "10", l: "1", m: "10", s: "0.1" });

    expect(result.status).toBe("calculated");
    expect(result.zScore?.canonical).toBe("0");
    expect(result.algorithmVersion).toBe("lms-zscore.v1");
  });

  it("uses the logarithmic LMS branch when L is zero", () => {
    const result = calculateLmsZScore({ measurement: "20", l: "0", m: "10", s: "0.5" });

    expect(result.status).toBe("calculated");
    expect(Number(result.zScore?.canonical)).toBeCloseTo(Math.log(2) / 0.5, 10);
  });

  it("does not produce a clinical number for invalid LMS inputs", () => {
    const result = calculateLmsZScore({ measurement: "10", l: "1", m: "0", s: "0.1" });

    expect(result.status).toBe("unavailable");
    expect(result.zScore).toBeNull();
    expect(result.warnings).toContain("numerical_instability");
  });
});
