import type { ClinicalPackageQuery } from "./package-repository.ts";
import { selectJurisdiction, type CountryOfCare, type JurisdictionPolicy } from "./jurisdiction.ts";
import { deriveClinicalReferenceDate, type ClinicalReferenceDate } from "./effective-date.ts";
import type { ClinicalDomain, CountryCode } from "./source-types.ts";

export type SelectionContext = Readonly<{
  countryOfCare: CountryOfCare;
  contextVersion: string;
  timeZone: string;
  serverInstant: Date | string;
  historicalDate?: string;
}>;

export function resolvePackageForContext(input: Readonly<{ context: SelectionContext; domain: ClinicalDomain; locale: string; artifactSchemaVersion: string; policy: JurisdictionPolicy; requestedCountry?: CountryCode }>): ClinicalPackageQuery {
  if (input.context.contextVersion !== input.context.countryOfCare.contextVersion) throw new Error("JURISDICTION_MISMATCH");
  const countryCode = selectJurisdiction(input.context.countryOfCare, input.policy, input.requestedCountry);
  const referenceDate: ClinicalReferenceDate = deriveClinicalReferenceDate({ instant: input.context.serverInstant, timeZone: input.context.timeZone, historicalDate: input.context.historicalDate });
  return { domain: input.domain, countryCode, locale: input.locale, referenceDate, artifactSchemaVersion: input.artifactSchemaVersion };
}
