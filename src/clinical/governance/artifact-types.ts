import type { ClinicalDomain, CountryCode, Sha256Hex } from "./source-types";

export type AlgorithmReference = Readonly<{
  key: string;
  version: string;
  implementationSha256: Sha256Hex;
  supportedSchemaVersion: "1";
}>;

export type SourceDigestReference = Readonly<{
  sourceId: string;
  purpose: string;
  artifactSha256: Sha256Hex;
}>;

export type RulePackHeader = Readonly<{
  schemaVersion: "1";
  domain: ClinicalDomain;
  countryCode: CountryCode;
  locale: string;
  version: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  algorithm: AlgorithmReference;
  sourceReferences: readonly SourceDigestReference[];
  payloadSchema: string;
}>;

export type ArtifactLimits = Readonly<{
  maxBytes: number;
  maxDepth: number;
  maxNodes: number;
}>;

export type RulePackFixture = Readonly<Record<string, unknown>>;

export type RulePackArtifactV1<T = unknown> = Readonly<{
  schemaVersion: "1";
  header: RulePackHeader;
  payload: T;
  fixtures: readonly RulePackFixture[];
}>;
