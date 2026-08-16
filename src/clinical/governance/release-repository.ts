import type { ClinicalReleasePlan, ClinicalReleaseResult } from "./release-types.ts";

export type ClinicalReleaseRepository = Readonly<{
  activate: (plan: ClinicalReleasePlan, previewSha256: string) => Promise<ClinicalReleaseResult>;
}>;
