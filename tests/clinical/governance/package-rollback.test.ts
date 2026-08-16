import { describe, expect, it, vi } from "vitest";
import { ClinicalRollbackService } from "../../../src/clinical/governance/rollback-service";
import type { ClinicalReleaseRecord } from "../../../src/clinical/governance/release-types";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";

const digest = "a".repeat(64) as Sha256Hex;
const current: ClinicalReleaseRecord = { id: "current", rulePackId: "pack-b", artifactSha256: digest, domain: "growth", countryCode: "CO", locale: "es-CO", status: "active", approvalValid: true, artifactValid: true, algorithmValid: true, sourceValid: true };
const target: ClinicalReleaseRecord = { ...current, id: "prior", rulePackId: "pack-a", status: "superseded" };
const evidence = { evalManifestSha256: digest, sourceSetSha256: digest, algorithmTestVectorSha256: digest };
const input = { current, target, reason: "SAFETY_CORRECTION" as const, requesterSubject: "operator", requestId: "request", activationAt: "2026-01-01T00:00:00.000Z", approvalId: "approval", algorithmId: "algorithm", evidence, evidenceSha256: digest };

describe("verified clinical rollback", () => {
  it("creates a new additive rollback plan for an explicit eligible target", async () => {
    const activate = vi.fn(async () => ({ releaseId: "rollback", status: "active" as const, previewSha256: digest, requestId: "request" }));
    const service = new ClinicalRollbackService({ activate });
    const preview = service.preview(input);
    expect(preview).toMatchObject({ currentReleaseId: "current", targetReleaseId: "prior", reason: "SAFETY_CORRECTION" });
    await expect(service.apply(preview, preview)).resolves.toMatchObject({ releaseId: "rollback" });
  });

  it.each([
    ["withdrawn approval", { target: { ...target, approvalValid: false } }],
    ["corrupt artifact", { target: { ...target, artifactValid: false } }],
    ["cross-country", { target: { ...target, countryCode: "US" } }],
    ["not prior", { target: { ...target, status: "active" as const } }],
  ])("blocks %s", (_label, override) => {
    const service = new ClinicalRollbackService({ activate: vi.fn() });
    expect(() => service.preview({ ...input, ...override })).toThrowError(expect.objectContaining({ code: "RELEASE_PRECONDITION_FAILED" }));
  });

  it("does not mutate old release records", () => { expect(target.id).toBe("prior"); expect(target.status).toBe("superseded"); });
});
