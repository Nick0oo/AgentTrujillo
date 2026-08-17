import type { ImmunizationCountry, VaccineCatalog } from "./types.ts";

export type VaccineCatalogRepository = Readonly<{
  loadApproved: (countryCode: ImmunizationCountry, asOfDate: string) => Promise<VaccineCatalog | null>;
}>;

export function createVaccineCatalogRepository(loader: VaccineCatalogRepository["loadApproved"]): VaccineCatalogRepository {
  return Object.freeze({ loadApproved: loader });
}
