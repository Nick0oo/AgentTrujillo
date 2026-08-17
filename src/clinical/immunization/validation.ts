import { compareCalendarDates, isCalendarDate } from "./calendar.ts";
import { computeConfirmationDigest, type ConfirmationSnapshot } from "./evidence.ts";
import { resolveVaccineProduct, resolveAntigen } from "./registry.ts";
import type { AdministrationScope, ConfirmedAdministration, VaccineCatalog, VaccineProductIdentity } from "./types.ts";

export type AdministrationValidationContext = Readonly<{
  now: string;
  dateOfBirth: string;
  expectedScope: AdministrationScope;
  expectedConfirmationDigest: string;
}>;
export type AdministrationValidationPolicy = Readonly<{
  requireResolvedProduct?: boolean;
  allowAntigenOnlyReview?: boolean;
}>;

export type ConfirmedAdministrationCandidate = Readonly<Omit<ConfirmedAdministration, "id" | "confirmedAt" | "supersedesId">>;
export type AdministrationValidationResult =
  | Readonly<{ outcome: "valid"; candidate: ConfirmedAdministrationCandidate; reasonCode: "ADMINISTRATION_VALID" }>
  | Readonly<{ outcome: "review_required"; candidate: null; reasonCode: string }>
  | Readonly<{ outcome: "rejected"; candidate: null; reasonCode: string }>;

function scopeMatches(left: AdministrationScope, right: AdministrationScope): boolean {
  return left.careSpaceId === right.careSpaceId && left.childId === right.childId && left.countryCode === right.countryCode && left.asOfDate === right.asOfDate;
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
  const recalculated = computeConfirmationDigest(snapshot.scope, snapshot.evidence, snapshot.extracted, snapshot.expiresAt);
  if (recalculated !== snapshot.confirmationDigest || context.expectedConfirmationDigest !== snapshot.confirmationDigest) return { outcome: "rejected", candidate: null, reasonCode: "CONFIRMATION_DIGEST_MISMATCH" };
  if (!scopeMatches(snapshot.scope, context.expectedScope)) return { outcome: "rejected", candidate: null, reasonCode: "CONFIRMATION_SCOPE_MISMATCH" };
  if (!isCalendarDate(context.dateOfBirth) || compareCalendarDates(snapshot.extracted.administeredOn, context.dateOfBirth) < 0) return { outcome: "rejected", candidate: null, reasonCode: "ADMINISTRATION_BEFORE_BIRTH" };
  if (compareCalendarDates(snapshot.extracted.administeredOn, context.expectedScope.asOfDate) > 0) return { outcome: "rejected", candidate: null, reasonCode: "ADMINISTRATION_AFTER_AS_OF_DATE" };
  if (snapshot.expiresAt !== null && new Date(context.now).getTime() > new Date(snapshot.expiresAt).getTime()) return { outcome: "review_required", candidate: null, reasonCode: "EVIDENCE_EXPIRED" };
  const productResult = resolveVaccineProduct(snapshot.extracted.product, catalog, context.expectedScope.countryCode, snapshot.extracted.administeredOn);
  if (productResult.outcome !== "resolved" || !productResult.product) {
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
      provenanceType: snapshot.evidence.sourceType,
      sourceDigest: snapshot.evidence.sourceDigest,
      confirmationDigest: snapshot.confirmationDigest,
    },
  };
}
