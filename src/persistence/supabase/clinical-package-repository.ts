import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";
import type { AlgorithmIdentity } from "../../clinical/governance/algorithm-types.ts";
import { clinicalArtifactPath } from "../../clinical/governance/artifact-store.ts";
import type { ApprovalAttestation } from "../../clinical/governance/approval-types.ts";
import type { ClinicalPackageCandidate, ClinicalPackageRepository, ClinicalPackageQuery } from "../../clinical/governance/package-repository.ts";
import type { ClinicalSourceReference, CountryCode, Sha256Hex } from "../../clinical/governance/source-types.ts";

type Client = SupabaseClient<Database>;
type PackRow = Database["public"]["Tables"]["clinical_rule_packs"]["Row"];
type SourceRow = Database["public"]["Tables"]["clinical_sources"]["Row"];
type SourceLinkRow = Database["public"]["Tables"]["clinical_rule_pack_sources"]["Row"];
type ApprovalRow = Database["public"]["Tables"]["clinical_approvals"]["Row"];
type AlgorithmRow = Database["public"]["Tables"]["clinical_algorithms"]["Row"];
type ReleaseRow = Database["public"]["Tables"]["clinical_package_releases"]["Row"];

const SHA256 = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asSha256(value: string | null | undefined): Sha256Hex | null {
  return value && SHA256.test(value) ? value as Sha256Hex : null;
}

function asCountry(value: string): CountryCode | null {
  return value === "CO" || value === "US" || value === "GLOBAL" ? value : null;
}

function sourceFor(row: SourceRow, query: ClinicalPackageQuery): ClinicalSourceReference | null {
  const authority = query.countryCode === "CO" ? "MINSALUD_PAI" : "CDC_ACIP";
  const artifactSha256 = asSha256(row.artifact_sha256);
  const jurisdiction = asCountry(row.jurisdiction);
  if (row.authority !== authority || jurisdiction !== query.countryCode || row.status !== "approved"
    || !artifactSha256 || !row.license?.trim() || !row.retrieved_at
    || !ISO_DATE.test(row.published_at ?? row.retrieved_at.slice(0, 10))) return null;
  return Object.freeze({
    id: row.id,
    authority,
    jurisdiction,
    domain: "immunization",
    title: row.title,
    sourceUri: row.source_uri,
    citation: row.citation,
    publishedAt: row.published_at,
    retrievedAt: row.retrieved_at,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    license: row.license,
    artifactSha256,
    status: "approved",
  });
}

function sourceSetDigest(sources: readonly ClinicalSourceReference[]): Sha256Hex {
  const canonicalSources = sources.map((source) => ({ id: source.id ?? source.sourceId ?? "", artifactSha256: source.artifactSha256, status: source.status }))
    .sort((left, right) => left.artifactSha256.localeCompare(right.artifactSha256));
  return createHash("sha256").update(new TextEncoder().encode(canonicalize(canonicalSources))).digest("hex") as Sha256Hex;
}

function algorithmFor(row: AlgorithmRow): Readonly<{ status: string; identity: AlgorithmIdentity }> | null {
  const implementationSha256 = asSha256(row.implementation_sha256);
  const testVectorSha256 = asSha256(row.test_vector_sha256);
  const supportedArtifactSchemas = row.artifact_schema_versions.filter((value): value is `v${number}` | `${number}` => /^v\d+(?:\.\d+)*$/.test(value) || /^\d+(?:\.\d+)*$/.test(value));
  if (!implementationSha256 || !testVectorSha256 || !row.algorithm_key.trim() || !row.version.trim() || !row.entrypoint.trim()
    || !row.runtime.trim() || supportedArtifactSchemas.length === 0) return null;
  return Object.freeze({
    status: row.status,
    identity: Object.freeze({
      domain: row.domain,
      key: row.algorithm_key as AlgorithmIdentity["key"],
      version: row.version,
      implementationSha256,
      supportedArtifactSchemas,
      entrypoint: row.entrypoint,
      runtime: row.runtime,
      testVectorSha256,
    }),
  });
}

function approvalFor(row: ApprovalRow, pack: PackRow, algorithmId: string, algorithm: AlgorithmIdentity, sourceSetSha256: Sha256Hex): ApprovalAttestation | null {
  const artifactSha256 = asSha256(row.artifact_sha256);
  const algorithmImplementationSha256 = asSha256(row.algorithm_implementation_sha256);
  const sourceDigest = asSha256(row.source_set_sha256);
  const manifestSha256 = asSha256(row.manifest_sha256);
  if (row.decision !== "approved" || row.withdrawal_of !== null || row.rule_pack_id !== pack.id
    || artifactSha256 !== pack.artifact_sha256 || row.algorithm_id !== algorithmId
    || algorithmImplementationSha256 !== algorithm.implementationSha256 || sourceDigest !== sourceSetSha256
    || !manifestSha256 || !row.approver_subject || row.approver_role !== "clinical_approver" || !row.request_id) return null;
  return Object.freeze({
    attestationVersion: 1,
    rulePackId: row.rule_pack_id,
    artifactSha256,
    algorithmId: algorithm.key,
    algorithmImplementationSha256,
    sourceSetSha256: sourceDigest,
    manifestSha256,
    approverSubject: row.approver_subject,
    approverRole: "clinical_approver",
    decision: "approved",
    decidedAt: row.decided_at,
    requestId: row.request_id,
    withdrawalOf: null,
  });
}

function locationFor(pack: PackRow, artifactSha256: Sha256Hex) {
  const country = asCountry(pack.country_code);
  if (!country || !ISO_DATE.test(pack.effective_from ?? "")) return null;
  return { bucket: "clinical-sources" as const, path: clinicalArtifactPath("immunization", country, artifactSha256), artifactSha256 };
}

function candidateFor(
  pack: PackRow,
  links: readonly SourceLinkRow[],
  sourcesById: ReadonlyMap<string, SourceRow>,
  approvals: readonly ApprovalRow[],
  releases: readonly ReleaseRow[],
  algorithmsById: ReadonlyMap<string, AlgorithmRow>,
  query: ClinicalPackageQuery,
): ClinicalPackageCandidate | null {
  const artifactSha256 = asSha256(pack.artifact_sha256);
  const country = asCountry(pack.country_code);
  const effectiveFrom = pack.effective_from;
  if (!artifactSha256 || country !== query.countryCode || pack.domain !== query.domain || pack.locale !== query.locale
    || pack.status !== "active" || !effectiveFrom || !ISO_DATE.test(effectiveFrom)
    || (pack.effective_until !== null && !ISO_DATE.test(pack.effective_until))) return null;
  const sourceReferences = links.map((link) => sourcesById.get(link.source_id)).filter((source): source is SourceRow => Boolean(source))
    .map((source) => sourceFor(source, query)).filter((source): source is ClinicalSourceReference => Boolean(source));
  if (sourceReferences.length !== links.length || sourceReferences.length === 0) return null;
  const sourceSetSha256 = sourceSetDigest(sourceReferences);
  const release = releases.find((item) => item.rule_pack_id === pack.id && item.status === "active" && item.artifact_sha256 === pack.artifact_sha256);
  if (!release) return null;
  const algorithmRow = algorithmsById.get(release.algorithm_id);
  const algorithm = algorithmRow ? algorithmFor(algorithmRow) : null;
  if (!algorithm || algorithm.status !== "active" || algorithm.identity.domain !== query.domain) return null;
  const approvalRows = approvals.filter((item) => item.rule_pack_id === pack.id && item.decision === "approved")
    .sort((left, right) => right.decided_at.localeCompare(left.decided_at));
  const approval = approvalRows.map((row) => approvalFor(row, pack, release.algorithm_id, algorithm.identity, sourceSetSha256)).find((value): value is ApprovalAttestation => Boolean(value));
  const location = locationFor(pack, artifactSha256);
  if (!approval || !location) return null;
  return Object.freeze({
    pack: Object.freeze({ id: pack.id, domain: query.domain, countryCode: country, version: pack.version, locale: pack.locale, status: pack.status, effectiveFrom, effectiveUntil: pack.effective_until, artifactSha256 }),
    location,
    sources: Object.freeze(sourceReferences),
    sourceSetSha256,
    approval,
    algorithm,
    release: Object.freeze({ status: release.status, artifactSha256 }),
  });
}

export function createClinicalPackageRepository(client: Client): ClinicalPackageRepository {
  return Object.freeze({
    async findCandidates(query: ClinicalPackageQuery, signal?: AbortSignal) {
      if (signal?.aborted) return [];
      const packsResult = await client.from("clinical_rule_packs").select("*")
        .eq("domain", query.domain).eq("country_code", query.countryCode).eq("locale", query.locale).eq("status", "active");
      if (packsResult.error) throw new Error("PACKAGE_REPOSITORY_UNAVAILABLE");
      const packs = packsResult.data as readonly PackRow[];
      if (packs.length === 0 || signal?.aborted) return [];
      const packIds = packs.map((pack) => pack.id);
      const linksResult = await client.from("clinical_rule_pack_sources").select("*").in("rule_pack_id", packIds);
      if (linksResult.error) throw new Error("PACKAGE_REPOSITORY_UNAVAILABLE");
      const links = linksResult.data as readonly SourceLinkRow[];
      const sourceIds = [...new Set(links.map((link) => link.source_id))];
      const sourcesResult = sourceIds.length === 0 ? { data: [], error: null } : await client.from("clinical_sources").select("*").in("id", sourceIds);
      if (sourcesResult.error) throw new Error("PACKAGE_REPOSITORY_UNAVAILABLE");
      const releasesResult = await client.from("clinical_package_releases").select("*").in("rule_pack_id", packIds).eq("status", "active");
      if (releasesResult.error) throw new Error("PACKAGE_REPOSITORY_UNAVAILABLE");
      const releases = releasesResult.data as readonly ReleaseRow[];
      const algorithmIds = [...new Set(releases.map((release) => release.algorithm_id))];
      const algorithmsResult = algorithmIds.length === 0 ? { data: [], error: null } : await client.from("clinical_algorithms").select("*").in("id", algorithmIds);
      if (algorithmsResult.error) throw new Error("PACKAGE_REPOSITORY_UNAVAILABLE");
      const approvalResult = await client.from("clinical_approvals").select("*").in("rule_pack_id", packIds).eq("decision", "approved");
      if (approvalResult.error) throw new Error("PACKAGE_REPOSITORY_UNAVAILABLE");
      const linksByPack = new Map<string, SourceLinkRow[]>();
      for (const link of links) linksByPack.set(link.rule_pack_id, [...(linksByPack.get(link.rule_pack_id) ?? []), link]);
      const sourcesById = new Map((sourcesResult.data as readonly SourceRow[]).map((source) => [source.id, source]));
      const algorithmsById = new Map((algorithmsResult.data as readonly AlgorithmRow[]).map((algorithm) => [algorithm.id, algorithm]));
      return packs.map((pack) => candidateFor(pack, linksByPack.get(pack.id) ?? [], sourcesById, approvalResult.data as readonly ApprovalRow[], releases, algorithmsById, query))
        .filter((candidate): candidate is ClinicalPackageCandidate => Boolean(candidate));
    },
  });
}
