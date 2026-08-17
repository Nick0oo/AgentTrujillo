import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MeasurementCandidate } from "./validate-measurement.ts";
import { buildMeasurementFingerprint, type FingerprintKey, type MeasurementFingerprint } from "./measurement-fingerprint.ts";

export type DuplicateLookup = Readonly<{
  findByIdempotency: (scope: AuthorizedChildScope, requestId: string) => Promise<Readonly<{ fingerprint: string; candidate: MeasurementCandidate }> | null>;
  findLikelyDuplicates: (scope: AuthorizedChildScope, candidate: MeasurementCandidate) => Promise<readonly Readonly<{ id: string; fingerprint: string }>[] >;
}>;

export type DuplicateDecision = Readonly<{
  outcome: "new" | "idempotent_replay" | "idempotency_conflict" | "semantic_duplicate_review";
  fingerprint: MeasurementFingerprint;
  candidateIds: readonly string[];
}>;

export async function detectMeasurementDuplicate(
  scope: AuthorizedChildScope,
  candidate: MeasurementCandidate,
  repository: DuplicateLookup,
  requestId: string,
  key: FingerprintKey,
): Promise<DuplicateDecision> {
  const fingerprint = buildMeasurementFingerprint(scope, candidate, key);
  const exact = await repository.findByIdempotency(scope, requestId);
  if (exact) return Object.freeze({
    outcome: exact.fingerprint === fingerprint.digest ? "idempotent_replay" : "idempotency_conflict",
    fingerprint,
    candidateIds: [],
  });
  const likely = (await repository.findLikelyDuplicates(scope, candidate)).slice(0, 5);
  return Object.freeze({
    outcome: likely.length > 0 ? "semantic_duplicate_review" : "new",
    fingerprint,
    candidateIds: Object.freeze(likely.map((row) => row.id)),
  });
}

export type { FingerprintKey, MeasurementFingerprint } from "./measurement-fingerprint.ts";
