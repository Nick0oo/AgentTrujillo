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
    expect(valid).toMatchObject({ outcome: "valid", candidate: { catalogVersion: "catalog-1", catalogDigest: catalog.sourceDigest } });
    const changed = { ...snapshot, extracted: { ...snapshot.extracted, administeredOn: "2026-08-11" as never } };
    expect(validateAdministration(changed, { now: "2026-08-16T12:00:00.000Z", dateOfBirth: "2026-01-01", expectedScope: scope, expectedConfirmationDigest: snapshot.confirmationDigest }, catalog).outcome).toBe("rejected");
  });

  it("resolves product antigens from the historical catalog and reviews mismatch", () => {
    expect(resolveAdministrationAntigens({ productId: "product-1" as never, explicitAntigenIds: [], catalogVersion: "catalog-1" }, catalog).outcome).toBe("resolved");
    expect(resolveAdministrationAntigens({ productId: "product-1" as never, explicitAntigenIds: ["other" as never], catalogVersion: "catalog-1" }, catalog).outcome).toBe("review_required");
  });

  it("accepts an exact guardian-confirmed antigen-only fact only when policy allows it", () => {
    const antigenOnly = buildAdministrationConfirmationSnapshot(createAdministrationDraft(scope, evidence, {
      ...extraction,
      product: {},
      antigenCodes: ["HEP_B"],
    }));
    const context = { now: "2026-08-16T12:00:00.000Z", dateOfBirth: "2026-01-01", expectedScope: scope, expectedConfirmationDigest: antigenOnly.confirmationDigest };
    expect(validateAdministration(antigenOnly, context, catalog).outcome).toBe("review_required");
    const allowed = validateAdministration(antigenOnly, context, catalog, { requireResolvedProduct: false, allowAntigenOnlyConfirmed: true });
    expect(allowed).toMatchObject({ outcome: "valid", candidate: { product: null, antigenIds: ["antigen-1"] } });
  });

  it("returns stable rejections instead of throwing for invalid dates and mismatched observed scope", () => {
    const invalidDate = buildAdministrationConfirmationSnapshot(createAdministrationDraft(scope, evidence, { ...extraction, administeredOn: "2026-02-30" as never }));
    const invalidContext = { now: "2026-08-16T12:00:00.000Z", dateOfBirth: "2026-01-01", expectedScope: scope, expectedConfirmationDigest: invalidDate.confirmationDigest };
    expect(() => validateAdministration(invalidDate, invalidContext, catalog)).not.toThrow();
    expect(validateAdministration(invalidDate, invalidContext, catalog)).toMatchObject({ outcome: "rejected", reasonCode: "ADMINISTRATION_DATE_INVALID" });

    const foreignEvidence = { ...evidence, observedScope: { childId: "child-2", countryCode: "CO" as const } };
    const foreign = buildAdministrationConfirmationSnapshot(createAdministrationDraft(scope, foreignEvidence, extraction));
    const foreignContext = { ...invalidContext, expectedConfirmationDigest: foreign.confirmationDigest };
    expect(validateAdministration(foreign, foreignContext, catalog)).toMatchObject({ outcome: "rejected", reasonCode: "EVIDENCE_SCOPE_MISMATCH" });
  });

  it("rejects evidence provenance, expiry, digest, and extraction-time drift", () => {
    const contextFor = (snapshot: ReturnType<typeof buildAdministrationConfirmationSnapshot>) => ({ now: "2026-08-16T12:00:00.000Z", dateOfBirth: "2026-01-01", expectedScope: scope, expectedConfirmationDigest: snapshot.confirmationDigest });
    const provenance = buildAdministrationConfirmationSnapshot(createAdministrationDraft(scope, evidence, { ...extraction, provenanceType: "guardian" }));
    expect(validateAdministration(provenance, contextFor(provenance), catalog)).toMatchObject({ outcome: "rejected", reasonCode: "EVIDENCE_PROVENANCE_MISMATCH" });
    const expiry = { ...buildAdministrationConfirmationSnapshot(createAdministrationDraft(scope, evidence, extraction)), expiresAt: null };
    expect(validateAdministration(expiry, contextFor(expiry), catalog)).toMatchObject({ outcome: "rejected", reasonCode: "EVIDENCE_EXPIRY_MISMATCH" });
    const badDigestEvidence = { ...evidence, sourceDigest: "not-a-digest" as never };
    const badDigest = buildAdministrationConfirmationSnapshot(createAdministrationDraft(scope, badDigestEvidence, extraction));
    expect(validateAdministration(badDigest, contextFor(badDigest), catalog)).toMatchObject({ outcome: "rejected", reasonCode: "EVIDENCE_SOURCE_DIGEST_INVALID" });
    const futureEvidence = { ...evidence, extractedAt: "2026-08-16T12:00:01.000Z" };
    const future = buildAdministrationConfirmationSnapshot(createAdministrationDraft(scope, futureEvidence, extraction));
    expect(validateAdministration(future, contextFor(future), catalog)).toMatchObject({ outcome: "rejected", reasonCode: "EVIDENCE_EXTRACTION_TIME_INVALID" });
  });
});
