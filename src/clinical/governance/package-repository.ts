import type { AlgorithmIdentity, ClinicalAlgorithm } from "./algorithm-types.ts";
import type { ApprovalAttestation } from "./approval-types.ts";
import type { ClinicalArtifactLocation } from "./artifact-store.ts";
import type { ClinicalSourceReference, ClinicalDomain, CountryCode, Sha256Hex } from "./source-types.ts";

export type ClinicalPackageQuery = Readonly<{
  domain: ClinicalDomain;
  countryCode: CountryCode;
  locale: string;
  referenceDate: string;
  artifactSchemaVersion: string;
}>;

export type ClinicalPackageCandidate = Readonly<{
  pack: Readonly<{
    id: string; domain: ClinicalDomain; countryCode: CountryCode; version: string; locale: string;
    status: string; effectiveFrom: string; effectiveUntil: string | null; artifactSha256: Sha256Hex;
  }>;
  location: ClinicalArtifactLocation;
  sources: readonly ClinicalSourceReference[];
  sourceSetSha256: Sha256Hex;
  approval: ApprovalAttestation | null;
  algorithm: Readonly<{ status: string; identity: AlgorithmIdentity; implementation?: ClinicalAlgorithm<unknown, unknown> }>;
  release: Readonly<{ status: string; artifactSha256: Sha256Hex }> | null;
}>;

export type ClinicalPackageRepository = Readonly<{
  findCandidates: (query: ClinicalPackageQuery, signal?: AbortSignal) => Promise<readonly ClinicalPackageCandidate[]>;
}>;
