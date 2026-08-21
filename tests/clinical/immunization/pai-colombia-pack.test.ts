import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paiColombiaPackSchema } from "../../../src/clinical/immunization/packs/pai-colombia-schema.ts";

describe("Colombia PAI pack boundary", () => {
  it("keeps the structural fixture non-actionable and blocked", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../fixtures/immunization/pai-colombia-structural.json", import.meta.url), "utf8"));
    expect(fixture.countryCode).toBe("CO");
    expect(fixture.containsActionableSchedule).toBe(false);
    expect(fixture.activation).toBe("blocked_pending_external_clinical_approval");
    expect(fixture.requiredRuleKinds).toEqual(expect.arrayContaining(["routine", "catch_up", "campaign", "review_only"]));
  });

  it("rejects a malformed package before compilation", () => {
    expect(() => paiColombiaPackSchema.parse({ packageId: "co", version: "2026.1", effectiveFrom: "2026-01-01", effectiveUntil: null, status: "candidate", approvalState: "blocked", sourceReferences: [], sourceDigest: "bad", rules: [], dependencies: [] })).toThrow();
  });

  it("rejects malformed rule and dependency values at the JSON trust boundary", () => {
    const sourceDigest = "a".repeat(64);
    const payload = {
      packageId: "co-pai-2026",
      version: "2026.1",
      effectiveFrom: "2026-01-01",
      effectiveUntil: null,
      status: "approved",
      approvalState: "approved",
      sourceReferences: [{ id: "co-source", uri: "https://www.minsalud.gov.co/pai.pdf", digest: sourceDigest }],
      sourceDigest,
      rules: [{
        id: "co-rule-1", code: "CO-RULE-1", countryCode: "CO", kind: "routine", seriesCode: "HEP_B", doseCode: "D1", doseNumber: 1,
        antigenCode: "HEP_B", minimumAge: { unit: "weeks", value: -1 }, targetAge: null, targetAgeUntil: null, minimumInterval: null,
        recommendedInterval: null, catchUp: true, eligibilityCriteria: {}, contraindicationReviewRequired: false, sourceReferenceIds: ["co-source"],
      }],
      dependencies: [{ ruleId: "co-rule-1", dependsOnRuleId: "co-rule-1", dependencyType: "previous_dose", minimumInterval: null }],
    };
    expect(() => paiColombiaPackSchema.parse(payload)).toThrow();
  });
});
