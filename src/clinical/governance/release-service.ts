import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { ClinicalReleasePlan, ClinicalReleaseEvidence, ClinicalReleaseResult } from "./release-types.ts";
import type { ClinicalReleaseRepository } from "./release-repository.ts";
import type { Sha256Hex } from "./source-types.ts";

export type ReleaseErrorCode = "RELEASE_PRECONDITION_FAILED" | "STALE_PREVIEW" | "RELEASE_REPLAY";
export class ReleaseError extends Error { readonly code: ReleaseErrorCode; constructor(code: ReleaseErrorCode) { super(code); this.name = "ReleaseError"; this.code = code; } }

function digest(value: unknown): Sha256Hex { return createHash("sha256").update(new TextEncoder().encode(canonicalize(value))).digest("hex") as Sha256Hex; }

export class ClinicalReleaseService {
  readonly #repository: ClinicalReleaseRepository;
  constructor(repository: ClinicalReleaseRepository) { this.#repository = repository; }
  preview(plan: ClinicalReleasePlan, evidence: ClinicalReleaseEvidence): Readonly<{ plan: ClinicalReleasePlan; evidence: ClinicalReleaseEvidence; previewSha256: Sha256Hex }> {
    if (!plan.rulePackId || !plan.artifactSha256 || !plan.algorithmId || !plan.approvalId || !plan.requesterSubject || !plan.requestId || !plan.activationAt) throw new ReleaseError("RELEASE_PRECONDITION_FAILED");
    return Object.freeze({ plan, evidence, previewSha256: digest({ plan, evidence }) });
  }
  async apply(preview: Readonly<{ plan: ClinicalReleasePlan; evidence: ClinicalReleaseEvidence; previewSha256: Sha256Hex }>, current: Readonly<{ plan: ClinicalReleasePlan; evidence: ClinicalReleaseEvidence }>): Promise<ClinicalReleaseResult> {
    const currentDigest = digest(current);
    if (currentDigest !== preview.previewSha256) throw new ReleaseError("STALE_PREVIEW");
    return this.#repository.activate(preview.plan, preview.previewSha256);
  }
}
