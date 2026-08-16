import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { Sha256Hex } from "./source-types.ts";
import type { ApprovalAttestation, ApprovalDecision, ApprovalManifest, ClinicalApproverIdentity } from "./approval-types.ts";

export type ApprovalPolicyErrorCode = "APPROVER_UNAVAILABLE" | "MANIFEST_MISMATCH" | "APPROVAL_INVALID" | "APPROVAL_REPLAY";
export class ApprovalPolicyError extends Error {
  readonly code: ApprovalPolicyErrorCode;
  constructor(code: ApprovalPolicyErrorCode) { super(code); this.name = "ApprovalPolicyError"; this.code = code; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;

export function hashApprovalManifest(input: Omit<ApprovalManifest, "manifestSha256">): Sha256Hex {
  return createHash("sha256").update(new TextEncoder().encode(canonicalize(input))).digest("hex") as Sha256Hex;
}

export function buildApprovalManifest(input: Omit<ApprovalManifest, "manifestSha256">): ApprovalManifest {
  return { ...input, manifestSha256: hashApprovalManifest(input) };
}

export function verifyApproval(identity: ClinicalApproverIdentity, manifest: ApprovalManifest, input: Readonly<{
  decision: ApprovalDecision;
  requestId: string;
  decidedAt: string;
  withdrawalOf?: string | null;
  allowedSubjects: readonly string[];
}>): ApprovalAttestation {
  if (identity.role !== "clinical_approver" || !UUID.test(identity.subject) || !input.allowedSubjects.includes(identity.subject)) throw new ApprovalPolicyError("APPROVER_UNAVAILABLE");
  const { manifestSha256: _manifestSha256, ...manifestInput } = manifest;
  if (manifest.manifestSha256 !== hashApprovalManifest(manifestInput)) throw new ApprovalPolicyError("MANIFEST_MISMATCH");
  if (!DIGEST.test(manifest.artifactSha256) || !DIGEST.test(manifest.algorithmImplementationSha256) || !DIGEST.test(manifest.sourceSetSha256)
    || !DIGEST.test(manifest.manifestSha256) || !UUID.test(input.requestId) || !Number.isFinite(Date.parse(input.decidedAt))) throw new ApprovalPolicyError("APPROVAL_INVALID");
  const withdrawalOf = input.withdrawalOf ?? null;
  if ((input.decision === "withdrawn") !== (withdrawalOf !== null) || (input.decision !== "withdrawn" && withdrawalOf !== null)) throw new ApprovalPolicyError("APPROVAL_INVALID");
  return {
    attestationVersion: 1, rulePackId: manifest.rulePackId, artifactSha256: manifest.artifactSha256,
    algorithmId: manifest.algorithmId, algorithmImplementationSha256: manifest.algorithmImplementationSha256,
    sourceSetSha256: manifest.sourceSetSha256, manifestSha256: manifest.manifestSha256,
    approverSubject: identity.subject, approverRole: identity.role, decision: input.decision,
    decidedAt: input.decidedAt, requestId: input.requestId, withdrawalOf,
  };
}

export function withdrawApproval(identity: ClinicalApproverIdentity, manifest: ApprovalManifest, input: Readonly<{
  requestId: string; decidedAt: string; priorAttestationId: string; allowedSubjects: readonly string[];
}>): ApprovalAttestation {
  return verifyApproval(identity, manifest, { ...input, decision: "withdrawn", withdrawalOf: input.priorAttestationId });
}
