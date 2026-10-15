import { describe, expect, it } from "vitest";

import {
  DEFAULT_DOCUMENT_UPLOAD_POLICY,
  evaluateUploadMetadata,
} from "../../../src/clinical/documents/upload-policy.ts";

const DIGEST = "a".repeat(64);
const valid = {
  purpose: "vaccine_record" as const,
  fileName: "  Carnet de vacunación.pdf  ",
  declaredMimeType: "application/pdf",
  sizeBytes: 1024,
  checksum: { algorithm: "sha256" as const, value: DIGEST },
  consent: { granted: true as const, purpose: "document_upload" as const },
  retentionClass: "child_record" as const,
};

describe("document upload metadata policy", () => {
  it("normalizes a safe display name and assigns the private bucket", () => {
    expect(evaluateUploadMetadata(valid, DEFAULT_DOCUMENT_UPLOAD_POLICY, new Date("2026-08-23T12:00:00Z"))).toEqual({
      ok: true,
      status: "allowed",
      metadata: {
        purpose: "vaccine_record",
        displayName: "Carnet de vacunación.pdf",
        bucket: "vaccine-documents",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        sha256: DIGEST,
        retentionClass: "child_record",
        policyVersion: "document-upload.v1",
      },
    });
  });

  it("accepts the public upload envelope idempotency key while evaluating metadata", () => {
    expect(evaluateUploadMetadata({ ...valid, idempotencyKey: "upload-1" }, DEFAULT_DOCUMENT_UPLOAD_POLICY, new Date("2026-08-23T12:00:00Z"))).toMatchObject({
      ok: true,
      status: "allowed",
      metadata: { displayName: "Carnet de vacunación.pdf", bucket: "vaccine-documents" },
    });
  });

  it.each([
    [{ ...valid, fileName: "record.pdf.exe" }, "SUSPICIOUS_FILE_NAME"],
    [{ ...valid, fileName: "../record.pdf" }, "SUSPICIOUS_FILE_NAME"],
    [{ ...valid, fileName: "record\u0000.pdf" }, "SUSPICIOUS_FILE_NAME"],
    [{ ...valid, declaredMimeType: "image/png" }, "MIME_EXTENSION_MISMATCH"],
    [{ ...valid, sizeBytes: 0 }, "INVALID_SIZE"],
    [{ ...valid, sizeBytes: 10_000_001 }, "INVALID_SIZE"],
    [{ ...valid, purpose: "generated_report" }, "PURPOSE_NOT_ALLOWED"],
    [{ ...valid, retentionClass: "ephemeral_upload" }, "RETENTION_NOT_ALLOWED"],
    [{ ...valid, consent: { granted: false, purpose: "document_upload" } }, "CONSENT_REQUIRED"],
  ] as const)("rejects invalid or suspicious metadata %#", (input, reason) => {
    expect(evaluateUploadMetadata(input, DEFAULT_DOCUMENT_UPLOAD_POLICY, new Date("2026-08-23T12:00:00Z"))).toEqual({
      ok: false,
      status: "rejected",
      reasons: [reason],
    });
  });

  it("fails closed when the policy is unavailable, revoked, or outside its window", () => {
    expect(evaluateUploadMetadata(valid, null, new Date("2026-08-23T12:00:00Z"))).toMatchObject({ reasons: ["POLICY_UNAVAILABLE"] });
    expect(evaluateUploadMetadata(valid, { ...DEFAULT_DOCUMENT_UPLOAD_POLICY, status: "revoked" }, new Date("2026-08-23T12:00:00Z"))).toMatchObject({ reasons: ["POLICY_REVOKED"] });
    expect(evaluateUploadMetadata(valid, DEFAULT_DOCUMENT_UPLOAD_POLICY, new Date("2027-08-23T12:00:00Z"))).toMatchObject({ reasons: ["POLICY_OUTSIDE_EFFECTIVE_WINDOW"] });
  });

  it("rejects caller authority and path injection before any reservation exists", () => {
    for (const injected of [
      { bucket: "vaccine-documents" },
      { objectPath: "care/child/chosen" },
      { childId: "00000000-0000-4000-8000-000000000001" },
      { careSpaceId: "00000000-0000-4000-8000-000000000002" },
      { countryOfCare: "US" },
    ]) {
      expect(evaluateUploadMetadata({ ...valid, ...injected }, DEFAULT_DOCUMENT_UPLOAD_POLICY, new Date("2026-08-23T12:00:00Z"))).toMatchObject({
        ok: false,
        reasons: ["INVALID_INPUT"],
      });
    }
  });
});
