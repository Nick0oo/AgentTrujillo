import { compareCalendarDates, isCalendarDate } from "./calendar.ts";
import { computeConfirmationDigest, type ConfirmationSnapshot } from "./evidence.ts";
import { resolveVaccineProduct, resolveAntigen } from "./registry.ts";
import type { AdministrationScope, ConfirmedAdministration, VaccineCatalog, VaccineProductIdentity } from "./types.ts";
import { isSha256Hex } from "../anthropometry/value-objects.ts";

export type AdministrationValidationContext = Readonly<{
  now: string;
  dateOfBirth: string;
  expectedScope: AdministrationScope;
  expectedConfirmationDigest: string;
}>;
export type AdministrationValidationPolicy = Readonly<{
  requireResolvedProduct?: boolean;
  allowAntigenOnlyReview?: boolean;
  allowAntigenOnlyConfirmed?: boolean;
}>;

export type ConfirmedAdministrationCandidate = Readonly<Omit<ConfirmedAdministration, "id" | "confirmedAt" | "supersedesId">>;
export type AdministrationValidationResult =
  | Readonly<{ outcome: "valid"; candidate: ConfirmedAdministrationCandidate; reasonCode: "ADMINISTRATION_VALID" }>
  | Readonly<{ outcome: "review_required"; candidate: null; reasonCode: string }>
  | Readonly<{ outcome: "rejected"; candidate: null; reasonCode: string }>;

function scopeMatches(left: AdministrationScope, right: AdministrationScope): boolean {
  return left.careSpaceId === right.careSpaceId && left.childId === right.childId && left.countryCode === right.countryCode && left.asOfDate === right.asOfDate;
}

function boundedOptional(value: string | undefined, maximum: number): boolean {
  return value === undefined || value.length <= maximum;
}

function evidenceScopeMatches(snapshot: ConfirmationSnapshot, expected: AdministrationScope): boolean {
  const observed = snapshot.evidence.observedScope;
  return (observed.childId === undefined || observed.childId === expected.childId)
    && (observed.countryCode === undefined || observed.countryCode === expected.countryCode);
}

function exactDeclaredAntigens(snapshot: ConfirmationSnapshot, catalog: VaccineCatalog) {
  const declared = snapshot.extracted.antigenCodes ?? [];
  if (declared.length === 0 || new Set(declared).size !== declared.length) return null;
  const resolved = declared.map((code) => resolveAntigen(code, catalog));
  if (resolved.some((entry) => entry.outcome !== "resolved")) return null;
  return resolved.flatMap((entry) => [...entry.antigenIds]).sort();
}

function resolvedAntigens(snapshot: ConfirmationSnapshot, product: VaccineProductIdentity, catalog: VaccineCatalog) {
  const productAntigenIds = catalog.productAntigens.filter((link) => link.productId === product.id).map((link) => link.antigenId).sort();
  const declared = (snapshot.extracted.antigenCodes ?? []).map((code) => resolveAntigen(code, catalog));
  if (declared.some((result) => result.outcome !== "resolved")) return null;
  const declaredIds = declared.flatMap((result) => [...result.antigenIds]).sort();
  if (declaredIds.length > 0 && (declaredIds.length !== productAntigenIds.length || declaredIds.some((id, index) => id !== productAntigenIds[index]))) return null;
  return productAntigenIds;
}

export function validateAdministration(snapshot: ConfirmationSnapshot, context: AdministrationValidationContext, catalog: VaccineCatalog, policy: AdministrationValidationPolicy = {}): AdministrationValidationResult {
  const now = Date.parse(context.now);
  if (!Number.isFinite(now)) return { outcome: "rejected", candidate: null, reasonCode: "TRUSTED_TIME_CONTEXT_INVALID" };
  if (snapshot.expiresAt !== snapshot.evidence.expiresAt) return { outcome: "rejected", candidate: null, reasonCode: "EVIDENCE_EXPIRY_MISMATCH" };
  if (snapshot.extracted.provenanceType !== snapshot.evidence.sourceType) return { outcome: "rejected", candidate: null, reasonCode: "EVIDENCE_PROVENANCE_MISMATCH" };
  if (!snapshot.evidence.sourceId.trim() || !isSha256Hex(snapshot.evidence.sourceDigest)) return { outcome: "rejected", candidate: null, reasonCode: "EVIDENCE_SOURCE_DIGEST_INVALID" };
  const extractedAt = Date.parse(snapshot.evidence.extractedAt);
  if (!Number.isFinite(extractedAt) || extractedAt > now) return { outcome: "rejected", candidate: null, reasonCode: "EVIDENCE_EXTRACTION_TIME_INVALID" };
  const recalculated = computeConfirmationDigest(snapshot.scope, snapshot.evidence, snapshot.extracted, snapshot.expiresAt);
  if (recalculated !== snapshot.confirmationDigest || context.expectedConfirmationDigest !== snapshot.confirmationDigest) return { outcome: "rejected", candidate: null, reasonCode: "CONFIRMATION_DIGEST_MISMATCH" };
  if (!scopeMatches(snapshot.scope, context.expectedScope)) return { outcome: "rejected", candidate: null, reasonCode: "CONFIRMATION_SCOPE_MISMATCH" };
  if (!evidenceScopeMatches(snapshot, context.expectedScope)) return { outcome: "rejected", candidate: null, reasonCode: "EVIDENCE_SCOPE_MISMATCH" };
  if (!isCalendarDate(snapshot.extracted.administeredOn)) return { outcome: "rejected", candidate: null, reasonCode: "ADMINISTRATION_DATE_INVALID" };
  if (!isCalendarDate(context.dateOfBirth) || !isCalendarDate(context.expectedScope.asOfDate)) return { outcome: "rejected", candidate: null, reasonCode: "TRUSTED_DATE_CONTEXT_INVALID" };
  if (compareCalendarDates(snapshot.extracted.administeredOn, context.dateOfBirth) < 0) return { outcome: "rejected", candidate: null, reasonCode: "ADMINISTRATION_BEFORE_BIRTH" };
  if (compareCalendarDates(snapshot.extracted.administeredOn, context.expectedScope.asOfDate) > 0) return { outcome: "rejected", candidate: null, reasonCode: "ADMINISTRATION_AFTER_AS_OF_DATE" };
  if (snapshot.expiresAt !== null) {
    const expiresAt = Date.parse(snapshot.expiresAt);
    if (!Number.isFinite(expiresAt)) return { outcome: "rejected", candidate: null, reasonCode: "EVIDENCE_EXPIRY_INVALID" };
    if (expiresAt < extractedAt) return { outcome: "rejected", candidate: null, reasonCode: "EVIDENCE_EXPIRY_INVALID" };
    if (now > expiresAt) return { outcome: "review_required", candidate: null, reasonCode: "EVIDENCE_EXPIRED" };
  }
  if (!boundedOptional(snapshot.extracted.doseLabel, 120)
    || !boundedOptional(snapshot.extracted.lotNumber, 120)
    || !boundedOptional(snapshot.extracted.administrationSite, 120)
    || !boundedOptional(snapshot.extracted.providerName, 200)) return { outcome: "rejected", candidate: null, reasonCode: "ADMINISTRATION_FIELD_TOO_LONG" };
  const productResult = resolveVaccineProduct(snapshot.extracted.product, catalog, context.expectedScope.countryCode, snapshot.extracted.administeredOn);
  if (productResult.outcome !== "resolved" || !productResult.product) {
    if (policy.requireResolvedProduct === false && policy.allowAntigenOnlyConfirmed === true) {
      const antigenIds = exactDeclaredAntigens(snapshot, catalog);
      if (!antigenIds) return { outcome: "review_required", candidate: null, reasonCode: "ADMINISTRATION_ANTIGEN_REVIEW_REQUIRED" };
      return {
        outcome: "valid",
        reasonCode: "ADMINISTRATION_VALID",
        candidate: {
          scope: context.expectedScope,
          administeredOn: snapshot.extracted.administeredOn,
          product: null,
          antigenIds,
          doseLabel: snapshot.extracted.doseLabel ?? null,
          lotNumber: snapshot.extracted.lotNumber ?? null,
          administrationSite: snapshot.extracted.administrationSite ?? null,
          providerName: snapshot.extracted.providerName ?? null,
          catalogVersion: catalog.version,
          catalogDigest: catalog.sourceDigest,
          provenanceType: snapshot.evidence.sourceType,
          sourceDigest: snapshot.evidence.sourceDigest,
          confirmationDigest: snapshot.confirmationDigest,
        },
      };
    }
    if (policy.requireResolvedProduct === false && policy.allowAntigenOnlyReview === true) return { outcome: "review_required", candidate: null, reasonCode: "PRODUCT_RESOLUTION_REVIEW_REQUIRED" };
    return { outcome: "review_required", candidate: null, reasonCode: productResult.reasonCode };
  }
  const antigenIds = resolvedAntigens(snapshot, productResult.product, catalog);
  if (!antigenIds || antigenIds.length === 0) return { outcome: "review_required", candidate: null, reasonCode: "ADMINISTRATION_ANTIGEN_REVIEW_REQUIRED" };
  return {
    outcome: "valid",
    reasonCode: "ADMINISTRATION_VALID",
    candidate: {
      scope: context.expectedScope,
      administeredOn: snapshot.extracted.administeredOn,
      product: productResult.product,
      antigenIds,
      doseLabel: snapshot.extracted.doseLabel ?? null,
      lotNumber: snapshot.extracted.lotNumber ?? null,
      administrationSite: snapshot.extracted.administrationSite ?? null,
      providerName: snapshot.extracted.providerName ?? null,
      catalogVersion: catalog.version,
      catalogDigest: catalog.sourceDigest,
      provenanceType: snapshot.evidence.sourceType,
      sourceDigest: snapshot.evidence.sourceDigest,
      confirmationDigest: snapshot.confirmationDigest,
    },
  };
}
