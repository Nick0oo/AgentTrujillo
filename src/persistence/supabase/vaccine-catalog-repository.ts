import type { VaccineCatalogRepository } from "../../clinical/immunization/catalog-repository.ts";

/**
 * The baseline catalog tables do not yet contain governed snapshot/version rows.
 * This adapter intentionally accepts only a server-supplied approved snapshot loader;
 * it cannot silently treat `active` as clinical approval.
 */
export function createSupabaseVaccineCatalogRepository(loadApprovedSnapshot: VaccineCatalogRepository["loadApproved"]): VaccineCatalogRepository {
  return Object.freeze({ loadApproved: loadApprovedSnapshot });
}
