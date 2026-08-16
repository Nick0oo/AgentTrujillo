import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { AlgorithmRegistry } from "./algorithm-registry.ts";
import type { ClinicalArtifactStore } from "./artifact-store.ts";
import type { ApprovalAttestation } from "./approval-types.ts";
import type { ClinicalPackageCandidate, ClinicalPackageQuery, ClinicalPackageRepository } from "./package-repository.ts";
import type { ResolvedClinicalPackage } from "./resolved-package.ts";
import type { Sha256Hex } from "./source-types.ts";
import type { PrivilegedJobScope } from "../../../agent/lib/supabase/privileged-job-scope.ts";

export type RuleUnavailableReason = "NO_CANDIDATE" | "AMBIGUOUS_CANDIDATE" | "IDENTITY_MISMATCH" | "SOURCE_UNAVAILABLE" | "APPROVAL_UNAVAILABLE" | "RELEASE_UNAVAILABLE" | "ALGORITHM_UNAVAILABLE" | "ARTIFACT_UNAVAILABLE" | "CANCELLED";
export type RuleUnavailable = Readonly<{ ok: false; code: "RULE_UNAVAILABLE"; reason: RuleUnavailableReason }>;
export type ResolveResult<T> = { ok: true; value: ResolvedClinicalPackage<T> } | RuleUnavailable;

function failure(reason: RuleUnavailableReason): RuleUnavailable { return { ok: false, code: "RULE_UNAVAILABLE", reason }; }

function sourceSetDigest(candidate: ClinicalPackageCandidate): Sha256Hex {
  const sourceSet = candidate.sources.map((source) => ({ id: source.id ?? source.sourceId ?? "", artifactSha256: source.artifactSha256, status: source.status })).sort((left, right) => left.artifactSha256.localeCompare(right.artifactSha256));
  return createHash("sha256").update(new TextEncoder().encode(canonicalize(sourceSet))).digest("hex") as Sha256Hex;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function exactCandidate(candidate: ClinicalPackageCandidate, query: ClinicalPackageQuery): boolean {
  const { pack } = candidate;
  return pack.status === "active" && pack.domain === query.domain && pack.countryCode === query.countryCode && pack.locale === query.locale
    && pack.effectiveFrom <= query.referenceDate && (pack.effectiveUntil === null || pack.effectiveUntil >= query.referenceDate)
    && candidate.release?.status === "active" && candidate.release.artifactSha256 === pack.artifactSha256;
}

function approvalMatches(approval: ApprovalAttestation, candidate: ClinicalPackageCandidate): boolean {
  return approval.decision === "approved" && approval.withdrawalOf === null && approval.rulePackId === candidate.pack.id
    && approval.artifactSha256 === candidate.pack.artifactSha256
    && approval.algorithmId === candidate.algorithm.identity.key
    && approval.algorithmImplementationSha256 === candidate.algorithm.identity.implementationSha256
    && approval.sourceSetSha256 === candidate.sourceSetSha256;
}

export class ClinicalPackageResolver {
  readonly #repository: ClinicalPackageRepository;
  readonly #store: ClinicalArtifactStore;
  readonly #algorithms: AlgorithmRegistry;
  readonly #scope: PrivilegedJobScope;
  readonly #cache = new Map<string, { expiresAt: number; value: ResolvedClinicalPackage<unknown> }>();
  readonly #cacheTtlMs: number;

  constructor(input: Readonly<{ repository: ClinicalPackageRepository; store: ClinicalArtifactStore; algorithms: AlgorithmRegistry; scope: PrivilegedJobScope; cacheTtlMs?: number }>) {
    this.#repository = input.repository;
    this.#store = input.store;
    this.#algorithms = input.algorithms;
    this.#scope = input.scope;
    this.#cacheTtlMs = Math.min(Math.max(input.cacheTtlMs ?? 5 * 60 * 1000, 0), 5 * 60 * 1000);
  }

  invalidate(): void { this.#cache.clear(); }

  async resolve<T>(query: ClinicalPackageQuery, signal?: AbortSignal): Promise<ResolveResult<T>> {
    if (signal?.aborted) return failure("CANCELLED");
    const key = `${query.domain}|${query.countryCode}|${query.locale}|${query.referenceDate}|${query.artifactSchemaVersion}`;
    const cached = this.#cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return { ok: true, value: cached.value as ResolvedClinicalPackage<T> };
    this.#cache.delete(key);
    let candidates: readonly ClinicalPackageCandidate[];
    try { candidates = await this.#repository.findCandidates(query, signal); } catch { return failure(signal?.aborted ? "CANCELLED" : "NO_CANDIDATE"); }
    const eligible = candidates.filter((candidate) => exactCandidate(candidate, query));
    if (eligible.length === 0) return failure("NO_CANDIDATE");
    if (eligible.length !== 1) return failure("AMBIGUOUS_CANDIDATE");
    const candidate = eligible[0];
    if (candidate.sources.length === 0 || candidate.sources.some((source) => source.status !== "approved" || (source.jurisdiction !== query.countryCode && source.jurisdiction !== "GLOBAL"))
      || sourceSetDigest(candidate) !== candidate.sourceSetSha256) return failure("SOURCE_UNAVAILABLE");
    if (!candidate.approval || !approvalMatches(candidate.approval, candidate)) return failure("APPROVAL_UNAVAILABLE");
    let verified;
    try { verified = await this.#store.getVerifiedArtifact<T>(this.#scope, candidate.location, candidate.pack.artifactSha256, signal); } catch { return failure(signal?.aborted ? "CANCELLED" : "ARTIFACT_UNAVAILABLE"); }
    const header = verified.artifact.header;
    if (header.domain !== query.domain || header.countryCode !== query.countryCode || header.locale !== query.locale || header.version !== candidate.pack.version
      || header.effectiveFrom !== candidate.pack.effectiveFrom || header.effectiveUntil !== candidate.pack.effectiveUntil
      || header.algorithm.key !== candidate.algorithm.identity.key || header.algorithm.implementationSha256 !== candidate.algorithm.identity.implementationSha256) return failure("IDENTITY_MISMATCH");
    try { this.#algorithms.resolveAlgorithm(candidate.algorithm.identity, query.artifactSchemaVersion); } catch { return failure("ALGORITHM_UNAVAILABLE"); }
    const result = deepFreeze({ packId: candidate.pack.id, domain: candidate.pack.domain, countryCode: candidate.pack.countryCode, locale: candidate.pack.locale,
      version: candidate.pack.version, effectiveFrom: candidate.pack.effectiveFrom, effectiveUntil: candidate.pack.effectiveUntil,
      artifactSha256: candidate.pack.artifactSha256, algorithm: candidate.algorithm.identity, approval: candidate.approval,
      sources: candidate.sources, payload: verified.artifact.payload }) as ResolvedClinicalPackage<T>;
    this.#cache.set(key, { expiresAt: Date.now() + this.#cacheTtlMs, value: result as ResolvedClinicalPackage<unknown> });
    return { ok: true, value: result };
  }
}
