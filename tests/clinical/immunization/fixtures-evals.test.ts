import { describe, expect, it } from "vitest";

import { runImmunizationEval } from "../../../tests/evals/immunization.eval.ts";

describe("immunization approved basic package evaluation", () => {
  it("executes deterministic CO and US cases independently", () => {
    const first = runImmunizationEval();
    const second = runImmunizationEval();
    expect(first).toEqual(second);
    expect(first.map((result) => result.country)).toEqual(["CO", "US"]);
    expect(first.every((result) => result.failed === 0 && result.crossCountryMixes === 0 && result.criticalDiscrepancies === 0 && result.provenanceGaps === 0)).toBe(true);
    expect(first.every((result) => result.blocked === 0 && result.passed > 0)).toBe(true);
  });
});
