import type { ApprovalAttestation } from "./approval-types.ts";

export type ApprovalRepository = Readonly<{
  recordAttestation: (attestation: ApprovalAttestation) => Promise<ApprovalAttestation>;
}>;
