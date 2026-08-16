import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { AlgorithmRegistry, AlgorithmRegistryError, hashAlgorithmManifest } from "../../../src/clinical/governance/algorithm-registry";
import type { ClinicalAlgorithm, AlgorithmIdentity } from "../../../src/clinical/governance/algorithm-types";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";

const implementationSha256 = "1".repeat(64) as Sha256Hex;
const vectors = [{ input: { value: 2 }, output: { doubled: 4 } }] as const;
const vectorDigest = createHash("sha256").update(JSON.stringify(vectors)).digest("hex") as Sha256Hex;
const identity: AlgorithmIdentity = {
  domain: "growth", key: "fixture" as AlgorithmIdentity["key"], version: "1.0.0", implementationSha256,
  supportedArtifactSchemas: ["1"], entrypoint: "fixture.evaluate", runtime: "node24", testVectorSha256: vectorDigest,
};
const algorithm: ClinicalAlgorithm<{ value: number }, { doubled: number }> = {
  identity, goldenVectors: vectors, evaluate: ({ value }) => ({ doubled: value * 2 }),
};

describe("deterministic clinical algorithm registry", () => {
  it("registers once and resolves exact identity/schema", () => {
    const registry = new AlgorithmRegistry().registerAlgorithm(algorithm);
    expect(registry.resolveAlgorithm(identity, "1")).toBe(algorithm);
    expect(() => registry.resolveAlgorithm(identity, "2")).toThrowError(expect.objectContaining({ code: "SCHEMA_INCOMPATIBLE" }));
  });

  it("rejects collisions, retired/missing identities, and digest mismatches", () => {
    const registry = new AlgorithmRegistry().registerAlgorithm(algorithm);
    expect(() => registry.registerAlgorithm(algorithm)).toThrowError(expect.objectContaining({ code: "REGISTRY_COLLISION" }));
    expect(() => registry.resolveAlgorithm({ ...identity, version: "1.0.1" })).toThrowError(expect.objectContaining({ code: "ALGORITHM_UNAVAILABLE" }));
    expect(() => registry.resolveAlgorithm({ ...identity, implementationSha256: "2".repeat(64) as Sha256Hex })).toThrowError(expect.objectContaining({ code: "IMPLEMENTATION_MISMATCH" }));
  });

  it("rejects nondeterministic or wrong golden vectors", () => {
    let counter = 0;
    const nondeterministic = { ...algorithm, evaluate: ({ value }: { value: number }) => ({ doubled: value * 2 + counter++ }) };
    expect(() => new AlgorithmRegistry().registerAlgorithm(nondeterministic)).toThrowError(AlgorithmRegistryError);
    const wrong = { ...algorithm, goldenVectors: [{ input: { value: 2 }, output: { doubled: 9 } }] };
    expect(() => new AlgorithmRegistry().registerAlgorithm(wrong)).toThrowError(expect.objectContaining({ code: "IMPLEMENTATION_MISMATCH" }));
  });

  it("hashes manifests independently of absolute paths and in stable order", () => {
    const first = hashAlgorithmManifest({ algorithmKey: "fixture", version: "1.0.0", runtime: "node24", dependencyPolicy: "policy-1", artifactSchemaVersions: ["1", "2"], files: [
      { role: "entrypoint", sha256: implementationSha256 }, { role: "support", sha256: "2".repeat(64) as Sha256Hex },
    ] });
    const second = hashAlgorithmManifest({ algorithmKey: "fixture", version: "1.0.0", runtime: "node24", dependencyPolicy: "policy-1", artifactSchemaVersions: ["2", "1"], files: [
      { role: "support", sha256: "2".repeat(64) as Sha256Hex }, { role: "entrypoint", sha256: implementationSha256 },
    ] });
    expect(first).toBe(second);
  });
});
