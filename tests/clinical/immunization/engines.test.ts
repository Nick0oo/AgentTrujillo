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
    const invalidRule = rule("r2", 2);
    const invalid = evaluateAdministrationValidity(invalidRule, [{ administeredOn: "2026-08-01", validity: "valid", countryCode: "CO", antigenId: invalidRule.antigenId }], "2026-01-01", "2026-08-28");
    expect(invalid.validity).toBe("invalid");
    expect(invalid.sourceReferences).toEqual(["synthetic"]);
    expect(invalid.evidence).toMatchObject({ basis: "prior_administration", priorAdministrationOn: "2026-08-01", earliestEligibleOn: "2026-08-29", valid: false });
  });

  it("uses only package-provided grace and records when it was applied", () => {
    const graceRule = { ...rule("r2", 2), gracePeriod: { unit: "days" as const, value: 4 } };
    const history = [{ administeredOn: "2026-08-01", validity: "valid" as const, countryCode: "CO" as const, antigenId: graceRule.antigenId }];
    const withoutGrace = evaluateAdministrationValidity(graceRule, history, "2026-01-01", { administeredOn: "2026-08-25" });
    expect(withoutGrace.validity).toBe("invalid");
    const withGrace = evaluateAdministrationValidity(graceRule, history, "2026-01-01", { administeredOn: "2026-08-25", allowGrace: true });
    expect(withGrace).toMatchObject({ validity: "valid", reasonCode: "DOSE_VALID_WITH_GRACE", graceApplied: true, evidence: { graceApplied: true, valid: true } });
  });

  it("never credits a later dose without prior valid same-country same-antigen evidence", () => {
    const second = rule("r2", 2);
    expect(evaluateAdministrationValidity(second, [], "2026-01-01", "2026-08-29")).toMatchObject({ validity: "review_required", reasonCode: "PRIOR_VALID_DOSE_REQUIRED" });
    expect(evaluateAdministrationValidity(second, [{ administeredOn: "2026-08-01", validity: "valid", countryCode: "US", antigenId: second.antigenId }], "2026-01-01", "2026-08-29")).toMatchObject({ validity: "review_required", reasonCode: "CROSS_COUNTRY_HISTORY" });
    expect(evaluateAdministrationValidity(second, [{ administeredOn: "2026-08-01", validity: "valid", countryCode: "CO", antigenId: "other" as never }], "2026-01-01", "2026-08-29")).toMatchObject({ validity: "review_required", reasonCode: "PRIOR_VALID_DOSE_REQUIRED" });
  });

  it("topologically validates dependencies and reviews either-or ambiguity", () => {
    const rules = [rule("r1"), rule("r2", 2), rule("r3", 2)];
    const dependencies: RuleDependency[] = [
      { ruleId: "r2" as never, dependsOnRuleId: "r1" as never, dependencyType: "previous_dose", minimumInterval: null },
      { ruleId: "r3" as never, dependsOnRuleId: "r1" as never, dependencyType: "either_or", minimumInterval: null },
    ];
    expect(validateDependencyGraph(rules, dependencies).ok).toBe(true);
    expect(resolveSeriesDependencies(rules, dependencies, [{ ruleId: "r1" as never, administrationId: "a1" as never, administeredOn: "2026-07-01", countryCode: "CO" }], "2026-08-16").find((result) => result.ruleId === "r2")?.satisfied).toBe(true);
    const ambiguous = resolveSeriesDependencies(rules, [{ ruleId: "r3" as never, dependsOnRuleId: "r1" as never, dependencyType: "either_or", minimumInterval: null }, { ruleId: "r3" as never, dependsOnRuleId: "r2" as never, dependencyType: "either_or", minimumInterval: null }], [{ ruleId: "r1" as never, administrationId: "a1" as never, administeredOn: "2026-07-01", countryCode: "CO" }, { ruleId: "r2" as never, administrationId: "a2" as never, administeredOn: "2026-08-01", countryCode: "CO" }], "2026-08-16").find((result) => result.ruleId === "r3");
    expect(ambiguous?.status).toBe("review_required");
  });

  it("does not satisfy dependencies before their source-defined interval or from foreign evidence", () => {
    const rules = [rule("r1"), rule("r2", 2)];
    const dependencies: RuleDependency[] = [{ ruleId: "r2" as never, dependsOnRuleId: "r1" as never, dependencyType: "previous_dose", minimumInterval: { unit: "days", value: 28 } }];
    expect(resolveSeriesDependencies(rules, dependencies, [{ ruleId: "r1" as never, administrationId: "a1" as never, administeredOn: "2026-08-01", countryCode: "CO" }], "2026-08-28").find((result) => result.ruleId === "r2")).toMatchObject({ status: "unsatisfied", reasonCode: "DEPENDENCY_INTERVAL_NOT_MET" });
    expect(resolveSeriesDependencies(rules, dependencies, [{ ruleId: "r1" as never, administrationId: "a1" as never, administeredOn: "2026-07-01", countryCode: "US" }], "2026-08-28").find((result) => result.ruleId === "r2")).toMatchObject({ status: "review_required", reasonCode: "DEPENDENCY_COUNTRY_MISMATCH" });
  });

  it("reviews unevaluated conditional dependencies instead of advancing", () => {
    const rules = [rule("r1"), rule("r2", 2)];
    const dependencies: RuleDependency[] = [{ ruleId: "r2" as never, dependsOnRuleId: "r1" as never, dependencyType: "conditional", minimumInterval: null }];
    expect(resolveSeriesDependencies(rules, dependencies, [{ ruleId: "r1" as never, administrationId: "a1" as never, administeredOn: "2026-07-01", countryCode: "CO" }], "2026-08-28").find((result) => result.ruleId === "r2")).toMatchObject({ status: "review_required", reasonCode: "CONDITIONAL_DEPENDENCY_REQUIRES_REVIEW" });
  });

  it("does not restart catch-up from ambiguous history", () => {
    const result = evaluateCatchUp({ rule: rule("r2", 2), asOfDate: "2026-08-16", childBirthDate: "2026-01-01", administrations: [{ administeredOn: "2026-08-01", antigenIds: [rule("r2", 2).antigenId], countryCode: "CO", productResolution: "ambiguous", validity: "valid" }] });
    expect(result.status).toBe("review_required");
    expect(result.reasonCode).toBe("PRODUCT_OR_ANTIGEN_HISTORY_AMBIGUOUS");
  });

  it("ignores unrelated antigens in catch-up and reviews only cross-country matching evidence", () => {
    const target = rule("r1");
    expect(evaluateCatchUp({ rule: target, asOfDate: "2026-08-16", childBirthDate: "2026-01-01", administrations: [{ administeredOn: "2026-08-01", antigenIds: ["other" as never], countryCode: "CO", validity: "valid" }] })).toMatchObject({ status: "eligible", nextDoseNumber: 1 });
    expect(evaluateCatchUp({ rule: target, asOfDate: "2026-08-16", childBirthDate: "2026-01-01", administrations: [{ administeredOn: "2026-08-01", antigenIds: [target.antigenId], countryCode: "US", validity: "valid" }] })).toMatchObject({ status: "review_required", reasonCode: "CROSS_COUNTRY_HISTORY" });
  });

  it("enforces trusted date and age boundaries for catch-up eligibility", () => {
    const target = { ...rule("r1"), minimumAge: { unit: "calendar_months" as const, value: 2 }, targetAge: { unit: "calendar_months" as const, value: 2 }, targetAgeUntil: { unit: "calendar_months" as const, value: 12 } };
    expect(evaluateCatchUp({ rule: target, childBirthDate: "2026-01-31", asOfDate: "2026-03-30", administrations: [] })).toMatchObject({ status: "not_applicable", reasonCode: "MINIMUM_AGE_NOT_REACHED" });
    expect(evaluateCatchUp({ rule: target, childBirthDate: "2026-01-31", asOfDate: "2027-02-01", administrations: [] })).toMatchObject({ status: "not_applicable", reasonCode: "CATCH_UP_AGE_WINDOW_EXPIRED" });
    expect(evaluateCatchUp({ rule: target, childBirthDate: "invalid", asOfDate: "2026-03-31", administrations: [] })).toMatchObject({ status: "review_required", reasonCode: "TRUSTED_DATE_CONTEXT_INVALID" });
  });

  it("classifies status with an explicit stable precedence", () => {
    expect(classifyDoseStatus({ asOfDate: "2026-08-16", dueFrom: "2026-08-20", dueUntil: "2026-09-01", applied: false, notApplicable: false, unresolved: false, contradictory: false, reviewRequired: false }).status).toBe("upcoming");
    expect(classifyDoseStatus({ asOfDate: "2026-08-16", dueFrom: "2026-08-01", dueUntil: "2026-08-15", applied: false, notApplicable: false, unresolved: false, contradictory: false, reviewRequired: false }).status).toBe("overdue");
    expect(classifyDoseStatus({ asOfDate: "2026-08-16", dueFrom: null, dueUntil: null, applied: true, notApplicable: false, unresolved: true, contradictory: false, reviewRequired: false }).status).toBe("review_required");
  });
});
