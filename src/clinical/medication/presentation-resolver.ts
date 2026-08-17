import { decimalToCanonicalString, parseExactDecimal } from "./decimal.ts";
import type { MedicationConcentration, MedicationPresentation, MedicationRoute, MedicationCountry, MedicationForm } from "./types.ts";

export type MedicationPresentationQuery = Readonly<{
  conceptId: string;
  country: MedicationCountry;
  form: MedicationForm;
  route: MedicationRoute;
  release: MedicationPresentation["release"];
  concentration: MedicationConcentration | null;
}>;

export type MedicationPresentationResolution = Readonly<{
  status: "resolved" | "not_found" | "ambiguous" | "review_required";
  presentation: MedicationPresentation | null;
  explanationCodes: readonly string[];
}>;

function sameConcentration(left: MedicationConcentration | null, right: MedicationConcentration | null): boolean {
  if (left === null || right === null) return left === right;
  return decimalToCanonicalString(parseExactDecimal(left.numerator)) === decimalToCanonicalString(parseExactDecimal(right.numerator))
    && left.numeratorUnit === right.numeratorUnit
    && decimalToCanonicalString(parseExactDecimal(left.denominator)) === decimalToCanonicalString(parseExactDecimal(right.denominator))
    && left.denominatorUnit === right.denominatorUnit;
}

export function resolveMedicationPresentation(query: MedicationPresentationQuery, catalog: readonly MedicationPresentation[]): MedicationPresentationResolution {
  const matches = catalog.filter((candidate) => candidate.conceptId === query.conceptId
    && candidate.country === query.country
    && candidate.form === query.form
    && candidate.route === query.route
    && candidate.release === query.release
    && sameConcentration(candidate.concentration, query.concentration));
  if (matches.length === 1) return { status: "resolved", presentation: matches[0]!, explanationCodes: ["EXACT_PRESENTATION"] };
  if (matches.length > 1) return { status: "ambiguous", presentation: null, explanationCodes: ["DUPLICATE_PRESENTATION"] };
  return { status: "not_found", presentation: null, explanationCodes: ["EXACT_PRESENTATION_NOT_FOUND"] };
}

export type PresentationQuery = MedicationPresentationQuery;
export type PresentationResolution = MedicationPresentationResolution;
export const resolvePresentation = resolveMedicationPresentation;
