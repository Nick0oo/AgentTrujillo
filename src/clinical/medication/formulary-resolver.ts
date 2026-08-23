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
  if (pack.sources.length === 0 || query.requiredSourceIds.length === 0) return false;
  const validSources = pack.sources.filter((source) => {
    let uri: URL;
    try { uri = new URL(source.sourceUri); } catch { return false; }
    return source.sourceId.trim().length > 0
      && source.sourceVersion.trim().length > 0
      && uri.protocol === "https:"
      && uri.hostname.length > 0
      && /^[a-f0-9]{64}$/.test(source.artifactSha256);
  });
  if (validSources.length !== pack.sources.length) return false;
  const ids = new Set(validSources.map((source) => source.sourceId));
  return ids.size === validSources.length
    && new Set(query.requiredSourceIds).size === query.requiredSourceIds.length
    && query.requiredSourceIds.every((sourceId) => sourceId.trim().length > 0 && ids.has(sourceId));
}

export function resolveMedicationFormulary(query: MedicationFormularyQuery, packages: readonly ApprovedMedicationPackage[]): MedicationFormularyResolution {
  const at = Date.parse(query.at);
  const matches = packages.filter((candidate) => {
    const from = Date.parse(candidate.effectiveFrom);
    const until = candidate.effectiveUntil === null ? Number.POSITIVE_INFINITY : Date.parse(candidate.effectiveUntil);
    return Number.isFinite(at)
      && Number.isFinite(from)
      && (candidate.effectiveUntil === null || Number.isFinite(until))
      && candidate.country === query.country
      && candidate.status === "active"
      && candidate.packageId.trim().length > 0
      && candidate.version.trim().length > 0
      && candidate.approvedBy.trim().length > 0
      && candidate.algorithmVersion.trim().length > 0
      && candidate.vocabularyVersion.trim().length > 0
      && at >= from
      && at < until
      && from < until
      && candidate.algorithmVersion === query.algorithmVersion
      && candidate.vocabularyVersion === query.vocabularyVersion
      && /^[a-f0-9]{64}$/.test(candidate.artifactSha256)
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
