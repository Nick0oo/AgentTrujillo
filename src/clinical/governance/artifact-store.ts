import type { PrivilegedJobScope } from "../../../agent/lib/supabase/privileged-job-scope.ts";
import type { VerifiedRulePackArtifact } from "./checksum.ts";
import type { ClinicalDomain, CountryCode, Sha256Hex } from "./source-types.ts";

export const CLINICAL_SOURCES_BUCKET = "clinical-sources" as const;
export const CLINICAL_ARTIFACT_MAX_BYTES = 5 * 1024 * 1024;

export type ClinicalArtifactLocation = Readonly<{
  bucket: typeof CLINICAL_SOURCES_BUCKET;
  path: `v1/${ClinicalDomain}/${CountryCode}/${Sha256Hex}.json`;
  artifactSha256: Sha256Hex;
}>;

export type ClinicalArtifactStoreErrorCode = "OBJECT_CONFLICT" | "OBJECT_MISSING" | "STORAGE_UNAVAILABLE" | "CONTENT_INVALID";

export class ClinicalArtifactStoreError extends Error {
  readonly code: ClinicalArtifactStoreErrorCode;
  constructor(code: ClinicalArtifactStoreErrorCode) {
    super(code);
    this.name = "ClinicalArtifactStoreError";
    this.code = code;
  }
}

export type ClinicalArtifactStore = Readonly<{
  putVerifiedArtifact: <T>(scope: PrivilegedJobScope, artifact: VerifiedRulePackArtifact<T>, signal?: AbortSignal) => Promise<ClinicalArtifactLocation>;
  getVerifiedArtifact: <T>(scope: PrivilegedJobScope, location: ClinicalArtifactLocation, expectedDigest: Sha256Hex, signal?: AbortSignal) => Promise<VerifiedRulePackArtifact<T>>;
}>;

export function clinicalArtifactPath(domain: ClinicalDomain, countryCode: CountryCode, digest: Sha256Hex): ClinicalArtifactLocation["path"] {
  if (!/^(growth|immunization|medication|development|nutrition|emergency)$/.test(domain)
    || !/^(CO|US|GLOBAL)$/.test(countryCode) || !/^[0-9a-f]{64}$/.test(digest)) throw new ClinicalArtifactStoreError("CONTENT_INVALID");
  return `v1/${domain}/${countryCode}/${digest}.json`;
}
