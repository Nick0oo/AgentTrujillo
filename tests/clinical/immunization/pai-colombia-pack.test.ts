import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paiColombiaPackSchema } from "../../../src/clinical/immunization/packs/pai-colombia-schema.ts";
import { compilePaiColombiaPack } from "../../../src/clinical/immunization/colombia-pai.ts";
import { computeRulePackSourceDigest } from "../../../src/clinical/immunization/rule-packs.ts";
import type { VaccineCatalog } from "../../../src/clinical/immunization/types.ts";

describe("Colombia PAI pack boundary", () => {
  it("validates and activates the source-bound basic 2026 package", () => {
    const raw = JSON.parse(readFileSync(new URL("../../../src/clinical/immunization/data/pai-colombia-basic-2026.json", import.meta.url), "utf8"));
    const pack = paiColombiaPackSchema.parse(raw);
    expect(pack.sourceDigest).toBe(computeRulePackSourceDigest(pack.sourceReferences));
    expect(new Set(pack.rules.map((rule) => rule.kind))).toEqual(new Set(["routine", "catch_up", "special_population", "campaign", "outbreak", "review_only"]));
    const antigens = [...new Set(pack.rules.map((rule) => rule.antigenCode))].map((antigenCode, index) => ({ id: `co-antigen-${index}` as never, antigenCode, displayName: antigenCode, diseaseGroup: antigenCode, active: true }));
    const catalog: VaccineCatalog = { version: "2026-basic", sourceDigest: "f".repeat(64) as never, antigens, products: [], productAntigens: [] };
    const compiled = compilePaiColombiaPack(pack as never, catalog);
    expect(compiled).toMatchObject({ ok: true, pack: { countryCode: "CO", activation: "active" } });
  });

  it("points the structural fixture at the exact active basic subset", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../fixtures/immunization/pai-colombia-structural.json", import.meta.url), "utf8"));
    expect(fixture.countryCode).toBe("CO");
    expect(fixture.containsActionableSchedule).toBe(true);
    expect(fixture.activation).toBe("active_exact_basic_subset");
    expect(fixture.approvalProvenance).toBe("product_owner_conveyed");
    expect(fixture.requiredRuleKinds).toEqual(expect.arrayContaining(["routine", "catch_up", "campaign", "review_only"]));
  });

  it("covers every routine booster shown through age five on the approved poster subset", () => {
    const raw = JSON.parse(readFileSync(new URL("../../../src/clinical/immunization/data/pai-colombia-basic-2026.json", import.meta.url), "utf8"));
    const codes = new Set(paiColombiaPackSchema.parse(raw).rules.map((rule) => rule.code));
    for (const code of [
      "CO-PAI-DIPHTHERIA-18M", "CO-PAI-TETANUS-18M", "CO-PAI-PERTUSSIS-18M",
      "CO-PAI-HIB-18M", "CO-PAI-HEPB-18M", "CO-PAI-IPV-18M",
      "CO-PAI-DIPHTHERIA-5Y", "CO-PAI-TETANUS-5Y", "CO-PAI-PERTUSSIS-5Y", "CO-PAI-IPV-5Y",
    ]) expect(codes.has(code)).toBe(true);
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
