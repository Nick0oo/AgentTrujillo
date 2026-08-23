import type { Sha256Hex } from "./source-types.ts";

export type ApprovalDecision = "approved" | "rejected" | "withdrawn";
export type ApprovalProvenance = "verified_clinical_approver" | "product_owner_conveyed";
export type ClinicalApproverIdentity = Readonly<{
  subject: string;
  role: "clinical_approver";
  displayName: string;
}>;

export type ApprovalManifest = Readonly<{
  rulePackId: string;
  artifactSha256: Sha256Hex;
  algorithmId: string;
  algorithmImplementationSha256: Sha256Hex;
  sourceSetSha256: Sha256Hex;
  artifactSchemaVersion: string;
  domain: string;
  countryCode: string;
  locale: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  manifestSha256: Sha256Hex;
}>;

export type ApprovalAttestation = Readonly<{
  attestationVersion: 1;
  rulePackId: string;
  artifactSha256: Sha256Hex;
  algorithmId: string;
  algorithmImplementationSha256: Sha256Hex;
  sourceSetSha256: Sha256Hex;
  manifestSha256: Sha256Hex;
  approvalProvenance: ApprovalProvenance;
  approverSubject: string | null;
  approverRole: "clinical_approver";
  conveyanceRecordSha256: Sha256Hex | null;
  decision: ApprovalDecision;
  decidedAt: string;
  requestId: string;
  withdrawalOf: string | null;
}>;
