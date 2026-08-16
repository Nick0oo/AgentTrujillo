import type { Sha256Hex } from "./source-types.ts";

export type ClinicalReleaseAction = "release" | "rollback";
export type ClinicalReleaseStatus = "active" | "superseded";
export type ClinicalReleasePlan = Readonly<{
  rulePackId: string; artifactSha256: Sha256Hex; algorithmId: string; approvalId: string;
  domain: string; countryCode: string; locale: string; activationAt: string;
  previousReleaseId: string | null; evidenceSha256: Sha256Hex; requesterSubject: string;
  requestId: string; action: ClinicalReleaseAction;
}>;
export type ClinicalReleaseEvidence = Readonly<{ evalManifestSha256: Sha256Hex; sourceSetSha256: Sha256Hex; algorithmTestVectorSha256: Sha256Hex }>;
export type ClinicalReleaseResult = Readonly<{ releaseId: string; status: ClinicalReleaseStatus; previewSha256: Sha256Hex; requestId: string }>;
export type ClinicalReleaseRecord = Readonly<{ id: string; rulePackId: string; artifactSha256: Sha256Hex; domain: string; countryCode: string; locale: string; status: ClinicalReleaseStatus; approvalValid: boolean; artifactValid: boolean; algorithmValid: boolean; sourceValid: boolean }>;
