import type { Sha256Hex } from "./source-types.ts";

export type AlgorithmKey = string & { readonly __algorithmKey: unique symbol };
export type AlgorithmStatus = "draft" | "approved" | "active" | "retired";
export type ArtifactSchemaVersion = `v${number}` | `${number}`;

export type AlgorithmIdentity = Readonly<{
  domain: string;
  key: AlgorithmKey;
  version: string;
  implementationSha256: Sha256Hex;
  supportedArtifactSchemas: readonly ArtifactSchemaVersion[];
  entrypoint: string;
  runtime: string;
  testVectorSha256: Sha256Hex;
}>;

export type GoldenVector<I, O> = Readonly<{ input: I; output: O }>;

export type ClinicalAlgorithm<I, O> = Readonly<{
  identity: AlgorithmIdentity;
  evaluate: (input: I) => O;
  goldenVectors: readonly GoldenVector<I, O>[];
}>;
