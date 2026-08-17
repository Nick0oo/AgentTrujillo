import type { MedicationConcept, MedicationCodingSystem, MedicationCountry } from "./types.ts";

export type MedicationConceptQuery = Readonly<{
  country: MedicationCountry;
  codingSystem: MedicationCodingSystem;
  conceptCode?: string;
  name?: string;
}>;

export type MedicationConceptResolution = Readonly<{
  status: "resolved" | "not_found" | "ambiguous" | "review_required";
  concept: MedicationConcept | null;
  explanationCodes: readonly string[];
}>;

export function normalizeMedicationName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function resolveMedicationConcept(query: MedicationConceptQuery, catalog: readonly MedicationConcept[]): MedicationConceptResolution {
  const scoped = catalog.filter((candidate) => candidate.country === query.country && candidate.codingSystem === query.codingSystem);
  if (query.conceptCode) {
    const matches = scoped.filter((candidate) => candidate.conceptCode === query.conceptCode);
    if (matches.length === 1) return { status: "resolved", concept: matches[0]!, explanationCodes: ["EXACT_CODE"] };
    if (matches.length > 1) return { status: "ambiguous", concept: null, explanationCodes: ["DUPLICATE_EXACT_CODE"] };
  }
  if (!query.name) return { status: "not_found", concept: null, explanationCodes: ["CONCEPT_CODE_OR_EXACT_NAME_REQUIRED"] };
  const normalized = normalizeMedicationName(query.name);
  const matches = scoped.filter((candidate) => normalizeMedicationName(candidate.normalizedName) === normalized);
  if (matches.length === 1) return { status: "resolved", concept: matches[0]!, explanationCodes: ["EXACT_NORMALIZED_NAME"] };
  if (matches.length > 1) return { status: "ambiguous", concept: null, explanationCodes: ["AMBIGUOUS_EXACT_NAME"] };
  return { status: "not_found", concept: null, explanationCodes: ["EXACT_CONCEPT_NOT_FOUND"] };
}
