import { describe, expect, it } from "vitest";

import { interpolateLms } from "../../../src/clinical/anthropometry/interpolation.ts";

const rows = [
  { coordinateValue: "0", l: "1", m: "10", s: "0.1" },
  { coordinateValue: "2", l: "3", m: "14", s: "0.3" },
] as const;

describe("LMS interpolation", () => {
  it("returns exact coefficients at a coordinate and linear coefficients between coordinates", () => {
    expect(interpolateLms(rows, 0)?.interpolated).toBe(false);
    expect(interpolateLms(rows, 1)).toMatchObject({ l: "2", m: "12", s: "0.2", interpolated: true });
  });

  it("returns unavailable outside the published coordinate range", () => {
    expect(interpolateLms(rows, -1)).toBeNull();
    expect(interpolateLms(rows, 3)).toBeNull();
  });
});
