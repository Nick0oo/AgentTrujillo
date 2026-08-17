import { describe, expect, it } from "vitest";

import { runImmunizationEval } from "../../../tests/evals/immunization.eval.ts";

describe("immunization synthetic fixture evaluation", () => {
  it("keeps CO and US suites independent and blocks unapproved clinical expectations", () => {
    const first = runImmunizationEval();
    const second = runImmunizationEval();
    expect(first).toEqual(second);
    expect(first.map((result) => result.country)).toEqual(["CO", "US"]);
    expect(first.every((result) => result.failed === 0 && result.crossCountryMixes === 0 && result.criticalDiscrepancies === 0)).toBe(true);
    expect(first.every((result) => result.blocked > 0)).toBe(true);
  });
});
