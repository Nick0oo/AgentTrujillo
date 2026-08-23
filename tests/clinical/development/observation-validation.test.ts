import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import {
  validateDevelopmentObservation,
  type DevelopmentObservationValidationContext,
} from "../../../src/clinical/development/observation-validation.ts";

const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);
const APPROVAL_RECORD_DIGEST = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00";

function itemDigest(item: unknown): string {
  return createHash("sha256").update(new TextEncoder().encode(canonicalize(item))).digest("hex");
}

const ageEvidence = {
  ageDays: 182,
  basis: "chronological" as const,
  referenceInstant: "2026-08-22T17:00:00.000Z",
  timeZone: "America/Bogota",
  algorithmVersion: "chronological-age.v1",
  provenance: {
    provenanceType: "system" as const,
    sourceId: "synthetic-age-evidence",
    sourceDigest: DIGEST,
    observedAt: "2026-08-22T16:59:00.000Z",
  },
};

const milestone = {
  id: "reaches-for-toy",
  domain: "gross_motor" as const,
  title: "Reaches toward a toy",
  caregiverCopy: "You may notice the child reaching toward an interesting toy.",
  minAgeDays: 120,
  maxAgeDays: 240,
  provenance: {
    packageId: "development-co-caregiver",
    packageVersion: "1.0.0",
    algorithmVersion: "development-framework.v1",
    fixturesSha256: DIGEST,
    rightsSha256: OTHER_DIGEST,
    jurisdiction: "CO" as const,
    locale: "es-CO",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    translation: "original" as const,
    artifactSha256: DIGEST,
    approvalDigest: OTHER_DIGEST,
    sources: [{
      sourceId: "synthetic-development-source",
      sourceUri: "https://example.invalid/development/source",
      sourceVersion: "2026.1",
      artifactSha256: DIGEST,
      license: "synthetic-test-license",
      retrievedAt: "2026-08-20T12:00:00.000Z",
    }],
  },
};

const context: DevelopmentObservationValidationContext = {
  cutoff: "2026-08-22T17:00:00.000Z",
  timeZone: "America/Bogota",
  ageEvidence,
  milestoneEvidence: {
    audience: "caregiver",
    status: "released",
    current: true,
    revoked: false,
    approvalDigest: milestone.provenance.approvalDigest,
    approvalRecordDigest: APPROVAL_RECORD_DIGEST,
    frameworkId: milestone.provenance.packageId,
    frameworkVersion: milestone.provenance.packageVersion,
    frameworkDigest: milestone.provenance.artifactSha256,
    jurisdiction: "CO",
    locale: "es-CO",
    effectiveFrom: milestone.provenance.effectiveFrom,
    effectiveUntil: milestone.provenance.effectiveUntil,
    itemDigest: itemDigest(milestone),
    item: milestone,
  },
  attachmentProofs: [],
};

const draft = {
  text: "  During  floor play, the caregiver noticed reaching toward a toy.  ",
  date: "2026-08-22",
  domain: "gross_motor" as const,
  source: "guardian" as const,
  milestoneId: milestone.id,
  concern: null,
  attachments: [],
};

describe("development observation validation", () => {
  it("normalizes a neutral observation and creates stable confirmation material and digest", () => {
    const first = validateDevelopmentObservation(draft, context);
    const second = validateDevelopmentObservation({ ...draft, text: "During floor play, the caregiver noticed reaching toward a toy." }, context);

    expect(first).toMatchObject({ ok: true, status: "valid", warnings: [] });
    if (!first.ok || !second.ok) return;
    expect(first.draft).toMatchObject({
      text: "During floor play, the caregiver noticed reaching toward a toy.",
      source: "caregiver",
    });
    expect(first.confirmationMaterial).toEqual(second.confirmationMaterial);
    expect(first.confirmationDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(second.confirmationDigest).toBe(first.confirmationDigest);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("rejects future dates, invalid trusted age evidence, and timezone drift", () => {
    expect(validateDevelopmentObservation({ ...draft, date: "2026-08-23" }, context)).toMatchObject({ ok: false, reasonCode: "DATE_IN_FUTURE" });
    expect(validateDevelopmentObservation({ ...draft, date: "2026-08-22" }, {
      ...context,
      ageEvidence: { ...ageEvidence, referenceInstant: "2026-08-22T16:59:59.000Z" },
    })).toMatchObject({ ok: false, reasonCode: "AGE_EVIDENCE_INVALID" });
    expect(validateDevelopmentObservation({ ...draft, date: "2026-08-22" }, {
      ...context,
      timeZone: "UTC",
    })).toMatchObject({ ok: false, reasonCode: "AGE_EVIDENCE_INVALID" });
  });

  it("rejects strict authority, professional, EAD-3, and clinical-result claims", () => {
    expect(validateDevelopmentObservation({ ...draft, childId: "synthetic-child" }, context)).toMatchObject({ ok: false, reasonCode: "INVALID_DRAFT" });
    expect(validateDevelopmentObservation({ ...draft, milestoneId: "ead3-item-1" }, context)).toMatchObject({ ok: false, reasonCode: "PROFESSIONAL_REFERENCE_FORBIDDEN" });
    expect(validateDevelopmentObservation({ ...draft, text: "The child achieved this milestone." }, context)).toMatchObject({ ok: false, reasonCode: "CLINICAL_CLAIM_FORBIDDEN" });
    expect(validateDevelopmentObservation({ ...draft, text: "The child has developmental delay." }, context)).toMatchObject({ ok: false, reasonCode: "CLINICAL_CLAIM_FORBIDDEN" });
  });

  it("rejects authority and unknown keys in the trusted runtime context", () => {
    for (const key of ["childId", "careSpaceId", "guardianId", "permissions", "countryOfCare", "modelClaim"]) {
      const forgedContext = { ...context, [key]: "forbidden" } as unknown as DevelopmentObservationValidationContext;
      expect(validateDevelopmentObservation(draft, forgedContext), key).toMatchObject({ ok: false, reasonCode: "CONTEXT_INVALID" });
    }
  });

  it("rejects trusted age evidence beyond the pediatric range", () => {
    const overRange = {
      ...context,
      ageEvidence: { ...ageEvidence, ageDays: 18 * 366 + 1 },
    } as unknown as DevelopmentObservationValidationContext;
    expect(validateDevelopmentObservation(draft, overRange)).toMatchObject({ ok: false, reasonCode: "CONTEXT_INVALID" });
  });

  it("requires an exact caregiver milestone domain and trusted age window", () => {
    expect(validateDevelopmentObservation({ ...draft, domain: "language" }, context)).toMatchObject({ ok: false, reasonCode: "MILESTONE_DOMAIN_MISMATCH" });
    expect(validateDevelopmentObservation({ ...draft }, {
      ...context,
      ageEvidence: { ...ageEvidence, ageDays: 300 },
    })).toMatchObject({ ok: false, reasonCode: "MILESTONE_AGE_OUT_OF_WINDOW" });
    expect(validateDevelopmentObservation({ ...draft, milestoneId: "unknown-caregiver-item" }, { ...context, milestoneEvidence: null })).toMatchObject({ ok: false, reasonCode: "MILESTONE_UNAVAILABLE" });
  });

  it("accepts only private non-rejected attachments and sorts them", () => {
    const attachments = [
      { bucket: "clinical-attachments" as const, objectPath: "opaque/observation/b.png", digest: OTHER_DIGEST, mime: "image/png" as const, size: 20, state: "clean" as const },
      { bucket: "clinical-attachments" as const, objectPath: "opaque/observation/a.png", digest: DIGEST, mime: "image/png" as const, size: 10, state: "pending" as const },
    ];
    const attachmentProofs = attachments.map((attachment, index) => ({
      bucket: attachment.bucket,
      objectPath: attachment.objectPath,
      contentDigest: attachment.digest,
      mime: attachment.mime,
      size: attachment.size,
      state: attachment.state,
      status: "authorized_private" as const,
      current: true as const,
      revoked: false as const,
      authorizationProofSha256: `${index === 0 ? "c" : "d"}`.repeat(64),
      scopeProofSha256: `${index === 0 ? "e" : "f"}`.repeat(64),
    }));
    const attachmentContext = { ...context, attachmentProofs };
    const accepted = validateDevelopmentObservation({ ...draft, attachments }, attachmentContext);
    expect(accepted).toMatchObject({ ok: true, warnings: ["attachment_pending"] });
    if (accepted.ok) expect(accepted.draft.attachments?.map((item) => item.objectPath)).toEqual(["opaque/observation/a.png", "opaque/observation/b.png"]);
    expect(validateDevelopmentObservation({ ...draft, attachments: [{ ...attachments[0], state: "rejected" as const }] }, { ...context, attachmentProofs: [attachmentProofs[0]] })).toMatchObject({ ok: false, reasonCode: "ATTACHMENT_INVALID" });
    expect(validateDevelopmentObservation({ ...draft, attachments: [{ ...attachments[0], objectPath: "https://example.invalid/file" }] }, { ...context, attachmentProofs: [attachmentProofs[0]] })).toMatchObject({ ok: false, reasonCode: "INVALID_DRAFT" });
  });

  it("preserves explicitly attributed diagnostic wording only as a quoted caregiver warning", () => {
    const quoted = validateDevelopmentObservation({ ...draft, text: 'The caregiver reported: "a doctor mentioned developmental delay".' }, context);
    expect(quoted).toMatchObject({ ok: true, warnings: ["quoted_clinical_language_neutral"] });
    if (quoted.ok) expect(quoted.draft.text).toContain("developmental delay");
    expect(validateDevelopmentObservation({ ...draft, text: "The doctor confirmed developmental delay." }, context)).toMatchObject({ ok: false, reasonCode: "CLINICAL_CLAIM_FORBIDDEN" });
  });

  it("rejects confirmation digest drift and conflicting trusted aliases", () => {
    expect(validateDevelopmentObservation({ ...draft, confirmationDigest: DIGEST }, context)).toMatchObject({ ok: false, reasonCode: "INVALID_DRAFT" });
    expect(validateDevelopmentObservation(draft, { ...context, expectedConfirmationDigest: OTHER_DIGEST })).toMatchObject({ ok: false, reasonCode: "DIGEST_DRIFT" });
    expect(validateDevelopmentObservation(draft, { ...context, childId: "synthetic-child" } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "CONTEXT_INVALID" });
  });

  it("rejects bounded-note overflow, invisible Unicode, and unknown domains", () => {
    expect(validateDevelopmentObservation({ ...draft, text: "x".repeat(1_001) }, context)).toMatchObject({ ok: false, reasonCode: "INVALID_DRAFT" });
    expect(validateDevelopmentObservation({ ...draft, text: "noticed\u200B reaching" }, context)).toMatchObject({ ok: false, reasonCode: "TEXT_INVALID" });
    expect(validateDevelopmentObservation({ ...draft, domain: "screening" }, context)).toMatchObject({ ok: false, reasonCode: "INVALID_DRAFT" });
  });

  it("rejects deterministic interpretation and reassurance language in English and Spanish", () => {
    for (const text of [
      "The child has language delay.",
      "The child has ADHD.",
      "The child has cerebral palsy.",
      "The child has a developmental disorder.",
      "The child is normal and on track.",
      "The child is advanced with no regression.",
      "El niño tiene retraso del desarrollo.",
      "El niño tiene TDAH.",
      "El niño tiene parálisis cerebral.",
      "El niño tiene un trastorno del desarrollo.",
      "El desarrollo está adelantado y normal.",
    ]) {
      expect(validateDevelopmentObservation({ ...draft, text }, context), text).toMatchObject({ ok: false, reasonCode: "CLINICAL_CLAIM_FORBIDDEN" });
    }
  });

  it("rejects malformed calendar dates in cutoff, reference, and observed instants", () => {
    expect(validateDevelopmentObservation(draft, { ...context, cutoff: "2026-02-30T17:00:00.000Z" } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "CONTEXT_INVALID" });
    expect(validateDevelopmentObservation(draft, { ...context, ageEvidence: { ...ageEvidence, referenceInstant: "2026-02-30T17:00:00.000Z" } } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "CONTEXT_INVALID" });
    expect(validateDevelopmentObservation(draft, { ...context, ageEvidence: { ...ageEvidence, provenance: { ...ageEvidence.provenance, observedAt: "2026-02-30T16:59:00.000Z" } } } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "CONTEXT_INVALID" });
  });

  it("requires released approval-bound milestone evidence and scans its content", () => {
    expect(validateDevelopmentObservation(draft, { ...context, milestoneEvidence: { ...context.milestoneEvidence!, approvalRecordDigest: OTHER_DIGEST } } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "CONTEXT_INVALID" });
    expect(validateDevelopmentObservation(draft, { ...context, milestoneEvidence: { ...context.milestoneEvidence!, approvalDigest: APPROVAL_RECORD_DIGEST } } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "MILESTONE_UNAVAILABLE" });
    expect(validateDevelopmentObservation(draft, { ...context, milestoneEvidence: { ...context.milestoneEvidence!, item: { ...milestone, title: "Reaches toward a different toy" } } } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "MILESTONE_UNAVAILABLE" });
    expect(validateDevelopmentObservation(draft, { ...context, milestoneEvidence: { ...context.milestoneEvidence!, item: { ...milestone, title: "Normal speech" } } } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "MILESTONE_UNAVAILABLE" });
    expect(validateDevelopmentObservation(draft, { ...context, milestoneEvidence: { ...context.milestoneEvidence!, frameworkDigest: OTHER_DIGEST } } as unknown as DevelopmentObservationValidationContext)).toMatchObject({ ok: false, reasonCode: "MILESTONE_UNAVAILABLE" });
  });

  it("binds provenance and private attachment proof digests deterministically", () => {
    const attachments = [
      { bucket: "clinical-attachments" as const, objectPath: "opaque/z.png", digest: OTHER_DIGEST, mime: "image/png" as const, size: 20, state: "clean" as const },
      { bucket: "clinical-attachments" as const, objectPath: "opaque/a.png", digest: DIGEST, mime: "image/png" as const, size: 10, state: "clean" as const },
    ];
    const proofs = attachments.map((attachment, index) => ({
      bucket: attachment.bucket, objectPath: attachment.objectPath, contentDigest: attachment.digest,
      mime: attachment.mime, size: attachment.size, state: attachment.state,
      status: "authorized_private" as const, current: true as const, revoked: false as const,
      authorizationProofSha256: `${index === 0 ? "c" : "d"}`.repeat(64), scopeProofSha256: `${index === 0 ? "e" : "f"}`.repeat(64),
    }));
    const first = validateDevelopmentObservation({ ...draft, attachments }, { ...context, attachmentProofs: proofs });
    const second = validateDevelopmentObservation({ ...draft, attachments: [...attachments].reverse() }, { ...context, attachmentProofs: [...proofs].reverse() });
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (first.ok && second.ok) expect(second.confirmationDigest).toBe(first.confirmationDigest);
    expect(validateDevelopmentObservation({ ...draft, attachments }, context)).toMatchObject({ ok: false, reasonCode: "ATTACHMENT_INVALID" });
    expect(validateDevelopmentObservation({ ...draft, attachments }, { ...context, attachmentProofs: [{ ...proofs[0], contentDigest: DIGEST }, proofs[1]] })).toMatchObject({ ok: false, reasonCode: "ATTACHMENT_INVALID" });
    expect(validateDevelopmentObservation({ ...draft, attachments }, { ...context, attachmentProofs: [{ ...proofs[0], mime: "image/jpeg" as const }, proofs[1]] })).toMatchObject({ ok: false, reasonCode: "ATTACHMENT_INVALID" });
    expect(validateDevelopmentObservation({ ...draft, attachments }, { ...context, attachmentProofs: [{ ...proofs[0], objectPath: "foreign/other.png" }, proofs[1]] })).toMatchObject({ ok: false, reasonCode: "ATTACHMENT_INVALID" });
    const drifted = {
      ...context,
      milestoneEvidence: {
        ...context.milestoneEvidence!,
        frameworkDigest: OTHER_DIGEST,
        item: { ...milestone, provenance: { ...milestone.provenance, artifactSha256: OTHER_DIGEST } },
        itemDigest: itemDigest({ ...milestone, provenance: { ...milestone.provenance, artifactSha256: OTHER_DIGEST } }),
      },
      attachmentProofs: proofs,
    } as unknown as DevelopmentObservationValidationContext;
    const driftedResult = validateDevelopmentObservation({ ...draft, attachments }, drifted);
    expect(driftedResult).toMatchObject({ ok: true });
    if (first.ok && driftedResult.ok) expect(driftedResult.confirmationDigest).not.toBe(first.confirmationDigest);
  });
});
