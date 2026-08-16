import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { AlgorithmRegistry } from "../../../src/clinical/governance/algorithm-registry";
import { canonicalizeRulePackArtifact } from "../../../src/clinical/governance/canonicalize-artifact";
import { verifyArtifactBytes } from "../../../src/clinical/governance/checksum";
import { ClinicalPackageResolver, type ResolveResult } from "../../../src/clinical/governance/package-resolver";
import type { ClinicalPackageCandidate } from "../../../src/clinical/governance/package-repository";
import type { ClinicalAlgorithm } from "../../../src/clinical/governance/algorithm-types";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";

const digest = "a".repeat(64) as Sha256Hex;
const vectors = [{ input: { value: 2 }, output: { doubled: 4 } }] as const;
const vectorDigest = createHash("sha256").update(JSON.stringify(vectors)).digest("hex") as Sha256Hex;
const algorithm: ClinicalAlgorithm<{ value: number }, { doubled: number }> = { identity: { domain: "growth", key: "fixture" as never, version: "1.0.0", implementationSha256: digest, supportedArtifactSchemas: ["1"], entrypoint: "fixture.evaluate", runtime: "node24", testVectorSha256: vectorDigest }, goldenVectors: vectors, evaluate: ({ value }) => ({ doubled: value * 2 }) };
const artifact = { schemaVersion: "1" as const, header: { schemaVersion: "1" as const, domain: "growth" as const, countryCode: "CO" as const, locale: "es-CO", version: "1.0.0", effectiveFrom: "2026-01-01", effectiveUntil: null, algorithm: { key: "fixture", version: "1.0.0", implementationSha256: digest, supportedSchemaVersion: "1" as const }, sourceReferences: [{ sourceId: "s", purpose: "normative", artifactSha256: digest }], payloadSchema: "fixture.v1" }, payload: { result: "ok" }, fixtures: [] };
const bytes = canonicalizeRulePackArtifact(artifact);
const artifactDigest = createHash("sha256").update(bytes).digest("hex") as Sha256Hex;
const verified = verifyArtifactBytes(bytes, artifactDigest);
const source = { id: "s", authority: "WHO" as const, jurisdiction: "CO" as const, domain: "growth" as const, title: "fixture", sourceUri: "https://www.who.int/fixture", citation: null, publishedAt: null, retrievedAt: "2026-01-01T00:00:00.000Z", effectiveFrom: "2026-01-01", effectiveUntil: null, license: "fixture", artifactSha256: digest, status: "approved" as const };
const sourceSetSha256 = createHash("sha256").update(JSON.stringify([{ artifactSha256: digest, id: "s", status: "approved" }])).digest("hex") as Sha256Hex;
const candidate: ClinicalPackageCandidate = { pack: { id: "pack", domain: "growth", countryCode: "CO", version: "1.0.0", locale: "es-CO", status: "active", effectiveFrom: "2026-01-01", effectiveUntil: null, artifactSha256: artifactDigest }, location: { bucket: "clinical-sources", path: `v1/growth/CO/${artifactDigest}.json`, artifactSha256: artifactDigest }, sources: [source], sourceSetSha256, approval: { attestationVersion: 1, rulePackId: "pack", artifactSha256: artifactDigest, algorithmId: "fixture", algorithmImplementationSha256: digest, sourceSetSha256, manifestSha256: digest, approverSubject: "subject", approverRole: "clinical_approver", decision: "approved", decidedAt: "2026-01-01T00:00:00.000Z", requestId: "request", withdrawalOf: null }, algorithm: { status: "active", identity: algorithm.identity, implementation: algorithm as never }, release: { status: "active", artifactSha256: artifactDigest } };

function makeResolver(overrides: Partial<ClinicalPackageCandidate> = {}) {
  const repository = { findCandidates: vi.fn(async () => [{ ...candidate, ...overrides }]) };
  const store = { getVerifiedArtifact: vi.fn(async () => verified), putVerifiedArtifact: vi.fn() };
  const scope = { jobName: "clinical-artifact-storage", invocationId: "resolver", allowedOperations: ["maintenance:retention"], issuedAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 60_000) } as never;
  return { resolver: new ClinicalPackageResolver({ repository, store: store as never, algorithms: new AlgorithmRegistry().registerAlgorithm(algorithm as never), scope }), repository, store };
}

describe("approved clinical package resolver", () => {
  it("resolves one complete immutable package and caches only success", async () => {
    const { resolver, repository } = makeResolver();
    const first = await resolver.resolve({ domain: "growth", countryCode: "CO", locale: "es-CO", referenceDate: "2026-06-01", artifactSchemaVersion: "1" });
    expect(first.ok).toBe(true);
    if (first.ok) { expect(first.value.payload).toEqual({ result: "ok" }); expect(Object.isFrozen(first.value)).toBe(true); }
    await resolver.resolve({ domain: "growth", countryCode: "CO", locale: "es-CO", referenceDate: "2026-06-01", artifactSchemaVersion: "1" });
    expect(repository.findCandidates).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["withdrawn approval", { approval: { ...candidate.approval!, decision: "withdrawn" as const, withdrawalOf: "prior" } }, "APPROVAL_UNAVAILABLE"],
    ["retired release", { release: { status: "retired", artifactSha256: artifactDigest } }, "NO_CANDIDATE"],
    ["source mismatch", { sourceSetSha256: "b".repeat(64) as Sha256Hex }, "SOURCE_UNAVAILABLE"],
  ])("fails closed for %s", async (_label, overrides, reason) => {
    const { resolver } = makeResolver(overrides);
    const result = await resolver.resolve({ domain: "growth", countryCode: "CO", locale: "es-CO", referenceDate: "2026-06-01", artifactSchemaVersion: "1" });
    expect(result).toMatchObject({ ok: false, code: "RULE_UNAVAILABLE", reason });
  });

  it("does not fallback across country/date or cache failures", async () => {
    const { resolver, repository } = makeResolver({ pack: { ...candidate.pack, countryCode: "US" } });
    const query = { domain: "growth" as const, countryCode: "CO" as const, locale: "es-CO", referenceDate: "2026-06-01", artifactSchemaVersion: "1" };
    const first = await resolver.resolve(query);
    const second = await resolver.resolve(query);
    expect(first).toMatchObject({ ok: false, reason: "NO_CANDIDATE" }); expect(second).toMatchObject({ ok: false, reason: "NO_CANDIDATE" });
    expect(repository.findCandidates).toHaveBeenCalledTimes(2);
  });
});
