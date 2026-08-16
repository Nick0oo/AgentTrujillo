import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { ClinicalAlgorithm, AlgorithmIdentity, GoldenVector } from "./algorithm-types.ts";
import type { Sha256Hex } from "./source-types.ts";

export type AlgorithmRegistryErrorCode = "ALGORITHM_UNAVAILABLE" | "IMPLEMENTATION_MISMATCH" | "SCHEMA_INCOMPATIBLE" | "REGISTRY_COLLISION";

export class AlgorithmRegistryError extends Error {
  readonly code: AlgorithmRegistryErrorCode;
  constructor(code: AlgorithmRegistryErrorCode) {
    super(code);
    this.name = "AlgorithmRegistryError";
    this.code = code;
  }
}

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const DIGEST = /^[0-9a-f]{64}$/;

function identityKey(identity: Pick<AlgorithmIdentity, "domain" | "key" | "version">): string {
  return `${identity.domain}\u0000${identity.key}\u0000${identity.version}`;
}

function assertIdentity(identity: AlgorithmIdentity): void {
  if (!identity.domain || !identity.key || !SEMVER.test(identity.version) || !DIGEST.test(identity.implementationSha256)
    || !DIGEST.test(identity.testVectorSha256) || !identity.entrypoint || !identity.runtime
    || identity.supportedArtifactSchemas.length === 0) throw new AlgorithmRegistryError("ALGORITHM_UNAVAILABLE");
}

export function hashGoldenVectors<I, O>(vectors: readonly GoldenVector<I, O>[]): Sha256Hex {
  const bytes = new TextEncoder().encode(canonicalize(vectors));
  return createHash("sha256").update(bytes).digest("hex") as Sha256Hex;
}

function stableEqual(left: unknown, right: unknown): boolean {
  try { return canonicalize(left) === canonicalize(right); } catch { return false; }
}

function validateGoldenVectors<I, O>(algorithm: ClinicalAlgorithm<I, O>): void {
  if (hashGoldenVectors(algorithm.goldenVectors) !== algorithm.identity.testVectorSha256) {
    throw new AlgorithmRegistryError("IMPLEMENTATION_MISMATCH");
  }
  for (const vector of algorithm.goldenVectors) {
    const first = algorithm.evaluate(vector.input);
    const second = algorithm.evaluate(vector.input);
    if (!stableEqual(first, vector.output) || !stableEqual(first, second)) throw new AlgorithmRegistryError("IMPLEMENTATION_MISMATCH");
  }
}

export class AlgorithmRegistry {
  readonly #algorithms: readonly ClinicalAlgorithm<unknown, unknown>[];

  constructor(algorithms: readonly ClinicalAlgorithm<unknown, unknown>[] = []) {
    this.#algorithms = Object.freeze([...algorithms]);
    Object.freeze(this);
  }

  registerAlgorithm<I, O>(algorithm: ClinicalAlgorithm<I, O>): AlgorithmRegistry {
    assertIdentity(algorithm.identity);
    validateGoldenVectors(algorithm);
    if (this.#algorithms.some((candidate) => identityKey(candidate.identity) === identityKey(algorithm.identity))) {
      throw new AlgorithmRegistryError("REGISTRY_COLLISION");
    }
    return new AlgorithmRegistry([...this.#algorithms, algorithm as ClinicalAlgorithm<unknown, unknown>]);
  }

  resolveAlgorithm(identity: AlgorithmIdentity, artifactSchemaVersion = "1"): ClinicalAlgorithm<unknown, unknown> {
    const algorithm = this.#algorithms.find((candidate) => identityKey(candidate.identity) === identityKey(identity));
    if (!algorithm) throw new AlgorithmRegistryError("ALGORITHM_UNAVAILABLE");
    if (algorithm.identity.implementationSha256 !== identity.implementationSha256
      || algorithm.identity.testVectorSha256 !== identity.testVectorSha256) throw new AlgorithmRegistryError("IMPLEMENTATION_MISMATCH");
    if (!algorithm.identity.supportedArtifactSchemas.includes(artifactSchemaVersion as (typeof algorithm.identity.supportedArtifactSchemas)[number])) throw new AlgorithmRegistryError("SCHEMA_INCOMPATIBLE");
    return algorithm;
  }

  get size(): number { return this.#algorithms.length; }
}

export function registerAlgorithm<I, O>(registry: AlgorithmRegistry, algorithm: ClinicalAlgorithm<I, O>): AlgorithmRegistry {
  return registry.registerAlgorithm(algorithm);
}

export function resolveAlgorithm(registry: AlgorithmRegistry, identity: AlgorithmIdentity, artifactSchemaVersion = "1") {
  return registry.resolveAlgorithm(identity, artifactSchemaVersion);
}

export type AlgorithmManifest = Readonly<{
  algorithmKey: string;
  version: string;
  runtime: string;
  dependencyPolicy: string;
  artifactSchemaVersions: readonly string[];
  files: readonly Readonly<{ role: string; sha256: Sha256Hex }>[];
}>;

export function hashAlgorithmManifest(manifest: AlgorithmManifest): Sha256Hex {
  const canonical = canonicalize({
    algorithmKey: manifest.algorithmKey,
    version: manifest.version,
    runtime: manifest.runtime,
    dependencyPolicy: manifest.dependencyPolicy,
    artifactSchemaVersions: [...manifest.artifactSchemaVersions].sort(),
    files: [...manifest.files].sort((left, right) => left.role.localeCompare(right.role)),
  });
  return createHash("sha256").update(new TextEncoder().encode(canonical)).digest("hex") as Sha256Hex;
}
