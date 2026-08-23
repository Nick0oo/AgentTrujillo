import { describe, expect, it } from "vitest";

import { calculateExtendedBmi } from "../../../src/clinical/anthropometry/extended-bmi.ts";

describe("CDC 2022 extended BMI", () => {
  it("matches the official 50.5-month example", () => {
    const result = calculateExtendedBmi({
      bmi: 22.6,
      ageMonths: 50.5,
      sex: "male",
      l: "-1.850468473",
      m: "15.58176458",
      s: "0.072306081",
    });

    expect(result.status).toBe("calculated");
    expect(result.p95).toBeCloseTo(17.8219, 4);
    expect(result.sigma).toBeCloseTo(2.3983, 4);
    expect(result.percentile).toBeCloseTo(99.7683, 4);
    expect(result.zScore).toBeCloseTo(2.83143, 4);
  });
});
