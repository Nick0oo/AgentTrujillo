import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acipUsPackSchema } from "../../../src/clinical/immunization/packs/acip-us-schema.ts";

describe("US ACIP pack boundary", () => {
  it("requires every official component and keeps the fixture non-actionable", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../fixtures/immunization/acip-us-structural.json", import.meta.url), "utf8"));
    expect(fixture.countryCode).toBe("US");
    expect(fixture.containsActionableSchedule).toBe(false);
    expect(fixture.requiredComponents).toEqual(expect.arrayContaining(["by_age", "catch_up", "medical_indication", "notes", "appendix", "addendum", "official_status"]));
  });

  it("rejects a malformed package before compilation", () => {
    expect(() => acipUsPackSchema.parse({ packageId: "us", version: "2026.1", effectiveFrom: "2026-01-01", effectiveUntil: null, status: "candidate", approvalState: "blocked", sourceReferences: [], sourceDigest: "bad", rules: [], dependencies: [] })).toThrow();
  });

  it("rejects an unbounded or unsupported ACIP interval at the JSON trust boundary", () => {
    const sourceDigest = "b".repeat(64);
    expect(() => acipUsPackSchema.parse({
      packageId: "us-acip-2025", version: "2025.07.02", effectiveFrom: "2025-07-02", effectiveUntil: null, status: "approved", approvalState: "approved",
      sourceReferences: [{ id: "us-source", uri: "https://www.cdc.gov/vaccines/schedule", digest: sourceDigest }], sourceDigest,
      rules: [{ id: "us-rule-1", code: "US-RULE-1", countryCode: "US", kind: "routine", seriesCode: "HEP_B", doseCode: "D1", doseNumber: 1, antigenCode: "HEP_B", minimumAge: { unit: "days", value: 1_000_001 }, targetAge: null, targetAgeUntil: null, minimumInterval: null, recommendedInterval: null, catchUp: true, eligibilityCriteria: {}, contraindicationReviewRequired: false, sourceReferenceIds: ["us-source"] }],
      dependencies: [], officialStatus: { state: "current", checkedAt: "2026-08-21T12:00:00.000Z", sourceReferenceIds: ["us-source"] },
    })).toThrow();
  });
});
