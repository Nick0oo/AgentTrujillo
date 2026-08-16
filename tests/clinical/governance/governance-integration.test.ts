import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalizeRulePackArtifact, parseRulePackArtifact } from "../../../src/clinical/governance/canonicalize-artifact";
import { ChecksumError, verifyArtifactBytes } from "../../../src/clinical/governance/checksum";
import { buildApprovalManifest, verifyApproval } from "../../../src/clinical/governance/approval-policy";
import { ClinicalReleaseService } from "../../../src/clinical/governance/release-service";
import { ClinicalRollbackService } from "../../../src/clinical/governance/rollback-service";
import { resolvePackageForContext } from "../../../src/clinical/governance/selection-policy";
import { clinicalArtifactPath } from "../../../src/clinical/governance/artifact-store";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";

const digest = "a".repeat(64) as Sha256Hex;
const artifact = { schemaVersion: "1" as const, header: { schemaVersion: "1" as const, domain: "growth" as const, countryCode: "CO" as const, locale: "es-CO", version: "1.0.0", effectiveFrom: "2026-01-01", effectiveUntil: null, algorithm: { key: "fixture", version: "1.0.0", implementationSha256: digest, supportedSchemaVersion: "1" as const }, sourceReferences: [{ sourceId: "source", purpose: "normative", artifactSha256: digest }], payloadSchema: "fixture.v1" }, payload: { rule: "synthetic" }, fixtures: [] };

describe("clinical governance integration gates", () => {
  it("valid graph canonicalizes and one-byte mutation is unavailable", () => {
    const bytes = canonicalizeRulePackArtifact(artifact);
    const digestBytes = createHash("sha256").update(bytes).digest("hex");
    expect(verifyArtifactBytes(bytes, digestBytes).artifact.payload).toEqual({ rule: "synthetic" });
    const mutated = Uint8Array.from(bytes); mutated[mutated.length - 1] ^= 1;
    expect(() => verifyArtifactBytes(mutated, createHash("sha256").update(mutated).digest("hex"))).toThrowError(ChecksumError);
  });

  it.each([
    ["duplicate key", () => parseRulePackArtifact('{"schemaVersion":"1","schemaVersion":"1"}')],
    ["unknown field", () => parseRulePackArtifact({ ...artifact, injectedTool: "storage_download" })],
    ["executable payload", () => parseRulePackArtifact({ ...artifact, payload: { execute: () => "no" } })],
  ])("rejects %s control-plane mutation", (_label, action) => { expect(action).toThrow(); });

  it("approval cannot be forged by display name or prompt claim", () => {
    const manifest = buildApprovalManifest({ rulePackId: "pack", artifactSha256: digest, algorithmId: "algorithm", algorithmImplementationSha256: digest, sourceSetSha256: digest, artifactSchemaVersion: "1", domain: "growth", countryCode: "CO", locale: "es-CO", effectiveFrom: "2026-01-01", effectiveUntil: null });
    expect(() => verifyApproval({ subject: "00000000-0000-4000-8000-000000000001", role: "clinical_approver", displayName: "Dr. Trujillo" }, manifest, { decision: "approved", requestId: "00000000-0000-4000-8000-000000000002", decidedAt: "2026-01-01T00:00:00Z", allowedSubjects: [] })).toThrow();
  });

  it("country and lifecycle bypasses fail closed", async () => {
    expect(() => resolvePackageForContext({ context: { countryOfCare: { countryCode: "CO", source: "authorized-scope", contextVersion: "v1" }, contextVersion: "v1", timeZone: "UTC", serverInstant: new Date() }, domain: "growth", locale: "es-CO", artifactSchemaVersion: "1", policy: { domain: "growth", globalAllowed: false }, requestedCountry: "US" })).toThrow();
    const service = new ClinicalReleaseService({ activate: async () => { throw new Error("must not apply"); } });
    const plan = { rulePackId: "pack", artifactSha256: digest, algorithmId: "algorithm", approvalId: "approval", domain: "growth", countryCode: "CO", locale: "es-CO", activationAt: "2026-01-01T00:00:00Z", previousReleaseId: null, evidenceSha256: digest, requesterSubject: "subject", requestId: "request", action: "release" as const };
    const evidence = { evalManifestSha256: digest, sourceSetSha256: digest, algorithmTestVectorSha256: digest };
    const preview = service.preview(plan, evidence);
    await expect(service.apply(preview, { plan: { ...plan, countryCode: "US" }, evidence })).rejects.toThrow();
  });

  it("storage path is content addressed and rollback rejects a different country", () => {
    expect(clinicalArtifactPath("growth", "CO", digest)).toBe(`v1/growth/CO/${digest}.json`);
    const service = new ClinicalRollbackService({ activate: async () => { throw new Error("must not apply"); } });
    expect(() => service.preview({ current: { id: "current", rulePackId: "b", artifactSha256: digest, domain: "growth", countryCode: "CO", locale: "es-CO", status: "active", approvalValid: true, artifactValid: true, algorithmValid: true, sourceValid: true }, target: { id: "prior", rulePackId: "a", artifactSha256: digest, domain: "growth", countryCode: "US", locale: "en-US", status: "superseded", approvalValid: true, artifactValid: true, algorithmValid: true, sourceValid: true }, reason: "SAFETY_CORRECTION", requesterSubject: "subject", requestId: "request", activationAt: "2026-01-01T00:00:00Z", approvalId: "approval", algorithmId: "algorithm", evidence: { evalManifestSha256: digest, sourceSetSha256: digest, algorithmTestVectorSha256: digest }, evidenceSha256: digest })).toThrow();
  });
});
