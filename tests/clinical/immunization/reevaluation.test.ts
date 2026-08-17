import { describe, expect, it } from "vitest";

import { reevaluateCountry } from "../../../src/clinical/immunization/reevaluation.ts";
import type { ImmunizationRule } from "../../../src/clinical/immunization/types.ts";

const rule: ImmunizationRule = {
  id: "rule-1" as never,
  code: "CO-HEP-B-1",
  countryCode: "CO",
  kind: "routine",
  seriesCode: "HEP_B",
  doseCode: "D1",
  doseNumber: 1,
  antigenId: "hep-b" as never,
  minimumAge: null,
  targetAge: null,
  targetAgeUntil: null,
  minimumInterval: null,
  recommendedInterval: null,
  catchUp: true,
  eligibilityCriteria: {},
  contraindicationReviewRequired: false,
  sourceReferences: ["synthetic"],
};

describe("country-change reevaluation", () => {
  it("recomputes append-only assessments deterministically without mixing packs", () => {
    const input = {
      childId: "child-1",
      careSpaceId: "space-1",
      fromCountry: "US" as const,
      toCountry: "CO" as const,
      asOfDate: "2026-08-16" as never,
      rulePack: { packageId: "co-pai", version: "2026.1", countryCode: "CO" as const, activation: "active" as const, sourceDigest: "a".repeat(64) as never },
      rules: [rule],
      confirmedAdministrations: [{ id: "admin-1" as never, administeredOn: "2026-08-01" as never, countryCode: "CO" as const, antigenIds: ["hep-b" as never] }],
      algorithmId: "immunization-status-v1",
      assessedAt: "2026-08-16T12:00:00.000Z",
    };
    const first = reevaluateCountry(input);
    const second = reevaluateCountry(input);
    expect(first).toEqual(second);
    expect(first.assessments[0].status).toBe("applied");
    expect(first.assessments[0].decisionDigest).toHaveLength(64);
    expect(first.assessments[0]).not.toHaveProperty("updatedAt");
  });

  it("requires review when a foreign fact would otherwise cross jurisdiction", () => {
    const result = reevaluateCountry({
      childId: "child-1", careSpaceId: "space-1", fromCountry: "CO", toCountry: "US", asOfDate: "2026-08-16" as never,
      rulePack: { packageId: "us-acip", version: "2026.1", countryCode: "US" as const, activation: "active" as const, sourceDigest: "b".repeat(64) as never },
      rules: [{ ...rule, countryCode: "US", code: "US-HEP-B-1" }],
      confirmedAdministrations: [{ id: "admin-1" as never, administeredOn: "2026-08-01" as never, countryCode: "CO" as const, antigenIds: ["hep-b" as never] }],
      algorithmId: "immunization-status-v1", assessedAt: "2026-08-16T12:00:00.000Z",
    });
    expect(result.assessments[0].status).toBe("review_required");
  });
});
