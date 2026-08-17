import { describe, expect, it } from "vitest";

import {
  buildAdministrationConfirmationSnapshot,
  createAdministrationDraft,
} from "../../../src/clinical/immunization/evidence.ts";
import { validateAdministration } from "../../../src/clinical/immunization/validation.ts";
import { resolveAdministrationAntigens } from "../../../src/clinical/immunization/antigen-resolution.ts";
import type { AdministrationScope, VaccineCatalog, VaccineEvidence } from "../../../src/clinical/immunization/types.ts";

const digest = "b".repeat(64) as VaccineEvidence["sourceDigest"];
const scope: AdministrationScope = { careSpaceId: "space-1", childId: "child-1", countryCode: "CO", asOfDate: "2026-08-16" as never };
const evidence: VaccineEvidence = {
  sourceType: "document",
  sourceId: "document-1",
  sourceDigest: digest,
  extractedAt: "2026-08-16T12:00:00.000Z",
  observedScope: { childId: "child-1", countryCode: "CO" },
  expiresAt: "2026-08-17T12:00:00.000Z",
};
const extraction = {
  administeredOn: "2026-08-10" as never,
  product: { productCode: "CO-HEP-B" },
  antigenCodes: ["HEP_B"],
  provenanceType: "document" as const,
};
const catalog: VaccineCatalog = {
  version: "catalog-1",
  sourceDigest: "c".repeat(64) as never,
  antigens: [{ id: "antigen-1" as never, antigenCode: "HEP_B", displayName: "Hepatitis B", diseaseGroup: "hep-b", active: true }],
  products: [{ id: "product-1" as never, productCode: "CO-HEP-B", countryCode: "CO", manufacturer: "Synthetic", brandName: "Hep B", presentation: "dose", regulatoryIdentifier: null, aliases: [], effectiveFrom: "2020-01-01" as never, effectiveUntil: null, active: true }],
  productAntigens: [{ productId: "product-1" as never, antigenId: "antigen-1" as never }],
};

describe("immunization evidence boundary", () => {
  it("creates an exact confirmation snapshot and does not treat a draft as a fact", () => {
    const draft = createAdministrationDraft(scope, evidence, extraction);
    const snapshot = buildAdministrationConfirmationSnapshot(draft);
    expect(draft.draftId).toBeTruthy();
    expect(snapshot.confirmationDigest).toBe(draft.confirmationDigest);
    expect(snapshot).not.toHaveProperty("id");
  });

  it("rejects changed confirmation content and accepts only the exact scope", () => {
    const draft = createAdministrationDraft(scope, evidence, extraction);
    const snapshot = buildAdministrationConfirmationSnapshot(draft);
    const valid = validateAdministration(snapshot, { now: "2026-08-16T12:00:00.000Z", dateOfBirth: "2026-01-01", expectedScope: scope, expectedConfirmationDigest: snapshot.confirmationDigest }, catalog);
    expect(valid.outcome).toBe("valid");
    const changed = { ...snapshot, extracted: { ...snapshot.extracted, administeredOn: "2026-08-11" as never } };
    expect(validateAdministration(changed, { now: "2026-08-16T12:00:00.000Z", dateOfBirth: "2026-01-01", expectedScope: scope, expectedConfirmationDigest: snapshot.confirmationDigest }, catalog).outcome).toBe("rejected");
  });

  it("resolves product antigens from the historical catalog and reviews mismatch", () => {
    expect(resolveAdministrationAntigens({ productId: "product-1" as never, explicitAntigenIds: [], catalogVersion: "catalog-1" }, catalog).outcome).toBe("resolved");
    expect(resolveAdministrationAntigens({ productId: "product-1" as never, explicitAntigenIds: ["other" as never], catalogVersion: "catalog-1" }, catalog).outcome).toBe("review_required");
  });
});
