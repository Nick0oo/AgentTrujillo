import { describe, expect, it } from "vitest";

import {
  resolveAntigen,
  resolveVaccineProduct,
} from "../../../src/clinical/immunization/registry.ts";
import {
  compilePaiColombiaPack,
  type PaiColombiaPackageInput,
} from "../../../src/clinical/immunization/colombia-pai.ts";
import {
  compileAcipUsPack,
  type AcipUsPackageInput,
} from "../../../src/clinical/immunization/us-acip.ts";
import type { VaccineCatalog } from "../../../src/clinical/immunization/types.ts";

const digest = "a".repeat(64) as VaccineCatalog["sourceDigest"];
const catalog: VaccineCatalog = {
  version: "catalog-2026-01",
  sourceDigest: digest,
  antigens: [
    { id: "antigen-hep-b" as never, antigenCode: "HEP_B", displayName: "Hepatitis B", diseaseGroup: "hepatitis-b", active: true },
  ],
  products: [
    { id: "product-reg" as never, productCode: "CO-REG", countryCode: "CO", manufacturer: "Synthetic", brandName: "Regulated", presentation: "dose", regulatoryIdentifier: "REG-001", aliases: ["regulated"], effectiveFrom: "2020-01-01" as never, effectiveUntil: null, active: true },
    { id: "product-code" as never, productCode: "CO-CODE", countryCode: "CO", manufacturer: "Synthetic", brandName: "Code", presentation: "dose", regulatoryIdentifier: null, aliases: ["same alias"], effectiveFrom: "2020-01-01" as never, effectiveUntil: null, active: true },
    { id: "product-retired" as never, productCode: "CO-OLD", countryCode: "CO", manufacturer: "Synthetic", brandName: "Old", presentation: "dose", regulatoryIdentifier: null, aliases: ["old"], effectiveFrom: "2020-01-01" as never, effectiveUntil: "2025-01-01" as never, active: false },
  ],
  productAntigens: [{ productId: "product-reg" as never, antigenId: "antigen-hep-b" as never }],
};

const coInput: PaiColombiaPackageInput = {
  packageId: "co-pai-synthetic",
  version: "2026.1.0",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  status: "candidate",
  approvalState: "blocked",
  sourceReferences: [{ id: "co-source", uri: "https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/PP/PAI/lineamientos-gestion-administracion-pai-2026.pdf", digest }],
  sourceDigest: digest,
  rules: [{ id: "co-hep-b-1", code: "CO-HEP-B-1", countryCode: "CO", kind: "routine", seriesCode: "HEP_B", doseCode: "D1", doseNumber: 1, antigenCode: "HEP_B", minimumAge: null, targetAge: null, targetAgeUntil: null, minimumInterval: null, recommendedInterval: null, catchUp: true, eligibilityCriteria: {}, contraindicationReviewRequired: false, sourceReferenceIds: ["co-source"] }],
  dependencies: [],
};

const usInput: AcipUsPackageInput = {
  packageId: "us-acip-synthetic",
  version: "2026.1.0",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  status: "candidate",
  approvalState: "blocked",
  sourceReferences: [{ id: "us-source", uri: "https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-notes.html", digest }],
  sourceDigest: digest,
  rules: [{ id: "us-hep-b-1", code: "US-HEP-B-1", countryCode: "US", kind: "routine", seriesCode: "HEP_B", doseCode: "D1", doseNumber: 1, antigenCode: "HEP_B", minimumAge: null, targetAge: null, targetAgeUntil: null, minimumInterval: null, recommendedInterval: null, catchUp: true, eligibilityCriteria: {}, contraindicationReviewRequired: false, sourceReferenceIds: ["us-source"] }],
  dependencies: [],
};

describe("immunization registry and jurisdiction packs", () => {
  it("uses regulatory id before country product code and alias", () => {
    const result = resolveVaccineProduct({ regulatoryIdentifier: "REG-001", productCode: "CO-CODE", alias: "same alias" }, catalog, "CO", "2026-08-16");
    expect(result.outcome).toBe("resolved");
    expect(result.product?.id).toBe("product-reg");
  });

  it("never fuzzes and reports ambiguity/retirement/country mismatch", () => {
    expect(resolveVaccineProduct({ alias: "Regulated extra" }, catalog, "CO", "2026-08-16").outcome).toBe("unknown");
    expect(resolveVaccineProduct({ productCode: "CO-OLD" }, catalog, "CO", "2026-08-16").outcome).toBe("retired");
    expect(resolveVaccineProduct({ productCode: "CO-CODE" }, catalog, "US", "2026-08-16").outcome).toBe("jurisdiction_mismatch");
    expect(resolveAntigen("HEP_B", catalog).outcome).toBe("resolved");
    expect(resolveAntigen("HEP-B", catalog).outcome).toBe("review_required");
  });

  it("compiles isolated CO and US packs and blocks unapproved activation", () => {
    const co = compilePaiColombiaPack(coInput, catalog);
    const us = compileAcipUsPack(usInput, catalog);
    expect(co.ok).toBe(true);
    expect(co.ok && co.pack.activation).toBe("blocked");
    expect(us.ok).toBe(true);
    expect(us.ok && us.pack.countryCode).toBe("US");
  });

  it("rejects cross-country rules", () => {
    expect(compilePaiColombiaPack({ ...coInput, rules: [{ ...coInput.rules[0], countryCode: "US" }] }, catalog).ok).toBe(false);
    expect(compileAcipUsPack({ ...usInput, rules: [{ ...usInput.rules[0], countryCode: "CO" }] }, catalog).ok).toBe(false);
  });

  it("rejects cyclic rule dependencies before activation", () => {
    const second = { ...coInput.rules[0], id: "co-hep-b-2", code: "CO-HEP-B-2", doseCode: "D2", doseNumber: 2 };
    const result = compilePaiColombiaPack({
      ...coInput,
      rules: [coInput.rules[0], second],
      dependencies: [
        { ruleId: "co-hep-b-1" as never, dependsOnRuleId: "co-hep-b-2" as never, dependencyType: "previous_dose", minimumInterval: null },
        { ruleId: "co-hep-b-2" as never, dependsOnRuleId: "co-hep-b-1" as never, dependencyType: "previous_dose", minimumInterval: null },
      ],
    }, catalog);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid windows, missing provenance, cross-country sources, and routine/campaign collisions", () => {
    expect(compilePaiColombiaPack({ ...coInput, effectiveUntil: "2025-12-31" }, catalog).ok).toBe(false);
    expect(compilePaiColombiaPack({ ...coInput, rules: [{ ...coInput.rules[0], sourceReferenceIds: [] }] }, catalog).ok).toBe(false);
    expect(compilePaiColombiaPack({ ...coInput, sourceReferences: [{ ...coInput.sourceReferences[0], uri: "https://www.cdc.gov/vaccines/schedules/" }] }, catalog).ok).toBe(false);
    const campaign = { ...coInput.rules[0], id: "co-hep-b-campaign", code: "CO-HEP-B-CAMPAIGN", kind: "campaign" as const };
    expect(compilePaiColombiaPack({ ...coInput, rules: [coInput.rules[0], campaign] }, catalog).ok).toBe(false);
  });
});
