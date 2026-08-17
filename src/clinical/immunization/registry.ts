import { compareCalendarDates, isCalendarDate } from "./calendar.ts";
import type {
  AntigenResolution,
  ImmunizationCountry,
  ProductResolution,
  VaccineCatalog,
  VaccineProductIdentity,
  VaccineProductQuery,
} from "./types.ts";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function isInEffect(product: VaccineProductIdentity, date: string): boolean {
  if (!isCalendarDate(date) || compareCalendarDates(product.effectiveFrom, date) > 0) return false;
  return product.effectiveUntil === null || compareCalendarDates(date, product.effectiveUntil) < 0;
}

export function resolveVaccineProduct(
  query: VaccineProductQuery,
  catalog: VaccineCatalog,
  countryCode: ImmunizationCountry,
  asOfDate: string,
): ProductResolution {
  const all = catalog.products.filter((product) => {
    if (query.regulatoryIdentifier && product.regulatoryIdentifier === query.regulatoryIdentifier) return true;
    if (query.productCode && product.productCode === query.productCode) return true;
    if (query.alias && product.aliases.some((alias) => normalized(alias) === normalized(query.alias!))) return true;
    return false;
  });
  if (all.length === 0) return { outcome: "unknown", product: null, candidates: [], reasonCode: "PRODUCT_NOT_FOUND", catalogVersion: catalog.version, catalogDigest: catalog.sourceDigest };

  const regulatory = query.regulatoryIdentifier ? all.filter((p) => p.regulatoryIdentifier === query.regulatoryIdentifier) : [];
  const countryCodeMatches = query.productCode ? all.filter((p) => p.productCode === query.productCode && (p.countryCode === countryCode || p.countryCode === "GLOBAL")) : [];
  const aliases = query.alias ? all.filter((p) => p.aliases.some((alias) => normalized(alias) === normalized(query.alias!))) : [];
  const candidates = regulatory.length > 0 ? regulatory : countryCodeMatches.length > 0 ? countryCodeMatches : aliases;
  if (candidates.length === 0) return { outcome: "jurisdiction_mismatch", product: null, candidates: all, reasonCode: "PRODUCT_COUNTRY_MISMATCH", catalogVersion: catalog.version, catalogDigest: catalog.sourceDigest };
  if (candidates.length > 1) return { outcome: "ambiguous", product: null, candidates, reasonCode: "PRODUCT_MATCH_AMBIGUOUS", catalogVersion: catalog.version, catalogDigest: catalog.sourceDigest };
  const product = candidates[0];
  const antigenIds = catalog.productAntigens.filter((link) => link.productId === product.id).map((link) => link.antigenId).sort();
  if (!product.active || !isInEffect(product, asOfDate)) return { outcome: "retired", product: null, candidates, reasonCode: "PRODUCT_RETIRED_OR_OUT_OF_EFFECT", catalogVersion: catalog.version, catalogDigest: catalog.sourceDigest, antigenIds };
  return { outcome: "resolved", product, candidates, reasonCode: "PRODUCT_EXACT_MATCH", catalogVersion: catalog.version, catalogDigest: catalog.sourceDigest, antigenIds };
}

export function resolveAntigen(query: string, catalog: VaccineCatalog): AntigenResolution {
  const antigen = catalog.antigens.find((candidate) => candidate.antigenCode === query.trim().toUpperCase());
  if (!antigen || !antigen.active) return { outcome: "review_required", antigenIds: [], reasonCode: "ANTIGEN_NOT_EXACTLY_RESOLVED", catalogVersion: catalog.version };
  return { outcome: "resolved", antigenIds: [antigen.id], reasonCode: "ANTIGEN_EXACT_MATCH", catalogVersion: catalog.version };
}
