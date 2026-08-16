import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { describe, expect, it, vi } from "vitest";
import { ClinicalReleaseService, ReleaseError } from "../../../src/clinical/governance/release-service";
import type { ClinicalReleasePlan } from "../../../src/clinical/governance/release-types";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";

const digest = "a".repeat(64) as Sha256Hex;
const plan: ClinicalReleasePlan = { rulePackId: "pack", artifactSha256: digest, algorithmId: "algorithm", approvalId: "approval", domain: "growth", countryCode: "CO", locale: "es-CO", activationAt: "2026-01-01T00:00:00.000Z", previousReleaseId: null, evidenceSha256: digest, requesterSubject: "00000000-0000-4000-8000-000000000804", requestId: "00000000-0000-4000-8000-000000000806", action: "release" };
const evidence = { evalManifestSha256: digest, sourceSetSha256: digest, algorithmTestVectorSha256: digest };

describe("audited clinical release workflow", () => {
  it("preview/apply uses identical evidence and replays idempotently", async () => {
    const activate = vi.fn(async (_plan: ClinicalReleasePlan, previewSha256: string) => ({ releaseId: "release", status: "active" as const, previewSha256: previewSha256 as Sha256Hex, requestId: plan.requestId }));
    const service = new ClinicalReleaseService({ activate });
    const preview = service.preview(plan, evidence);
    await expect(service.apply(preview, { plan, evidence })).resolves.toMatchObject({ releaseId: "release", status: "active" });
    await service.apply(preview, { plan, evidence });
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it("blocks stale/mutated previews and requires explicit plan identity", async () => {
    const service = new ClinicalReleaseService({ activate: vi.fn() });
    const preview = service.preview(plan, evidence);
    await expect(service.apply(preview, { plan: { ...plan, countryCode: "US" }, evidence })).rejects.toThrowError(expect.objectContaining({ code: "STALE_PREVIEW" }));
    expect(() => service.preview({ ...plan, requestId: "" }, evidence)).toThrowError(ReleaseError);
  });

  it("keeps preview digest deterministic", () => {
    const service = new ClinicalReleaseService({ activate: vi.fn() });
    const preview = service.preview(plan, evidence);
    expect(preview.previewSha256).toBe(createHash("sha256").update(canonicalize({ plan, evidence })).digest("hex"));
  });
});
