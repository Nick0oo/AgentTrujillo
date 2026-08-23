import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acipUsPackSchema } from "../../../src/clinical/immunization/packs/acip-us-schema.ts";
import { compileAcipUsPack } from "../../../src/clinical/immunization/us-acip.ts";
import { computeRulePackSourceDigest } from "../../../src/clinical/immunization/rule-packs.ts";
import type { VaccineCatalog } from "../../../src/clinical/immunization/types.ts";

describe("US ACIP pack boundary", () => {
  it("validates and activates the current conservative 2025 package", () => {
    const raw = JSON.parse(readFileSync(new URL("../../../src/clinical/immunization/data/acip-us-basic-2025.json", import.meta.url), "utf8"));
    const pack = acipUsPackSchema.parse(raw);
    expect(pack.sourceDigest).toBe(computeRulePackSourceDigest(pack.sourceReferences));
    expect(pack.officialStatus.state).toBe("current");
    const antigens = [...new Set(pack.rules.map((rule) => rule.antigenCode))].map((antigenCode, index) => ({ id: `us-antigen-${index}` as never, antigenCode, displayName: antigenCode, diseaseGroup: antigenCode, active: true }));
    const catalog: VaccineCatalog = { version: "2025-basic", sourceDigest: "f".repeat(64) as never, antigens, products: [], productAntigens: [] };
    const compiled = compileAcipUsPack(pack as never, catalog);
    expect(compiled).toMatchObject({ ok: true, pack: { countryCode: "US", activation: "active" } });
  });

  it("requires every official component and points to the exact active basic subset", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../fixtures/immunization/acip-us-structural.json", import.meta.url), "utf8"));
    expect(fixture.countryCode).toBe("US");
    expect(fixture.containsActionableSchedule).toBe(true);
    expect(fixture.activation).toBe("active_exact_basic_subset");
    expect(fixture.approvalProvenance).toBe("product_owner_conveyed");
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
