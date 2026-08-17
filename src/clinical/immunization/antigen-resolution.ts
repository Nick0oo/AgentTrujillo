import type { AntigenId, ProductAntigenResolution, VaccineCatalog, VaccineProductId } from "./types.ts";

export type AdministrationAntigenEvidence = Readonly<{
  productId: VaccineProductId | null;
  explicitAntigenIds: readonly AntigenId[];
  catalogVersion: string;
}>;

export function resolveAdministrationAntigens(fact: AdministrationAntigenEvidence, catalog: VaccineCatalog): ProductAntigenResolution {
  if (fact.catalogVersion !== catalog.version || fact.productId === null) return { outcome: "review_required", antigenIds: [], reasonCode: "HISTORICAL_CATALOG_REQUIRED" };
  const mapped = catalog.productAntigens.filter((link) => link.productId === fact.productId).map((link) => link.antigenId).sort();
  if (mapped.length === 0) return { outcome: "review_required", antigenIds: [], reasonCode: "PRODUCT_ANTIGEN_MAPPING_MISSING" };
  const explicit = [...fact.explicitAntigenIds].sort();
  if (explicit.length > 0 && (explicit.length !== mapped.length || explicit.some((id, index) => id !== mapped[index]))) return { outcome: "review_required", antigenIds: [], reasonCode: "EXPLICIT_ANTIGEN_MISMATCH" };
  return { outcome: "resolved", antigenIds: mapped, reasonCode: "PRODUCT_ANTIGENS_EXACT" };
}
