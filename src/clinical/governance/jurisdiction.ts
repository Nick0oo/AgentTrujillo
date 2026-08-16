import type { ClinicalDomain, CountryCode } from "./source-types.ts";

export type CountryOfCare = Readonly<{ countryCode: Exclude<CountryCode, "GLOBAL">; source: "authorized-scope"; contextVersion: string }>;
export type JurisdictionErrorCode = "JURISDICTION_UNAVAILABLE" | "JURISDICTION_MISMATCH" | "GLOBAL_NOT_ALLOWED";
export class JurisdictionError extends Error {
  readonly code: JurisdictionErrorCode;
  constructor(code: JurisdictionErrorCode) { super(code); this.name = "JurisdictionError"; this.code = code; }
}

export type JurisdictionPolicy = Readonly<{ domain: ClinicalDomain; globalAllowed: boolean }>;

export function selectJurisdiction(country: CountryOfCare, policy: JurisdictionPolicy, requested?: CountryCode): CountryCode {
  if (!country || !country.contextVersion || (country.countryCode !== "CO" && country.countryCode !== "US")) throw new JurisdictionError("JURISDICTION_UNAVAILABLE");
  if (requested !== undefined && requested !== country.countryCode) {
    if (requested === "GLOBAL" && policy.globalAllowed) return "GLOBAL";
    throw new JurisdictionError("JURISDICTION_MISMATCH");
  }
  return country.countryCode;
}
