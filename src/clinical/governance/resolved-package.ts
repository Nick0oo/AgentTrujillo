import type { AlgorithmIdentity } from "./algorithm-types.ts";
import type { ApprovalAttestation } from "./approval-types.ts";
import type { ClinicalDomain, CountryCode, ClinicalSourceReference, Sha256Hex } from "./source-types.ts";

declare const resolvedClinicalPackageBrand: unique symbol;
export type ResolvedClinicalPackage<T = unknown> = Readonly<{
  packId: string;
  domain: ClinicalDomain;
  countryCode: CountryCode;
  locale: string;
  version: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  artifactSha256: Sha256Hex;
  algorithm: AlgorithmIdentity;
  approval: ApprovalAttestation;
  sources: readonly ClinicalSourceReference[];
  payload: Readonly<T>;
  readonly [resolvedClinicalPackageBrand]: true;
}>;
