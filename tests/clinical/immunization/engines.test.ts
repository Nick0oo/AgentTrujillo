import { describe, expect, it } from "vitest";

import type { ImmunizationRule, RuleDependency } from "../../../src/clinical/immunization/types.ts";
import { evaluateAdministrationValidity, evaluateMinimumAge, evaluateMinimumInterval } from "../../../src/clinical/immunization/minimum-interval.ts";
import { resolveSeriesDependencies, validateDependencyGraph } from "../../../src/clinical/immunization/dependencies.ts";
import { evaluateCatchUp } from "../../../src/clinical/immunization/catch-up.ts";
import { classifyDoseStatus } from "../../../src/clinical/immunization/status.ts";

const rule = (id: string, doseNumber = 1): ImmunizationRule => ({
  id: id as never,
  code: id,
  countryCode: "CO",
  kind: "routine",
  seriesCode: "HEP_B",
  doseCode: `D${doseNumber}`,
  doseNumber,
  antigenId: "hep-b" as never,
  minimumAge: doseNumber === 1 ? { unit: "days", value: 0 } : null,
  targetAge: null,
  targetAgeUntil: null,
  minimumInterval: doseNumber === 1 ? null : { unit: "days", value: 28 },
  recommendedInterval: null,
  catchUp: true,
  eligibilityCriteria: {},
  contraindicationReviewRequired: false,
  sourceReferences: ["synthetic"],
});

describe("immunization deterministic engines", () => {
  it("evaluates calendar minimum age and interval boundaries", () => {
    expect(evaluateMinimumAge("2026-01-31", { unit: "calendar_months", value: 1 }, "2026-02-28").valid).toBe(true);
    expect(evaluateMinimumAge("2026-01-31", { unit: "calendar_months", value: 1 }, "2026-02-27").valid).toBe(false);
    expect(evaluateMinimumInterval("2026-08-01", { unit: "days", value: 28 }, "2026-08-28").valid).toBe(false);
    expect(evaluateMinimumInterval("2026-08-01", { unit: "days", value: 28 }, "2026-08-29").valid).toBe(true);
    expect(evaluateAdministrationValidity(rule("r2", 2), [{ administeredOn: "2026-08-01", valid: true }], "2026-01-01", "2026-08-28").validity).toBe("invalid");
  });

  it("topologically validates dependencies and reviews either-or ambiguity", () => {
    const rules = [rule("r1"), rule("r2", 2), rule("r3", 2)];
    const dependencies: RuleDependency[] = [
      { ruleId: "r2" as never, dependsOnRuleId: "r1" as never, dependencyType: "previous_dose", minimumInterval: null },
      { ruleId: "r3" as never, dependsOnRuleId: "r1" as never, dependencyType: "either_or", minimumInterval: null },
    ];
    expect(validateDependencyGraph(rules, dependencies).ok).toBe(true);
    expect(resolveSeriesDependencies(rules, dependencies, [{ ruleId: "r1" as never, administrationId: "a1" as never }], "2026-08-16").find((result) => result.ruleId === "r2")?.satisfied).toBe(true);
    const ambiguous = resolveSeriesDependencies(rules, [{ ruleId: "r3" as never, dependsOnRuleId: "r1" as never, dependencyType: "either_or", minimumInterval: null }, { ruleId: "r3" as never, dependsOnRuleId: "r2" as never, dependencyType: "either_or", minimumInterval: null }], [{ ruleId: "r1" as never, administrationId: "a1" as never }, { ruleId: "r2" as never, administrationId: "a2" as never }], "2026-08-16").find((result) => result.ruleId === "r3");
    expect(ambiguous?.status).toBe("review_required");
  });

  it("does not restart catch-up from ambiguous history", () => {
    const result = evaluateCatchUp({ rule: rule("r2", 2), asOfDate: "2026-08-16", childBirthDate: "2026-01-01", administrations: [{ administeredOn: "2026-08-01", antigenIds: ["different" as never], validity: "valid" }] });
    expect(result.status).toBe("review_required");
    expect(result.reasonCode).toBe("PRODUCT_OR_ANTIGEN_HISTORY_AMBIGUOUS");
  });

  it("classifies status with an explicit stable precedence", () => {
    expect(classifyDoseStatus({ asOfDate: "2026-08-16", dueFrom: "2026-08-20", dueUntil: "2026-09-01", applied: false, notApplicable: false, unresolved: false, contradictory: false, reviewRequired: false }).status).toBe("upcoming");
    expect(classifyDoseStatus({ asOfDate: "2026-08-16", dueFrom: "2026-08-01", dueUntil: "2026-08-15", applied: false, notApplicable: false, unresolved: false, contradictory: false, reviewRequired: false }).status).toBe("overdue");
    expect(classifyDoseStatus({ asOfDate: "2026-08-16", dueFrom: null, dueUntil: null, applied: true, notApplicable: false, unresolved: true, contradictory: false, reviewRequired: false }).status).toBe("review_required");
  });
});
