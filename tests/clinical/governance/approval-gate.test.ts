import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildApprovalManifest, hashApprovalManifest, verifyApproval, verifyConveyedApproval, withdrawApproval, ApprovalPolicyError } from "../../../src/clinical/governance/approval-policy";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";

const subject = "00000000-0000-4000-8000-000000000704";
const digest = "a".repeat(64) as Sha256Hex;
const identity = { subject, role: "clinical_approver" as const, displayName: "untrusted-display-name" };
const base = { rulePackId: "00000000-0000-4000-8000-000000000702", artifactSha256: digest, algorithmId: "00000000-0000-4000-8000-000000000701", algorithmImplementationSha256: digest, sourceSetSha256: digest, artifactSchemaVersion: "1", domain: "growth", countryCode: "CO", locale: "es-CO", effectiveFrom: "2026-01-01", effectiveUntil: null };
const manifest = buildApprovalManifest(base);

describe("clinical approval gate", () => {
  it("binds the attestation to the exact manifest and verified subject", () => {
    const { manifestSha256, ...manifestInput } = manifest;
    expect(hashApprovalManifest(manifestInput)).toBe(manifestSha256);
    const attestation = verifyApproval(identity, manifest, { decision: "approved", requestId: "00000000-0000-4000-8000-000000000705", decidedAt: "2026-01-01T00:00:00.000Z", allowedSubjects: [subject] });
    expect(attestation).toMatchObject({ approvalProvenance: "verified_clinical_approver", approverSubject: subject, approverRole: "clinical_approver", conveyanceRecordSha256: null, artifactSha256: digest, decision: "approved" });
  });

  it("records conveyed approval without inventing a personal signature", () => {
    const conveyed = verifyConveyedApproval(manifest, {
      decision: "approved",
      requestId: "00000000-0000-4000-8000-000000000707",
      decidedAt: "2026-08-22T12:00:00.000Z",
      conveyanceRecordSha256: "b".repeat(64) as Sha256Hex,
    });
    expect(conveyed).toMatchObject({
      approvalProvenance: "product_owner_conveyed",
      approverSubject: null,
      approverRole: "clinical_approver",
      conveyanceRecordSha256: "b".repeat(64),
      artifactSha256: digest,
      algorithmImplementationSha256: digest,
      sourceSetSha256: digest,
      manifestSha256: manifest.manifestSha256,
    });
    expect(JSON.stringify(conveyed)).not.toMatch(/signature|signedBy|dr[.]?\s*trujillo/i);
  });

  it("rejects conveyed approval without an exact approval-record digest", () => {
    expect(() => verifyConveyedApproval(manifest, {
      decision: "approved",
      requestId: "00000000-0000-4000-8000-000000000708",
      decidedAt: "2026-08-22T12:00:00.000Z",
      conveyanceRecordSha256: "not-a-digest" as Sha256Hex,
    })).toThrowError(expect.objectContaining({ code: "APPROVAL_INVALID" }));
  });

  it("rejects subject/manifest/request mutations and additive withdrawal", () => {
    expect(() => verifyApproval({ ...identity, subject: "00000000-0000-4000-8000-000000000705" }, manifest, { decision: "approved", requestId: "00000000-0000-4000-8000-000000000705", decidedAt: "2026-01-01T00:00:00.000Z", allowedSubjects: [subject] })).toThrowError(expect.objectContaining({ code: "APPROVER_UNAVAILABLE" }));
    expect(() => verifyApproval(identity, { ...manifest, locale: "en-US" }, { decision: "approved", requestId: "00000000-0000-4000-8000-000000000705", decidedAt: "2026-01-01T00:00:00.000Z", allowedSubjects: [subject] })).toThrowError(ApprovalPolicyError);
    expect(() => verifyApproval(identity, manifest, { decision: "approved", requestId: "not-a-uuid", decidedAt: "2026-01-01T00:00:00.000Z", allowedSubjects: [subject] })).toThrowError(expect.objectContaining({ code: "APPROVAL_INVALID" }));
    const withdrawn = withdrawApproval(identity, manifest, { requestId: "00000000-0000-4000-8000-000000000706", decidedAt: "2026-01-02T00:00:00.000Z", priorAttestationId: "00000000-0000-4000-8000-000000000703", allowedSubjects: [subject] });
    expect(withdrawn).toMatchObject({ decision: "withdrawn", withdrawalOf: "00000000-0000-4000-8000-000000000703" });
  });

  it("does not turn approval into a professional workflow", () => {
    expect(Object.keys(manifest)).not.toContain("caseId");
    expect(Object.keys(manifest)).not.toContain("contactDoctor");
    expect(createHash("sha256").update(manifest.manifestSha256).digest("hex")).toHaveLength(64);
  });
});
