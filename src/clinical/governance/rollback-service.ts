import { ClinicalReleaseService, ReleaseError } from "./release-service.ts";
import type { ClinicalReleaseRepository } from "./release-repository.ts";
import type { ClinicalReleaseEvidence, ClinicalReleasePlan, ClinicalReleaseRecord, ClinicalReleaseResult } from "./release-types.ts";
import type { Sha256Hex } from "./source-types.ts";

export type RollbackReasonCode = "SAFETY_CORRECTION" | "SOURCE_WITHDRAWAL" | "INTEGRITY_INCIDENT" | "OPERATIONAL_REGRESSION";
export type ClinicalRollbackPlan = Readonly<{ plan: ClinicalReleasePlan; evidence: ClinicalReleaseEvidence; previewSha256: Sha256Hex; reason: RollbackReasonCode; currentReleaseId: string; targetReleaseId: string }>;

export class ClinicalRollbackService {
  readonly #release: ClinicalReleaseService;
  constructor(repository: ClinicalReleaseRepository) { this.#release = new ClinicalReleaseService(repository); }
  preview(input: Readonly<{ current: ClinicalReleaseRecord; target: ClinicalReleaseRecord; reason: RollbackReasonCode; requesterSubject: string; requestId: string; activationAt: string; approvalId: string; algorithmId: string; evidence: ClinicalReleaseEvidence; evidenceSha256: Sha256Hex }>): ClinicalRollbackPlan {
    const { current, target } = input;
    if (current.id === target.id || target.status !== "superseded" || current.domain !== target.domain || current.countryCode !== target.countryCode || current.locale !== target.locale
      || !target.approvalValid || !target.artifactValid || !target.algorithmValid || !target.sourceValid) throw new ReleaseError("RELEASE_PRECONDITION_FAILED");
    const plan: ClinicalReleasePlan = { rulePackId: target.rulePackId, artifactSha256: target.artifactSha256, algorithmId: input.algorithmId, approvalId: input.approvalId, domain: target.domain, countryCode: target.countryCode, locale: target.locale, activationAt: input.activationAt, previousReleaseId: current.id, evidenceSha256: input.evidenceSha256, requesterSubject: input.requesterSubject, requestId: input.requestId, action: "rollback" };
    const preview = this.#release.preview(plan, input.evidence);
    return { ...preview, reason: input.reason, currentReleaseId: current.id, targetReleaseId: target.id };
  }
  apply(preview: ClinicalRollbackPlan, current: ClinicalRollbackPlan): Promise<ClinicalReleaseResult> { return this.#release.apply(preview, { plan: current.plan, evidence: current.evidence }); }
}
