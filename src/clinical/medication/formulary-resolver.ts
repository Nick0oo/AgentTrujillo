import type { ApprovedMedicationPackage, MedicationCountry } from "./types.ts";

export type MedicationFormularyQuery = Readonly<{
  country: MedicationCountry;
  at: string;
  algorithmVersion: string;
  vocabularyVersion: string;
  requiredSourceIds: readonly string[];
  requiredArtifactSha256: string;
}>;

export type MedicationFormularyResolution = Readonly<{
  status: "resolved" | "rule_unavailable" | "requires_professional_review";
  package: ApprovedMedicationPackage | null;
  explanationCodes: readonly string[];
}>;

function sourceSetMatches(pack: ApprovedMedicationPackage, query: MedicationFormularyQuery): boolean {
  const ids = new Set(pack.sources.map((source) => source.sourceId));
  return query.requiredSourceIds.every((sourceId) => ids.has(sourceId));
}

export function resolveMedicationFormulary(query: MedicationFormularyQuery, packages: readonly ApprovedMedicationPackage[]): MedicationFormularyResolution {
  const at = Date.parse(query.at);
  const matches = packages.filter((candidate) => {
    const from = Date.parse(candidate.effectiveFrom);
    const until = candidate.effectiveUntil === null ? Number.POSITIVE_INFINITY : Date.parse(candidate.effectiveUntil);
    return candidate.country === query.country
      && (candidate.status === "approved" || candidate.status === "active")
      && at >= from
      && at < until
      && candidate.algorithmVersion === query.algorithmVersion
      && candidate.vocabularyVersion === query.vocabularyVersion
      && candidate.artifactSha256 === query.requiredArtifactSha256
      && sourceSetMatches(candidate, query);
  });
  if (matches.length === 1) return { status: "resolved", package: matches[0]!, explanationCodes: ["APPROVED_EFFECTIVE_PACKAGE"] };
  if (matches.length > 1) return { status: "requires_professional_review", package: null, explanationCodes: ["AMBIGUOUS_APPROVED_PACKAGE"] };
  return { status: "rule_unavailable", package: null, explanationCodes: ["APPROVED_PACKAGE_UNAVAILABLE"] };
}

export type FormularyResolutionRequest = MedicationFormularyQuery;
export type ResolvedFormulary = ApprovedMedicationPackage;
export type FormularyUnavailableReason = "RULE_UNAVAILABLE" | "AMBIGUOUS_PACKAGE";
export function resolveFormulary(registry: readonly ApprovedMedicationPackage[], request: MedicationFormularyQuery): MedicationFormularyResolution {
  const result = resolveMedicationFormulary(request, registry);
  return result.status === "rule_unavailable" ? { ...result, explanationCodes: ["RULE_UNAVAILABLE"] } : result;
}
